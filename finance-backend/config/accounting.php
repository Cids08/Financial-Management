<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Accounting Control Accounts
    |--------------------------------------------------------------------------
    |
    | Maps critical system transactions to their default control accounts
    | in the Chart of Accounts.
    |
    */

    'accounts' => [
        // Accounts Payable Liability Account (default code: 2000)
        'accounts_payable_control' => env('ACCOUNTING_AP_CONTROL_ID'),

        // Payroll Disbursement Liability Account (default code: 2200)
        'payroll_disbursement_control' => env('ACCOUNTING_PAYROLL_CONTROL_ID'),

        // Accounts Receivable Asset Account (default code: 1100)
        'accounts_receivable_control' => env('ACCOUNTING_AR_CONTROL_ID'),
    ],

];
