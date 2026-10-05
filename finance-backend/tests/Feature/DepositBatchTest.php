<?php
namespace Tests\Feature;
use App\Models\{Collection,DepositBatch,User};
use App\Services\{CollectionService,DepositBatchService};
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{DB,Schema};
use Illuminate\Validation\ValidationException;
class DepositBatchTest extends TestCase {
 public function createApplication(){ $app=require __DIR__.'/../../bootstrap/app.php'; $app->make(Kernel::class)->bootstrap(); return $app; }
 protected function setUp(): void {parent::setUp();config(['database.default'=>'sqlite','database.connections.sqlite.database'=>':memory:','database.connections.sqlite.foreign_key_constraints'=>true]);DB::purge('sqlite');
 Schema::create('users',fn(Blueprint $t)=>$t->id());DB::table('users')->insert([['id'=>1],['id'=>2],['id'=>3]]);
 Schema::create('cash_accounts',function(Blueprint $t){$t->id();$t->string('status');$t->softDeletes();});DB::table('cash_accounts')->insert([['id'=>1,'status'=>'Active'],['id'=>2,'status'=>'Active']]);
 Schema::create('accounts_receivable',function(Blueprint $t){$t->id();$t->string('status');$t->decimal('remaining_balance',15,2);$t->boolean('is_archived')->default(false);$t->softDeletes();});DB::table('accounts_receivable')->insert(['id'=>1,'status'=>'Pending','remaining_balance'=>500]);
 Schema::create('collections',function(Blueprint $t){$t->id();$t->integer('ar_id');$t->integer('cash_account_id');$t->integer('collector_id')->nullable();$t->integer('created_by');$t->string('receipt_number');$t->string('status');$t->string('payment_method');$t->date('collection_date');$t->date('deposit_date')->nullable();$t->decimal('amount_received',15,2);$t->timestamps();$t->softDeletes();});
 foreach([1,2] as $id)DB::table('collections')->insert(['id'=>$id,'ar_id'=>1,'cash_account_id'=>1,'created_by'=>3,'receipt_number'=>'BOOK-'.$id,'status'=>'Pending','payment_method'=>'Cash','collection_date'=>'2026-10-01','amount_received'=>100]);
 Schema::create('supporting_documents',function(Blueprint $t){$t->id();$t->string('reference_type');$t->integer('reference_id');$t->string('storage_path')->nullable();});
 Schema::create('audit_logs',function(Blueprint $t){$t->id();$t->integer('user_id');$t->string('module');$t->string('action');$t->integer('record_id');$t->text('activity_description');$t->text('new_values')->nullable();$t->text('old_values')->nullable();$t->string('ip_address')->nullable();$t->text('user_agent')->nullable();$t->timestamps();});
 (require __DIR__.'/../../database/migrations/2026_10_04_180000_create_deposit_batches.php')->up();
 }
 private function actor($id): User {$u=new User;$u->id=$id;return $u;}
 private function data(array $extra=[]): array {return array_replace(['collection_ids'=>[1,2],'cash_account_id'=>1,'deposit_date'=>'2026-10-02','bank_reference'=>'SLIP-1','deposit_amount'=>'200.00'],$extra);}
 private function service(): DepositBatchService{return new DepositBatchService(\Mockery::mock(CollectionService::class));}
 private function proof($batch):void {DB::table('supporting_documents')->insert(['reference_type'=>'deposit_batch','reference_id'=>$batch->id,'storage_path'=>'proof.pdf']);}
 private function rejected(callable $action):void {try{$action();$this->fail('Expected validation rejection');}catch(ValidationException $e){$this->assertNotEmpty($e->errors());}}
 public function test_preparation_does_not_post_and_cancel_allows_corrected_reference():void {
 $s=$this->service();$b=$s->create($this->data(),$this->actor(1));$this->assertSame('200.00',$b->receipt_total);$this->assertEquals(2,DB::table('collections')->where('status','Pending')->count());$this->assertEquals(500,DB::table('accounts_receivable')->value('remaining_balance'));
 $this->rejected(fn()=>$s->create($this->data(['bank_reference'=>'SLIP-2']),$this->actor(1)));
 $s->cancel($b,$this->actor(1),'Correct the entered deposit amount');$this->assertDatabaseCount('deposit_batch_items',0);$this->assertCount(2,$b->fresh()->receipt_snapshot);
 $new=$s->create($this->data(),$this->actor(1));$this->assertNotEquals($b->id,$new->id);
 }
 public function test_cross_account_and_receipt_dates_are_rejected():void {
 $s=$this->service();$this->rejected(fn()=>$s->create($this->data(['cash_account_id'=>2]),$this->actor(1)));$this->rejected(fn()=>$s->create($this->data(['deposit_date'=>'2026-09-30']),$this->actor(1)));$this->assertDatabaseCount('deposit_batches',0);
 }
 public function test_confirmation_requires_independent_reviewer_matching_total_evidence_and_clearance():void {
 $s=$this->service();$b=$s->create($this->data(['deposit_amount'=>'199']),$this->actor(1));$this->rejected(fn()=>$s->confirm($b,$this->actor(2),true));$b->update(['deposit_amount'=>200]);$this->rejected(fn()=>$s->confirm($b,$this->actor(1),true));$this->rejected(fn()=>$s->confirm($b,$this->actor(2),true));$this->proof($b);$this->rejected(fn()=>$s->confirm($b,$this->actor(3),true));
 $s->cancel($b,$this->actor(1),'Recreate as check');DB::table('collections')->where('id',1)->update(['payment_method'=>'Check']);$b=$s->create($this->data(),$this->actor(1));$this->proof($b);$this->rejected(fn()=>$s->confirm($b,$this->actor(2),false));
 }
 public function test_changed_receipts_and_aggregate_overcollection_are_rejected():void {
 $s=$this->service();$b=$s->create($this->data(),$this->actor(1));$this->proof($b);DB::table('collections')->where('id',1)->update(['amount_received'=>110]);$this->rejected(fn()=>$s->confirm($b,$this->actor(2),true));DB::table('collections')->where('id',1)->update(['amount_received'=>100]);DB::table('accounts_receivable')->update(['remaining_balance'=>150]);$this->rejected(fn()=>$s->confirm($b,$this->actor(2),true));$this->assertDatabaseHas('deposit_batches',['id'=>$b->id,'status'=>'Pending']);
 }
 public function test_member_cannot_be_edited_cancelled_or_confirmed_individually():void {
 $b=$this->service()->create($this->data(),$this->actor(1));$s=app(CollectionService::class);$r=Collection::find(1);$this->rejected(fn()=>$s->update($r,['deposit_date'=>'2026-10-02'],$this->actor(2)));$this->rejected(fn()=>$s->cancel($r,$this->actor(2),'wrong'));$this->rejected(fn()=>$s->confirm($r,$this->actor(2),true));
 }
 public function test_batch_confirmation_is_atomic_and_cannot_be_replayed():void {
 $calls=0;$fail=true;$posting=\Mockery::mock(CollectionService::class);$posting->shouldReceive('confirm')->andReturnUsing(function($row,$actor,$cleared,$batchId)use(&$calls,&$fail){$calls++;$row->update(['status'=>'Confirmed']);DB::table('accounts_receivable')->where('id',1)->decrement('remaining_balance',100);if($fail&&$calls===2)throw new \RuntimeException('Posting failed');return $row;});
 $s=new DepositBatchService($posting);$b=$s->create($this->data(),$this->actor(1));$this->proof($b);try{$s->confirm($b,$this->actor(2),true);$this->fail('Expected posting failure');}catch(\RuntimeException $e){$this->assertSame('Posting failed',$e->getMessage());}
 $this->assertEquals(2,DB::table('collections')->where('status','Pending')->whereNull('deposit_date')->count());$this->assertEquals(500,DB::table('accounts_receivable')->value('remaining_balance'));$this->assertSame('Pending',$b->fresh()->status);
 $fail=false;$s->confirm($b,$this->actor(2),true);$this->assertEquals(2,DB::table('collections')->where('status','Confirmed')->count());$this->assertEquals(300,DB::table('accounts_receivable')->value('remaining_balance'));$this->assertSame('Confirmed',$b->fresh()->status);$this->rejected(fn()=>$s->confirm($b,$this->actor(2),true));$this->assertSame(4,$calls);
 }
}
