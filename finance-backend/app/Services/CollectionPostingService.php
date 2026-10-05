<?php
namespace App\Services;

use App\Models\{AccountsReceivable, AuditLog, ChartOfAccount, Collection, JournalEntry, Setting, User};
use App\Support\Money;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Called inside the collection row lock and its enclosing transaction. */
class CollectionPostingService
{
    private function fail(string $message): never { throw ValidationException::withMessages(['posting' => $message]); }

    public function assertOpen($date): void
    {
        if (!$date) $this->fail('A posting date is required.');
        $date = Carbon::parse($date)->startOfDay();
        // Lock the configuration while posting, so a cutoff cannot change mid-entry.
        $settings = Setting::query()->orderBy('id')->lockForUpdate()->first();
        if ($date->gt(today())) $this->fail('Future-dated collections and deposits cannot be posted.');
        if ($settings?->collection_closed_through && $date->lte(Carbon::parse($settings->collection_closed_through))) {
            $this->fail('This collection posting date is in a closed period. Review the collection posting cutoff in Settings; dates are never shifted automatically.');
        }
    }

    private function holdingAccount(): ChartOfAccount
    {
        $settings = Setting::query()->orderBy('id')->lockForUpdate()->first();
        $account = $settings?->undeposited_funds_account_id
            ? ChartOfAccount::find($settings->undeposited_funds_account_id)
            : ChartOfAccount::where('account_name', 'Undeposited Funds')->first();
        if (!$account || !$account->is_active || $account->account_type !== 'Asset') {
            $this->fail('Select an active Undeposited Funds asset account in Settings before verifying collections.');
        }
        return $account;
    }

    private function entry(Collection $c, User $actor, string $stage, $date, int $debit, int $credit): JournalEntry
    {
        $this->assertOpen($date);
        if ($debit === $credit) $this->fail('The holding, receivable, and bank accounts must be different.');
        $number = 'JE-COL-'.$c->id.'-'.$stage;
        if (JournalEntry::withTrashed()->where('transaction_no', $number)->exists()) $this->fail('This collection stage has already been posted.');
        $entry = JournalEntry::create(['transaction_no'=>$number,'transaction_date'=>$date,
            'description'=>'Collection '.$c->receipt_number.' - '.$stage,'status'=>'Posted',
            'posted_by'=>$actor->id,'posted_at'=>now(),'created_by'=>$actor->id]);
        $entry->lines()->createMany([
            ['account_id'=>$debit,'debit'=>$c->amount_received,'credit'=>'0.00','reference_type'=>'Collections','reference_id'=>$c->id,'remarks'=>$stage],
            ['account_id'=>$credit,'debit'=>'0.00','credit'=>$c->amount_received,'reference_type'=>'Collections','reference_id'=>$c->id,'remarks'=>$stage],
        ]);
        AuditLog::create(['user_id'=>$actor->id,'module'=>'Collections','action'=>'update','record_id'=>$c->id,
            'activity_description'=>'Posted '.$number,'new_values'=>['journal_entry_id'=>$entry->id,'posting_date'=>Carbon::parse($date)->toDateString(),'stage'=>$stage],
            'ip_address'=>request()->ip(),'user_agent'=>request()->userAgent()]);
        return $entry;
    }

    public function receipt(Collection $c, User $actor, bool $checkCleared): JournalEntry
    {
        if ($c->receipt_journal_entry_id) $this->fail('This receipt has already been verified.');
        if ($c->status !== Collection::STATUS_PENDING) $this->fail('Only pending receipts may be verified.');
        if ((int)$c->created_by === (int)$actor->id) $this->fail('Another administrator must verify a receipt you recorded.');
        if (strcasecmp($c->payment_method, 'Check') === 0 && !$checkCleared) $this->fail('Verify bank clearance before posting a check receipt. An uncleared or bounced check must not settle the invoice.');
        $this->assertOpen($c->collection_date);
        $ar = AccountsReceivable::withTrashed()->lockForUpdate()->findOrFail($c->ar_id);
        if ($ar->status === 'Cancelled' || Money::comp($c->amount_received, $ar->remaining_balance) > 0 || Money::comp($c->amount_received, '0') <= 0) {
            $this->fail('The receipt must be positive and cannot exceed an active invoice balance.');
        }
        $control = ChartOfAccount::arControlAccount();
        if (!$control || !$control->is_active || $control->account_type !== 'Asset') $this->fail('An active Accounts Receivable control asset account is required.');
        $holding = $this->holdingAccount();
        $entry = $this->entry($c, $actor, 'RECEIPT', $c->collection_date, $holding->id, $control->id);
        $remaining = Money::sub($ar->remaining_balance, $c->amount_received);
        $ar->update(['paid_amount'=>Money::add($ar->paid_amount, $c->amount_received),'remaining_balance'=>$remaining,
            'status'=>Money::comp($remaining,'0') === 0 ? 'Paid' : 'Partially Paid']);
        $c->update(['receipt_journal_entry_id'=>$entry->id,'receipt_verified_by'=>$actor->id,'receipt_verified_at'=>now()]);
        return $entry;
    }

    public function deposit(Collection $c, User $actor): JournalEntry
    {
        if (!$c->receipt_journal_entry_id || $c->deposit_journal_entry_id) $this->fail('Verify the receipt once before posting its deposit.');
        if (!$c->deposit_date || $c->deposit_date->lt($c->collection_date)) $this->fail('Deposit date must be on or after the collection date.');
        $c->loadMissing('cashAccount');
        $code = preg_replace('/^CA-/', '', $c->cashAccount->account_code);
        $bank = ChartOfAccount::where('account_code',$code)->where('is_active',true)->where('account_type','Asset')->first();
        if (!$bank) $this->fail('The selected bank needs an active matching asset account in the chart of accounts.');
        // Use the account actually debited at receipt time, even after settings change.
        $holdingId = JournalEntry::findOrFail($c->receipt_journal_entry_id)->lines()->where('debit','>',0)->value('account_id');
        $entry = $this->entry($c,$actor,'DEPOSIT',$c->deposit_date,$bank->id,$holdingId);
        $c->update(['deposit_journal_entry_id'=>$entry->id,'confirmed_at'=>now()]);
        return $entry;
    }

    public function reverseReceipt(Collection $c, User $actor, ?string $reason): void
    {
        if (!$c->receipt_journal_entry_id) return;
        if ($c->deposit_journal_entry_id || $c->reversal_journal_entry_id) $this->fail('A deposited or reversed receipt cannot be cancelled through this action.');
        if (!trim($reason ?? '')) $this->fail('A reason is required to reverse a verified receipt.');
        $ar = AccountsReceivable::query()->lockForUpdate()->findOrFail($c->ar_id);
        $lines = JournalEntry::findOrFail($c->receipt_journal_entry_id)->lines;
        $entry = $this->entry($c,$actor,'REVERSAL',today(),$lines->firstWhere('credit','>',0)->account_id,$lines->firstWhere('debit','>',0)->account_id);
        $paid = Money::sub($ar->paid_amount,$c->amount_received);
        if (Money::comp($paid,'0') < 0) $this->fail('The invoice balance is inconsistent; review it before reversing this receipt.');
        $ar->update(['paid_amount'=>$paid,'remaining_balance'=>Money::add($ar->remaining_balance,$c->amount_received),
            'status'=>Money::comp($paid,'0') > 0 ? 'Partially Paid' : 'Pending']);
        $c->update(['reversal_journal_entry_id'=>$entry->id]);
    }
}
