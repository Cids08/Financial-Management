<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Business amount floors
    |--------------------------------------------------------------------------
    |
    | Minimum amounts a user is allowed to enter on money fields. These are
    | company-policy floors (consistent with what gets pushed to SAP B1),
    | enforced on both the API validation rules and the frontend inputs.
    |
    | Communities input:
    |   - Invoices (AR original amount): a crane/trucking charge will never
    |     legitimately fall below this.
    |   - Collections (amount received): small partial payments still land
    |     comfortably above this.
    |
    */

    'min_invoice_amount' => 1000,

    'min_collection_amount' => 500,

];