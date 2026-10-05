<?php
namespace Tests\Feature;
use App\Models\{Collection,JournalEntry,Setting,User};
use App\Services\{CollectionService,DepositBatchService};
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{DB,Schema,Event};
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
class CollectionPostingTest extends DepositBatchTest {
 protected function setUp(): void {
  parent::setUp();Carbon::setTestNow('2026-10-05 12:00:00');Event::fake();
  Schema::table('users',function(Blueprint $t){$t->string('first_name')->default('Test');$t->string('last_name')->default('User');$t->integer('role_id')->nullable();$t->softDeletes();});
  Schema::create('roles',function(Blueprint $t){$t->id();$t->string('name');$t->softDeletes();});
  Schema::create('collectors',function(Blueprint $t){$t->id();$t->integer('user_id')->nullable();$t->string('first_name')->nullable();$t->string('last_name')->nullable();$t->softDeletes();});
  Schema::create('notifications',function(Blueprint $t){$t->id();$t->integer('user_id');$t->string('title');$t->text('message');$t->string('type');$t->boolean('is_read');$t->timestamps();});
  Schema::table('cash_accounts',function(Blueprint $t){$t->string('account_code')->default('CA-1010');$t->string('account_name')->default('Bank');$t->decimal('current_balance',15,2)->default(1000);$t->timestamps();});
  Schema::table('accounts_receivable',function(Blueprint $t){$t->string('invoice_number')->default('INV-1');$t->decimal('original_amount',15,2)->default(500);$t->decimal('paid_amount',15,2)->default(0);$t->timestamps();});
  Schema::table('collections',function(Blueprint $t){$t->integer('received_by')->nullable();$t->text('remarks')->nullable();});
  Schema::create('chart_of_accounts',function(Blueprint $t){$t->id();$t->string('account_code')->unique();$t->string('account_name');$t->string('account_type');$t->boolean('is_active');$t->softDeletes();$t->timestamps();});
  foreach([[1,'1010','Bank'],[2,'1100','Accounts Receivable'],[3,'1095','Undeposited Funds'],[4,'1096','Other Holding']] as [$id,$code,$name])DB::table('chart_of_accounts')->insert(['id'=>$id,'account_code'=>$code,'account_name'=>$name,'account_type'=>'Asset','is_active'=>true]);
  Schema::create('settings',function(Blueprint $t){$t->id();$t->integer('ar_control_account_id')->nullable();$t->timestamps();});
  Schema::create('journal_entries',function(Blueprint $t){$t->id();$t->string('transaction_no')->unique();$t->date('transaction_date');$t->text('description');$t->string('status');$t->integer('created_by');$t->integer('posted_by');$t->timestamp('posted_at');$t->timestamps();$t->softDeletes();});
  Schema::create('journal_entry_lines',function(Blueprint $t){$t->id();$t->foreignId('journal_entry_id')->constrained();$t->integer('account_id');$t->decimal('debit',15,2);$t->decimal('credit',15,2);$t->string('reference_type');$t->integer('reference_id');$t->string('remarks');$t->timestamps();});
  (require __DIR__.'/../../database/migrations/2026_10_05_230000_add_collection_posting_stages.php')->up();
  DB::table('settings')->insert(['id'=>1,'ar_control_account_id'=>2,'undeposited_funds_account_id'=>3]);(new \ReflectionProperty(Setting::class,'cachedCurrent'))->setValue(null,null);
  foreach([1,2] as $id)DB::table('supporting_documents')->insert(['reference_type'=>'collection','reference_id'=>$id,'storage_path'=>'receipt.pdf']);
 }
 protected function tearDown(): void {Carbon::setTestNow();(new \ReflectionProperty(Setting::class,'cachedCurrent'))->setValue(null,null);parent::tearDown();}
 private function reviewer(): User {$u=new User;$u->id=2;return $u;}
 private function reject(callable $f):void {try{$f();$this->fail('Expected rejection');}catch(ValidationException $e){$this->assertNotEmpty($e->errors());}}
 public function test_two_stage_posting_dates_balances_and_duplicate_guards():void {
  DB::table('collections')->where('id',1)->update(['collection_date'=>'2026-09-30']);$s=app(CollectionService::class);$r=$s->verifyReceipt(Collection::find(1),$this->reviewer());
  $this->assertEquals(400,DB::table('accounts_receivable')->value('remaining_balance'));$this->assertEquals(1000,DB::table('cash_accounts')->where('id',1)->value('current_balance'));
  $this->assertSame('2026-09-30',JournalEntry::find($r->receipt_journal_entry_id)->transaction_date->toDateString());$this->assertDatabaseHas('journal_entry_lines',['journal_entry_id'=>$r->receipt_journal_entry_id,'account_id'=>3,'debit'=>100]);
  $this->reject(fn()=>$s->verifyReceipt($r,$this->reviewer()));$s->update($r,['deposit_date'=>'2026-10-02'],$this->reviewer());$r=$s->confirm($r->fresh(),$this->reviewer());
  $this->assertEquals(400,DB::table('accounts_receivable')->value('remaining_balance'));$this->assertEquals(1100,DB::table('cash_accounts')->where('id',1)->value('current_balance'));
  $this->assertSame('2026-10-02',JournalEntry::find($r->deposit_journal_entry_id)->transaction_date->toDateString());$this->assertDatabaseHas('journal_entry_lines',['journal_entry_id'=>$r->deposit_journal_entry_id,'account_id'=>3,'credit'=>100]);$this->assertNotNull($r->confirmed_at);
  $this->reject(fn()=>$s->confirm($r,$this->reviewer()));$this->assertDatabaseCount('journal_entries',2);foreach(JournalEntry::all() as $e)$this->assertTrue($e->is_balanced);
 }
 public function test_closed_period_and_failed_deposit_roll_back_all_entries():void {
  DB::table('settings')->update(['collection_closed_through'=>'2026-10-02']);DB::table('collections')->where('id',1)->update(['deposit_date'=>'2026-10-02']);$s=app(CollectionService::class);
  $this->reject(fn()=>$s->confirm(Collection::find(1),$this->reviewer()));$this->assertDatabaseCount('journal_entries',0);
  DB::table('settings')->update(['collection_closed_through'=>null]);DB::table('chart_of_accounts')->where('id',1)->update(['is_active'=>false]);
  $this->reject(fn()=>$s->confirm(Collection::find(1),$this->reviewer()));$this->assertDatabaseCount('journal_entries',0);$this->assertEquals(500,DB::table('accounts_receivable')->value('remaining_balance'));$this->assertEquals(1000,DB::table('cash_accounts')->where('id',1)->value('current_balance'));
 }
 public function test_verified_receipt_is_locked_and_cancellation_reverses_ar():void {
  $s=app(CollectionService::class);$r=$s->verifyReceipt(Collection::find(1),$this->reviewer());$this->reject(fn()=>$s->update($r,['amount_received'=>90],$this->reviewer()));$this->reject(fn()=>$s->cancel($r,$this->reviewer()));$s->cancel($r,$this->reviewer(),'Wrong invoice');
  $this->assertEquals(500,DB::table('accounts_receivable')->value('remaining_balance'));$this->assertNotNull($r->fresh()->reversal_journal_entry_id);$this->assertSame('Cancelled',$r->fresh()->status);
 }
 public function test_uncleared_check_cannot_post_and_bounced_check_can_be_cancelled():void {
  DB::table('collections')->where('id',1)->update(['payment_method'=>'Check']);$s=app(CollectionService::class);$r=Collection::find(1);$this->reject(fn()=>$s->verifyReceipt($r,$this->reviewer()));$s->cancel($r,$this->reviewer(),'Bounced check');$this->assertDatabaseCount('journal_entries',0);
 }
 public function test_mixed_batch_settles_ar_once_and_deposits_both_receipts():void {
  app(CollectionService::class)->verifyReceipt(Collection::find(1),$this->reviewer());DB::table('accounts_receivable')->update(['remaining_balance'=>100,'paid_amount'=>400]);$actor=new User;$actor->id=1;$s=app(DepositBatchService::class);
  $b=$s->create(['collection_ids'=>[1,2],'cash_account_id'=>1,'deposit_date'=>'2026-10-02','bank_reference'=>'MIXED','deposit_amount'=>200],$actor);DB::table('supporting_documents')->insert(['reference_type'=>'deposit_batch','reference_id'=>$b->id,'storage_path'=>'deposit.pdf']);$s->confirm($b,$this->reviewer(),true);
  $this->assertEquals(0,DB::table('accounts_receivable')->value('remaining_balance'));$this->assertEquals(1200,DB::table('cash_accounts')->where('id',1)->value('current_balance'));$this->assertDatabaseCount('journal_entries',4);
 }
 public function test_deposit_uses_original_holding_account_even_after_settings_change():void {
  $s=app(CollectionService::class);$r=$s->verifyReceipt(Collection::find(1),$this->reviewer());DB::table('settings')->update(['undeposited_funds_account_id'=>4]);$s->update($r,['deposit_date'=>'2026-10-02'],$this->reviewer());$r=$s->confirm($r->fresh(),$this->reviewer());$this->assertDatabaseHas('journal_entry_lines',['journal_entry_id'=>$r->deposit_journal_entry_id,'account_id'=>3,'credit'=>100]);
 }
}
