<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class TwoFactorCodeMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    /**
     * @param string $code Six-digit code to display.
     * @param int $expiresInMinutes How long this specific code is valid —
     *        callers pass their own TTL constant so this stays correct
     *        regardless of which flow sends it (login vs. Settings setup).
     * @param string $mailSubject Email subject line.
     * @param string $heading Headline shown above the code.
     * @param string $subtext One-line description of what the code is for.
     */
    public function __construct(
        protected string $code,
        protected int $expiresInMinutes,
        protected string $mailSubject = 'Your login verification code',
        protected string $heading = 'Verify your sign-in',
        protected string $subtext = 'Enter this code to finish signing in to your account.',
    ) {
    }

    public function build(): self
    {
        return $this->subject($this->mailSubject)
            ->view('emails.two-factor-code')
            ->with([
                'code' => $this->code,
                'expiresInMinutes' => $this->expiresInMinutes,
                'heading' => $this->heading,
                'subtext' => $this->subtext,
                'companyName' => config('app.company_name', config('app.name')),
            ]);
    }
}