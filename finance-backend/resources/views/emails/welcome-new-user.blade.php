<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your account has been created</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">

  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">
    Your temporary password is inside — you'll be asked to change it on first login.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px; width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06);">

          <tr>
            <td style="background-color:#0f172a; padding:28px 32px; text-align:center;">
              <img src="{{ $message->embed(public_path('images/company-logo.png')) }}" alt="{{ $companyName }}" width="56" height="56" style="display:inline-block; border-radius:12px; margin-bottom:10px;">
              <div style="color:#ffffff; font-size:15px; font-weight:600; letter-spacing:0.2px;">
                {{ $companyName }}
              </div>
              <div style="color:#94a3b8; font-size:12px; margin-top:2px;">
                Financial Management System
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:36px 32px 8px 32px; text-align:center;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 16px auto;">
                <tr>
                  <td width="44" height="44" align="center" valign="middle" style="border-radius:50%; background-color:#dcfce7; font-size:20px;">
                    👋
                  </td>
                </tr>
              </table>
              <h1 style="margin:0 0 8px 0; font-size:19px; font-weight:700; color:#0f172a;">
                Welcome, {{ $firstName }}
              </h1>
              <p style="margin:0; font-size:14px; line-height:1.6; color:#64748b;">
                An account was created for you on the {{ $companyName }} Financial Management System. Use the credentials below to sign in for the first time.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 32px 8px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:12px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:4px 0; font-size:13px; color:#94a3b8; width:110px;">Employee No.</td>
                        <td style="padding:4px 0; font-size:13px; color:#0f172a; font-weight:600;">{{ $employeeNo }}</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0; font-size:13px; color:#94a3b8;">Email</td>
                        <td style="padding:4px 0; font-size:13px; color:#0f172a; font-weight:600;">{{ $email }}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0 4px 0; font-size:13px; color:#94a3b8; vertical-align:top;">Temporary<br>password</td>
                        <td style="padding:8px 0 4px 0;">
                          <span style="font-family: 'Courier New', Courier, monospace; font-size:15px; font-weight:700; color:#0f172a; background-color:#fef3c7; padding:4px 10px; border-radius:6px; letter-spacing:0.5px;">{{ $temporaryPassword }}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px 8px 32px; text-align:center;">
              <a href="{{ $loginUrl }}" style="display:inline-block; background-color:#f59e0b; color:#0f172a; font-weight:700; font-size:14px; text-decoration:none; padding:12px 28px; border-radius:10px;">
                Log in now
              </a>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 32px 0 32px; text-align:center;">
              <p style="margin:0; font-size:13px; color:#94a3b8;">
                You will be asked to set your own password immediately after signing in.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 32px 0 32px;">
              <div style="border-top:1px solid #eef0f3;"></div>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px 32px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2; border:1px solid #fecaca; border-radius:10px;">
                <tr>
                  <td style="padding:14px 16px; font-size:13px; line-height:1.6; color:#991b1b;">
                    <strong>Keep this email private.</strong> Do not forward it or share the password above with anyone. If you didn't expect this account, contact your administrator immediately.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background-color:#f8fafc; padding:20px 32px; text-align:center; border-top:1px solid #eef0f3;">
              <p style="margin:0; font-size:12px; color:#94a3b8; line-height:1.6;">
                This is an automated message from the {{ $companyName }} Financial Management System.<br>
                Please do not reply to this email.
              </p>
            </td>
          </tr>

        </table>

        <p style="margin:20px 0 0 0; font-size:11px; color:#b0b7c3;">
          &copy; {{ date('Y') }} {{ rtrim($companyName, '.') }}. All rights reserved.
        </p>
      </td>
    </tr>
  </table>

</body>
</html>