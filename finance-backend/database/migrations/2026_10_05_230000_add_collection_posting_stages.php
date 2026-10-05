<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
 public function up(): void {
  Schema::table('collections', function(Blueprint $t) {
   foreach (['receipt_journal_entry_id','deposit_journal_entry_id','reversal_journal_entry_id'] as $field) $t->foreignId($field)->nullable()->unique()->constrained('journal_entries')->restrictOnDelete();
   $t->foreignId('receipt_verified_by')->nullable()->constrained('users')->restrictOnDelete();
   $t->timestamp('receipt_verified_at')->nullable();
   $t->timestamp('confirmed_at')->nullable();
  });
  Schema::table('settings', function(Blueprint $t) {
   $t->foreignId('undeposited_funds_account_id')->nullable()->constrained('chart_of_accounts')->restrictOnDelete();
   $t->date('collection_closed_through')->nullable();
  });
  $holding = \Illuminate\Support\Facades\DB::table('chart_of_accounts')->where('account_name','Undeposited Funds')->where('account_type','Asset')->where('is_active',true)->whereNull('deleted_at')->first();
  if (!$holding) {
   $code='UF-COL'; $suffix=1;
   while (\Illuminate\Support\Facades\DB::table('chart_of_accounts')->where('account_code',$code)->exists()) $code='UF-COL-'.$suffix++;
   \Illuminate\Support\Facades\DB::table('chart_of_accounts')->insert(['account_code'=>$code,'account_name'=>'Undeposited Funds','account_type'=>'Asset','account_category'=>'Current Asset','description'=>'Verified customer receipts awaiting bank deposit.','is_active'=>true,'created_at'=>now(),'updated_at'=>now()]);
   $id=\Illuminate\Support\Facades\DB::table('chart_of_accounts')->where('account_code',$code)->value('id');
  } else { $id=$holding->id; }
  \Illuminate\Support\Facades\DB::table('settings')->whereNull('undeposited_funds_account_id')->update(['undeposited_funds_account_id'=>$id]);
 }
 public function down(): void {
  if (\Illuminate\Support\Facades\DB::table('collections')->whereNotNull('receipt_journal_entry_id')->exists()) throw new \RuntimeException('Cannot remove collection posting links after financial entries have been posted.');
  Schema::table('collections', function(Blueprint $t) {
   foreach (['receipt_journal_entry_id','deposit_journal_entry_id','reversal_journal_entry_id','receipt_verified_by'] as $field) $t->dropConstrainedForeignId($field);
   $t->dropColumn(['receipt_verified_at','confirmed_at']);
  });
  Schema::table('settings', function(Blueprint $t) {$t->dropConstrainedForeignId('undeposited_funds_account_id');$t->dropColumn('collection_closed_through');});
 }
};
