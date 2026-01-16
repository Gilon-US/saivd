# AWS SES SMTP Authentication Troubleshooting

## Common Error: "535 Authentication Credentials Invalid"

This error indicates that AWS SES is rejecting your SMTP credentials. Follow this step-by-step guide to resolve it.

## Quick Checklist

- [ ] SMTP credentials generated via SES Console (not IAM access keys)
- [ ] Region matches between credentials and SMTP endpoint
- [ ] No extra spaces or special characters in credentials
- [ ] Correct port (587 for STARTTLS or 465 for SSL)
- [ ] From email address is verified in SES
- [ ] IAM user has proper SES permissions

## Step-by-Step Resolution

### 1. Verify SMTP Credentials Generation

**Important**: SMTP credentials are NOT the same as AWS IAM access keys.

**Correct Method**:
1. Go to AWS SES Console
2. Navigate to **SMTP Settings** (in the left sidebar)
3. Click **Create SMTP Credentials**
4. This will create an IAM user specifically for SMTP
5. Download or copy the **SMTP Username** and **SMTP Password**

**Incorrect Method**:
- Using AWS Access Key ID and Secret Access Key directly
- These need to be converted or you must use the SES console method

### 2. Check Region Alignment

SMTP credentials are region-specific. The host must match the region where credentials were created.

**Example**:
- If credentials created in `us-east-1` → Use `email-smtp.us-east-1.amazonaws.com`
- If credentials created in `us-west-2` → Use `email-smtp.us-west-2.amazonaws.com`

**To find your region**:
1. Check where your verified email/domain is configured in SES
2. Check the region dropdown in the SES Console
3. Ensure `SES_SMTP_HOST` matches that region

### 3. Verify Environment Variables

Check your `.env` or environment configuration:

```env
# Correct format
SES_SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SES_SMTP_PORT=587
SES_SMTP_USER=AKIAIOSFODNN7EXAMPLE
SES_SMTP_PASS=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

**Common Issues**:
- Extra spaces: `SES_SMTP_USER=" AKIA..."` (has leading space)
- Quotes included: `SES_SMTP_PASS="password"` (quotes become part of the value)
- Special characters: Passwords with `/`, `+`, `=` may need URL encoding
- Line breaks: Multi-line values can break authentication

**Fix**:
```bash
# Remove quotes and spaces
SES_SMTP_USER=AKIAIOSFODNN7EXAMPLE
SES_SMTP_PASS=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

### 4. Handle Special Characters in Password

If your SMTP password contains special characters (`/`, `+`, `=`, `%`), they may need encoding.

**Option 1: URL Encode in Environment Variable**
```env
# If password is: abc/def+ghi=
# URL encode it:
SES_SMTP_PASS=abc%2Fdef%2Bghi%3D
```

**Option 2: Handle in Code** (if needed)
The current implementation trims whitespace, but special characters should work as-is if the environment variable is set correctly.

### 5. Verify Port and Security Settings

**Port 587 (STARTTLS)** - Recommended:
```env
SES_SMTP_PORT=587
```
- Uses `secure: false` in nodemailer
- Upgrades to TLS via STARTTLS

**Port 465 (SSL/TLS)**:
```env
SES_SMTP_PORT=465
```
- Uses `secure: true` in nodemailer
- Direct SSL/TLS connection

**Port 25** - Not Recommended:
- Often blocked by hosting providers
- Heavily rate-limited
- Avoid unless necessary

### 6. Verify IAM Permissions

The IAM user associated with SMTP credentials needs SES permissions:

**Required Policy**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ],
      "Resource": "*"
    }
  ]
}
```

**To Check**:
1. Go to IAM Console
2. Find the user created during SMTP credential generation
3. Verify it has the above permissions attached

### 7. Verify From Email Address

The `SES_FROM_EMAIL` must be verified in AWS SES:

1. Go to SES Console → **Verified identities**
2. Ensure your from email address is listed and verified
3. If using a domain, ensure domain is verified

**Sandbox Mode**:
- In sandbox, you can only send to verified recipients
- Request production access to send to any email address

### 8. Test SMTP Connection

You can test the SMTP connection manually:

**Using OpenSSL**:
```bash
openssl s_client -connect email-smtp.us-east-1.amazonaws.com:587 -starttls smtp
```

**Using Telnet**:
```bash
telnet email-smtp.us-east-1.amazonaws.com 587
```

Then manually authenticate:
```
EHLO localhost
AUTH LOGIN
[base64 encoded username]
[base64 encoded password]
```

### 9. Regenerate Credentials

If credentials are old, corrupted, or you're unsure:

1. Go to SES Console → SMTP Settings
2. Delete old SMTP credentials (if needed)
3. Create new SMTP credentials
4. Update environment variables with new credentials
5. Restart your application

### 10. Check Application Logs

The enhanced error logging will show:
- Host and port being used
- Whether credentials are present (without exposing values)
- Specific error codes and messages

Look for:
```
[Email] Creating SMTP transporter { host: '...', port: 587, ... }
[Email] Error sending email: { error: '...', errorCode: '...', ... }
[Email] Troubleshooting tips for authentication error: [...]
```

## Environment Variable Template

Create a `.env.local` file (never commit this):

```env
# AWS SES SMTP Configuration
# Get these from: AWS SES Console → SMTP Settings → Create SMTP Credentials

# SMTP Endpoint (region-specific)
SES_SMTP_HOST=email-smtp.us-east-1.amazonaws.com

# Port (587 for STARTTLS, 465 for SSL)
SES_SMTP_PORT=587

# SMTP Username (from SES Console, NOT IAM Access Key)
SES_SMTP_USER=AKIAIOSFODNN7EXAMPLE

# SMTP Password (from SES Console, NOT IAM Secret Key)
SES_SMTP_PASS=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# Verified From Email (must be verified in SES)
SES_FROM_EMAIL=noreply@yourdomain.com

# Display Name (optional)
SES_FROM_NAME=SAIVD

# Application URL (for email links)
NEXT_PUBLIC_APP_URL=https://saivd.netlify.app
```

## Common Mistakes

1. **Using IAM Access Keys Directly**
   - ❌ Wrong: Using AWS Access Key ID as SMTP username
   - ✅ Correct: Generate SMTP credentials via SES Console

2. **Region Mismatch**
   - ❌ Wrong: Credentials from `us-east-1` but using `us-west-2` endpoint
   - ✅ Correct: Match the region

3. **Extra Whitespace**
   - ❌ Wrong: `SES_SMTP_USER=" AKIA..."` (has space)
   - ✅ Correct: `SES_SMTP_USER=AKIA...` (no quotes, no spaces)

4. **Wrong Port Configuration**
   - ❌ Wrong: Port 587 with `secure: true`
   - ✅ Correct: Port 587 with `secure: false` (STARTTLS)

5. **Unverified From Address**
   - ❌ Wrong: Using unverified email as sender
   - ✅ Correct: Verify email/domain in SES first

## Still Having Issues?

1. **Check AWS SES Service Health**: https://status.aws.amazon.com/
2. **Review SES Sending Statistics**: Check for bounces, complaints, or blocks
3. **Contact AWS Support**: If credentials are definitely correct but still failing
4. **Try Different Port**: Switch between 587 and 465
5. **Check Network/Firewall**: Ensure outbound connections to SES are allowed

## Additional Resources

- [AWS SES SMTP Documentation](https://docs.aws.amazon.com/ses/latest/dg/send-email-smtp.html)
- [Troubleshooting SES SMTP](https://docs.aws.amazon.com/ses/latest/dg/troubleshoot-smtp.html)
- [Creating SMTP Credentials](https://docs.aws.amazon.com/ses/latest/dg/smtp-credentials.html)
