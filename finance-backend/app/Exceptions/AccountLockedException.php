<?php

namespace App\Exceptions;

use Exception;

class AccountLockedException extends Exception
{
    public function __construct(public readonly int $secondsRemaining)
    {
        parent::__construct('Account is temporarily locked.');
    }
}