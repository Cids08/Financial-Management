<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use App\Models\{DepositBatch, SupportingDocument};
use App\Services\DepositBatchService;
use App\Support\FileStorage;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
class DepositBatchController extends Controller {
    public function __construct(private DepositBatchService $service) {}
    private function access(Request $request): void { abort_unless($request->user()->hasAnyRole(['staff','admin','super-admin','Admin','Super Admin']),403); }
    private function present(DepositBatch $batch): array {
        $batch->loadMissing(['preparer','cashAccount']);
        return ['id'=>$batch->id,'batch_number'=>$batch->batch_number,'cash_account_id'=>$batch->cash_account_id,'cash_account_name'=>$batch->cashAccount?->account_name,'deposit_date'=>$batch->deposit_date->toDateString(),'bank_reference'=>$batch->bank_reference,'deposit_amount'=>$batch->deposit_amount,'receipt_total'=>$batch->receipt_total,'receipt_snapshot'=>$batch->receipt_snapshot,'status'=>$batch->status,'prepared_by'=>$batch->prepared_by,'prepared_by_name'=>$batch->preparer?->fullName(),'confirmed_at'=>$batch->confirmed_at,'cancellation_reason'=>$batch->cancellation_reason,'has_proof'=>$batch->documents()->whereNotNull('storage_path')->exists()];
    }
    public function index(Request $request) {
        $this->access($request);
        $query=DepositBatch::with(['preparer','cashAccount'])->orderByDesc('id');
        if(in_array($request->query('status'),['Pending','Confirmed','Cancelled'],true)) $query->where('status',$request->query('status'));
        $page=$query->paginate(10);
        return response()->json(['success'=>true,'data'=>$page->getCollection()->map(fn($b)=>$this->present($b)),'meta'=>['current_page'=>$page->currentPage(),'last_page'=>$page->lastPage(),'total'=>$page->total()]]);
    }
    public function candidates(Request $request) {
        $this->access($request);
        $query=\App\Models\Collection::with(['accountsReceivable','cashAccount'])->where('status','Pending')->whereNotIn('id',DB::table('deposit_batch_items')->select('collection_id'))->orderBy('collection_date')->orderBy('id');
        if ($request->filled('cash_account_id')) $query->where('cash_account_id',$request->integer('cash_account_id'));
        if ($request->filled('search')) $query->where('receipt_number','like','%'.$request->string('search')->toString().'%');
        $page=$query->paginate(20);
        return response()->json(['success'=>true,'data'=>$page->getCollection()->map(fn($r)=>['id'=>$r->id,'receipt_number'=>$r->receipt_number,'invoice_number'=>$r->accountsReceivable?->invoice_number,'amount_received'=>$r->amount_received,'payment_method'=>$r->payment_method,'collection_date'=>$r->collection_date->toDateString(),'deposit_date'=>$r->deposit_date?->toDateString(),'cash_account_id'=>$r->cash_account_id,'cash_account_name'=>$r->cashAccount?->account_name]),'meta'=>['current_page'=>$page->currentPage(),'last_page'=>$page->lastPage(),'total'=>$page->total()]]);
    }
    public function store(Request $request) {
        $this->access($request);
        $request->merge(['bank_reference'=>strtoupper(trim((string)$request->input('bank_reference')))]);
        $data=$request->validate(['cash_account_id'=>['required','integer','exists:cash_accounts,id'],'deposit_date'=>['required','date_format:Y-m-d','before_or_equal:today'],'bank_reference'=>['required','string','max:150',Rule::unique('deposit_batches')->where(fn($q)=>$q->where('cash_account_id',$request->input('cash_account_id'))->where('status','!=','Cancelled'))],'deposit_amount'=>['required','numeric','min:0.01','decimal:0,2'],'collection_ids'=>['required','array','min:1','max:100'],'collection_ids.*'=>['required','integer','distinct','exists:collections,id']]);
        return response()->json(['success'=>true,'data'=>$this->present($this->service->create($data,$request->user()))],201);
    }
    public function confirm(Request $request, DepositBatch $depositBatch) {
        $this->access($request);
        $request->validate(['checks_cleared'=>['sometimes','boolean'],'bank_verified'=>['required','accepted']]);
        return response()->json(['success'=>true,'data'=>$this->present($this->service->confirm($depositBatch,$request->user(),$request->boolean('checks_cleared')))]);
    }
    public function cancel(Request $request, DepositBatch $depositBatch) {
        $this->access($request); $data=$request->validate(['reason'=>['required','string','min:5','max:500']]);
        return response()->json(['success'=>true,'data'=>$this->present($this->service->cancel($depositBatch,$request->user(),$data['reason']))]);
    }
    public function documents(Request $request, DepositBatch $depositBatch) {
        $this->access($request);
        return response()->json(['success'=>true,'data'=>$depositBatch->documents()->with('uploader')->orderByDesc('id')->get()->map(fn($d)=>['id'=>$d->id,'original_name'=>$d->original_name,'file_size'=>$d->file_size,'mime_type'=>$d->mime_type,'uploaded_at'=>$d->uploaded_at,'uploaded_by_name'=>$d->uploader?->fullName(),'has_file'=>(bool)$d->storage_path])]);
    }
    public function upload(Request $request, DepositBatch $depositBatch) {
        $this->access($request); $request->validate(['document'=>['required','file','mimes:pdf,jpg,jpeg,png,webp','max:10240']]);
        DB::transaction(function () use ($request,$depositBatch) {
            $batch=DepositBatch::lockForUpdate()->findOrFail($depositBatch->id);
            abort_unless($batch->status==='Pending',422,'Only pending batches accept evidence.');
            $file=$request->file('document'); $path=$file->store('deposit-batches/'.$batch->id,FileStorage::DISK);
            $batch->documents()->create(['reference_type'=>'deposit_batch','file_name'=>basename($path),'original_name'=>$file->getClientOriginalName(),'storage_path'=>$path,'mime_type'=>$file->getMimeType(),'file_size'=>$file->getSize(),'uploaded_by'=>$request->user()->id,'uploaded_at'=>now()]);
            \App\Models\AuditLog::create(['user_id'=>$request->user()->id,'module'=>'Collections','action'=>'attach_proof','record_id'=>$batch->id,'activity_description'=>'Attached bank evidence to '.$batch->batch_number,'ip_address'=>$request->ip(),'user_agent'=>$request->userAgent()]);
        });
        return response()->json(['success'=>true]);
    }
    public function view(Request $request, DepositBatch $depositBatch, SupportingDocument $document) {
        $this->access($request); abort_unless($document->reference_type==='deposit_batch' && (int)$document->reference_id===(int)$depositBatch->id && $document->storage_path,404);
        return response()->json(['success'=>true,'data'=>['url'=>FileStorage::signedUrl($document->storage_path)]]);
    }
}
