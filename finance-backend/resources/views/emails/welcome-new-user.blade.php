<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class WelcomeNewUserMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        protected User $user,
        protected string $temporaryPassword,
    ) {
    }

    public function build(): self
    {
        return $this->subject('Your account has been created')
            ->view('emails.welcome-new-user')
            ->with([
                'firstName' => $this->user->first_name,
                'employeeNo' => $this->user->employee_no,
                'email' => $this->user->email,
                'temporaryPassword' => $this->temporaryPassword,
                'loginUrl' => rtrim(config('app.frontend_url'), '/') . '/login',
                'companyName' => config('app.company_name', config('app.name')),
            ]);
    }
}