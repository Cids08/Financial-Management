<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class LoginNotificationMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

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