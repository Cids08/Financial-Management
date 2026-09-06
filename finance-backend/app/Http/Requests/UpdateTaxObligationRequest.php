<?php

namespace App\Http\Requests;

class UpdateTaxObligationRequest extends StoreTaxObligationRequest
{
    // Inherits rules() as-is from StoreTaxObligationRequest — the two were
    // byte-for-byte identical before, so extending instead of duplicating
    // means a future rule change only has to happen in one place. Only
    // authorize() differs: update needs the route-bound model so a Policy
    // can check ability against the specific record, not just the class.
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('taxObligation')) ?? false;
    }
}