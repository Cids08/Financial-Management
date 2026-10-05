<?php
namespace App\Services;
use App\Models\{DepositBatch, Collection, AccountsReceivable, AuditLog, User};
use App\Support\Money;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class DepositBatchService {
    public function __construct(private CollectionService $collections) {}
    private function fail(string $message): never { throw ValidationException::withMessages(['batch'=>$message]); }
    private function audit(DepositBatch $batch, User $actor, string $action, array $values): void {
        AuditLog::create(['user_id'=>$actor->id,'module'=>'Collections','action'=>$action,'record_id'=>$batch->id,'activity_description'=>ucfirst($action).' deposit batch '.$batch->batch_number,'new_values'=>$values,'ip_address'=>request()->ip(),'user_agent'=>request()->userAgent()]);
    }
    public function create(array $data, User $actor): DepositBatch {
        return DB::transaction(function () use ($data,$actor) {
            $rows=Collection::whereIn('id',$data['collection_ids'])->orderBy('id')->lockForUpdate()->get();
            if ($rows->count() !== count($data['collection_ids'])) $this->fail('Some receipts are unavailable. Refresh the list.');
            // Serialize reference checks on the account after locking member receipts.
            $account=\App\Models\CashAccount::lockForUpdate()->find($data['cash_account_id']);
            if (!$account || $account->status !== 'Active') $this->fail('Choose an active deposit account.');
            $reference=strtoupper(trim($data['bank_reference']));
            if (DepositBatch::where('cash_account_id',$account->id)->where('bank_reference',$reference)->where('status','!=','Cancelled')->exists()) $this->fail('This bank deposit reference already belongs to a batch.');
            $snapshot=[]; $total='0.00';
            foreach ($rows as $row) {
                if ($row->status !== 'Pending' || (int)$row->cash_account_id !== (int)$data['cash_account_id']) $this->fail('Select only unconfirmed receipts for the same deposit account.');
                if ($row->collection_date->toDateString() > $data['deposit_date']) $this->fail('Deposit date cannot precede a receipt date.');
                if ($row->deposit_date && $row->deposit_date->toDateString() !== $data['deposit_date']) $this->fail('A receipt already has a different deposit date. Correct it before batching.');
                if (DB::table('deposit_batch_items')->where('collection_id',$row->id)->exists()) $this->fail('A selected receipt already belongs to another batch.');
                $total=Money::add($total,$row->amount_received);
                $snapshot[]=['id'=>$row->id,'receipt_number'=>$row->receipt_number,'ar_id'=>$row->ar_id,'amount'=>$row->amount_received,'payment_method'=>$row->payment_method,'collector_id'=>$row->collector_id,'created_by'=>$row->created_by];
            }
            $batch=DepositBatch::create(['batch_number'=>'DEP-'.now()->format('Ymd').'-'.strtoupper(Str::random(8)), 'cash_account_id'=>$data['cash_account_id'],'deposit_date'=>$data['deposit_date'],'bank_reference'=>strtoupper(trim($data['bank_reference'])),'deposit_amount'=>$data['deposit_amount'],'receipt_total'=>$total,'receipt_snapshot'=>$snapshot,'prepared_by'=>$actor->id,'status'=>'Pending']);
            foreach ($rows as $row) DB::table('deposit_batch_items')->insert(['deposit_batch_id'=>$batch->id,'collection_id'=>$row->id]);
            $this->audit($batch,$actor,'prepare',['batch_number'=>$batch->batch_number,'receipt_total'=>$total,'deposit_amount'=>$batch->deposit_amount,'collection_ids'=>$rows->pluck('id')->all()]);
            return $batch;
        });
    }
    public function confirm(DepositBatch $batch, User $actor, bool $checksCleared): DepositBatch {
        return DB::transaction(function () use ($batch,$actor,$checksCleared) {
            $batch=DepositBatch::lockForUpdate()->findOrFail($batch->id);
            if ($batch->status !== 'Pending') $this->fail('This batch has already been processed.');
            if ((int)$batch->prepared_by === (int)$actor->id) $this->fail('Another administrator must confirm a batch you prepared.');
            if (Money::comp($batch->receipt_total,$batch->deposit_amount)!==0) $this->fail('Deposit amount does not match the receipt total. Cancel and prepare a corrected batch.');
            if (!$batch->documents()->whereNotNull('storage_path')->exists()) $this->fail('Attach the bank deposit evidence before confirmation.');
            $ids=DB::table('deposit_batch_items')->where('deposit_batch_id',$batch->id)->pluck('collection_id');
            $rows=Collection::whereIn('id',$ids)->orderBy('id')->lockForUpdate()->get();
            if ($rows->count() !== count($batch->receipt_snapshot)) $this->fail('A receipt is missing or archived. Review the batch.');
            foreach ($batch->receipt_snapshot as $saved) {
                $row=$rows->firstWhere('id',$saved['id']);
                if (!$row || $row->status !== 'Pending' || (int)$row->cash_account_id !== (int)$batch->cash_account_id || $row->receipt_number !== $saved['receipt_number'] || Money::comp($row->amount_received,$saved['amount'])!==0 || (int)$row->ar_id !== (int)$saved['ar_id'] || $row->payment_method !== $saved['payment_method'] || (int)$row->collector_id !== (int)$saved['collector_id']) $this->fail('A receipt changed after preparation. Cancel and prepare a corrected batch.');
                if ((int)$row->created_by === (int)$actor->id) $this->fail('You cannot confirm a batch containing a receipt you recorded.');
                if ($row->collection_date->gt($batch->deposit_date) || ($row->deposit_date && !$row->deposit_date->isSameDay($batch->deposit_date))) $this->fail('Receipt and batch deposit dates no longer agree.');
                if (strcasecmp($row->payment_method,'Check')===0 && !$checksCleared) $this->fail('Verify bank clearance for every check in this batch.');
            }
            // Lock invoice totals in a stable order before posting any member.
            $invoices=AccountsReceivable::withTrashed()->whereIn('id',$rows->pluck('ar_id')->unique())->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            foreach ($rows->groupBy('ar_id') as $id=>$group) {
                $sum=$group->filter(fn($r)=>!$r->receipt_journal_entry_id)->reduce(fn($sum,$r)=>Money::add($sum,$r->amount_received),'0.00');
                if (!isset($invoices[$id]) || $invoices[$id]->status === 'Cancelled' || Money::comp($sum,$invoices[$id]->remaining_balance)>0) $this->fail('Batch receipts exceed an invoice balance or reference an unavailable invoice.');
            }
            foreach ($rows as $row) {
                $row->update(['deposit_date'=>$batch->deposit_date]);
                $this->collections->confirm($row,$actor,$checksCleared,$batch->id);
            }
            $batch->update(['status'=>'Confirmed','confirmed_by'=>$actor->id,'confirmed_at'=>now()]);
            $this->audit($batch,$actor,'confirm_batch',['batch_number'=>$batch->batch_number,'receipt_total'=>$batch->receipt_total,'checks_cleared'=>$checksCleared,'bank_verified'=>true]);
            return $batch;
        });
    }
    public function cancel(DepositBatch $batch, User $actor, string $reason): DepositBatch {
        return DB::transaction(function () use ($batch,$actor,$reason) {
            $batch=DepositBatch::lockForUpdate()->findOrFail($batch->id);
            if ($batch->status !== 'Pending') $this->fail('Only pending batches can be cancelled.');
            abort_unless((int)$batch->prepared_by===(int)$actor->id || $actor->hasPermission('collections.confirm'),403);
            $batch->update(['status'=>'Cancelled','cancellation_reason'=>$reason]);
            DB::table('deposit_batch_items')->where('deposit_batch_id',$batch->id)->delete();
            $this->audit($batch,$actor,'cancel_batch',['reason'=>$reason,'batch_number'=>$batch->batch_number]);
            return $batch;
        });
    }
}
