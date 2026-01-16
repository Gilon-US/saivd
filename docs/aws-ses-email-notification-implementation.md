# AWS SES Email Notification Implementation

## Overview

This document describes the implementation of email notifications using AWS SES SMTP to notify users when their video watermarking process completes. The implementation leverages the existing frontend polling mechanism and integrates seamlessly with the Next.js backend.

## Architecture

### Components

1. **Email Service (`src/lib/email.ts`)**
   - SMTP transport using nodemailer
   - AWS SES SMTP configuration
   - Reusable email sending functions
   - HTML and plain text email templates

2. **Database Schema**
   - Added `notification_sent_at` column to `videos` table
   - Index on `notification_sent_at` for efficient queries
   - Prevents duplicate email notifications

3. **Integration Point (`src/app/api/videos/watermark/status/route.ts`)**
   - Sends email after video status is updated to "processed"
   - Checks `notification_sent_at` to prevent duplicate emails
   - Fetches user email and display name
   - Error handling ensures video update is not affected by email failures

## Configuration

### Environment Variables

The following environment variables must be set:

```env
# AWS SES SMTP Configuration
SES_SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SES_SMTP_PORT=587
SES_SMTP_USER=your_smtp_username
SES_SMTP_PASS=your_smtp_password

# Email From Address (must be verified in SES)
SES_FROM_EMAIL=noreply@yourdomain.com
SES_FROM_NAME=SAIVD

# Application URL (for email links)
NEXT_PUBLIC_APP_URL=https://saivd.netlify.app
```

### AWS SES Setup Requirements

1. **Verify Email/Domain in SES**
   - The `SES_FROM_EMAIL` address or domain must be verified in AWS SES
   - For production, request production access to send to unverified recipients

2. **Generate SMTP Credentials**
   - Create SMTP credentials via AWS SES Console
   - These are different from AWS IAM access keys
   - Credentials are region-specific

3. **Network Configuration**
   - Port 587: Uses STARTTLS (recommended)
   - Port 465: Uses SSL/TLS wrapper
   - Port 25: Often blocked by hosting providers

## Database Migration

### Migration File: `supabase/migrations/add_notification_tracking.sql`

```sql
-- Add column to track notification status
ALTER TABLE videos 
ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMP WITH TIME ZONE;

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_videos_notification_sent_at 
ON videos(notification_sent_at) 
WHERE notification_sent_at IS NOT NULL;
```

### Running the Migration

```bash
# If using Supabase CLI locally
supabase migration up

# Or apply directly via SQL editor in Supabase dashboard
```

## Email Service API

### `sendEmail(options: SendEmailOptions)`

Generic email sending function using AWS SES SMTP.

**Parameters:**
- `to: string` - Recipient email address
- `subject: string` - Email subject
- `htmlBody: string` - HTML email body
- `textBody?: string` - Plain text email body (optional)

**Returns:** `Promise<nodemailer.SentMessageInfo>`

**Example:**
```typescript
import { sendEmail } from '@/lib/email';

await sendEmail({
  to: 'user@example.com',
  subject: 'Welcome!',
  htmlBody: '<h1>Welcome to SAIVD</h1>',
  textBody: 'Welcome to SAIVD'
});
```

### `sendWatermarkCompleteEmail(userEmail: string, videoFilename: string, displayName?: string | null)`

Sends a watermarking completion notification email.

**Parameters:**
- `userEmail: string` - User's email address
- `videoFilename: string` - Name of the processed video file
- `displayName?: string | null` - User's display name (optional, defaults to email username)

**Returns:** `Promise<nodemailer.SentMessageInfo>`

**Features:**
- HTML email with styled template
- Plain text fallback
- Link to video dashboard
- Personalized greeting using display name

## Integration Flow

### 1. Video Processing Completion

When the watermarking status API detects a completed job:

1. Updates video record with `processed_url` and status
2. Checks if `notification_sent_at` is `null` (notification not sent)
3. Fetches user email from auth and display name from profile
4. Sends email notification
5. Updates `notification_sent_at` timestamp

### 2. Error Handling

- Email failures are logged but do not affect video status update
- Video processing continues even if email sending fails
- Errors are logged with context for debugging

### 3. Duplicate Prevention

- `notification_sent_at` column ensures emails are sent only once per video
- Check happens before attempting to send email
- Timestamp is updated atomically after successful send

## Code Example

### Watermark Status Route Integration

```typescript
// After successfully updating video status to "processed"
if (!video.notification_sent_at && video.filename) {
  try {
    // Get user's display name from profile (optional)
    const {data: profile} = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    // Import email function dynamically to avoid loading issues
    const {sendWatermarkCompleteEmail} = await import("@/lib/email");
    
    await sendWatermarkCompleteEmail(
      user.email || '',
      video.filename,
      profile?.display_name || null
    );

    // Update notification_sent_at timestamp
    await supabase
      .from("videos")
      .update({
        notification_sent_at: new Date().toISOString(),
      })
      .eq("id", video.id)
      .eq("user_id", user.id);

    console.log("[Watermark] Successfully sent completion email", {
      videoId: video.id,
      filename: video.filename,
      userEmail: user.email,
    });
  } catch (emailError) {
    console.error("[Watermark] Failed to send completion email", {
      videoId: video.id,
      filename: video.filename,
      error: emailError instanceof Error ? emailError.message : 'Unknown error',
    });
    // Don't fail the video update - email is nice-to-have
  }
}
```

## Email Template

### HTML Template

The email includes:
- Styled header with app branding
- Personalized greeting
- Video filename highlight
- Call-to-action button linking to video dashboard
- Footer with support information

### Plain Text Template

A simple plain text version is also included for email clients that don't support HTML.

## Security Considerations

1. **Environment Variables**
   - SMTP credentials stored in environment variables
   - Never committed to version control
   - Use secrets management in production (AWS Secrets Manager, etc.)

2. **Email Validation**
   - Recipient emails come from authenticated user records
   - From address must be verified in SES
   - SES enforces rate limits and spam prevention

3. **Error Handling**
   - Email failures don't expose sensitive information
   - Errors are logged server-side only
   - No user-facing error messages for email failures

## Monitoring and Debugging

### Logging

All email operations are logged:
- Success: Message ID, recipient, subject
- Failure: Error message, recipient, subject

### Common Issues

1. **SMTP Authentication Failed**
   - Verify `SES_SMTP_USER` and `SES_SMTP_PASS` are correct
   - Ensure credentials match the SES region
   - Check IAM permissions for SES sending

2. **From Address Not Verified**
   - Verify `SES_FROM_EMAIL` in AWS SES Console
   - Check if domain is verified instead of individual email

3. **Port Blocking**
   - Use port 587 (STARTTLS) or 465 (SSL)
   - Avoid port 25 (often blocked)

4. **SES Sandbox Mode**
   - In sandbox, can only send to verified recipients
   - Request production access for unverified recipients

## Testing

### Local Testing

1. Set environment variables in `.env.local`
2. Verify email address in AWS SES
3. Test with verified recipient email
4. Check application logs for email send status

### Production Testing

1. Send test email to verified recipient
2. Verify email arrives in inbox (check spam folder)
3. Check email formatting and links
4. Monitor SES dashboard for sending statistics

## Dependencies

- `nodemailer`: ^6.9.x (SMTP email transport)
- `@types/nodemailer`: ^6.4.x (TypeScript types)

## Future Enhancements

1. **Email Templates**
   - Expandable template system
   - Support for multiple email types
   - Customizable branding

2. **Retry Logic**
   - Automatic retry for failed emails
   - Exponential backoff
   - Dead letter queue for persistent failures

3. **Email Preferences**
   - User preference to opt-out
   - Different notification frequencies
   - Multiple email addresses per user

4. **Analytics**
   - Track email open rates
   - Click tracking on links
   - Bounce and complaint handling

## Related Documentation

- [AWS SES SMTP Documentation](https://docs.aws.amazon.com/ses/latest/dg/send-email-smtp.html)
- [Nodemailer Documentation](https://nodemailer.com/about/)
- [Email Notification Feasibility Analysis](./email-notification-feasibility-analysis.md)
