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

        // Expanded Withholding Tax Payable Liability Account (default code: 2030)
        // Credited when a supplier payment withholds EWT at source; the
        // balance is the accrued tax still to be remitted to the BIR.
        'ewt_payable_control' => env('ACCOUNTING_EWT_PAYABLE_CONTROL_ID'),
    ],

];
