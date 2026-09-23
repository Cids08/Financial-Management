<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;

class LoginNotificationMail extends Mailable
{
    public function __construct(
        protected string $deviceLabel,
        protected ?string $ipAddress,
        protected ?string $location,
        protected string $loginAt,
    ) {
    }

    public function build(): self
    {
        return $this->subject('New sign-in to your account')
            ->view('emails.login-notification')
            ->with([
                'deviceLabel' => $this->deviceLabel,
                'ipAddress' => $this->ipAddress ?: 'Unknown',
                'location' => $this->location ?: 'Unknown location',
                'loginAt' => $this->loginAt,
                'companyName' => config('app.company_name', config('app.name')),
            ]);
    }
}