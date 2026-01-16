import nodemailer from 'nodemailer';

/**
 * Email service using AWS SES SMTP
 * 
 * Environment variables required:
 * - SES_SMTP_HOST: AWS SES SMTP endpoint (e.g., email-smtp.us-east-1.amazonaws.com)
 * - SES_SMTP_PORT: SMTP port (typically 587 for STARTTLS, 465 for SSL)
 * - SES_SMTP_USER: SMTP username
 * - SES_SMTP_PASS: SMTP password
 * - SES_FROM_EMAIL: Verified email address to send from
 * - SES_FROM_NAME: Display name for sender (optional, defaults to "SAIVD")
 */

// Create reusable transporter
const createTransporter = () => {
  const host = process.env.SES_SMTP_HOST;
  const port = parseInt(process.env.SES_SMTP_PORT || '587', 10);
  const user = process.env.SES_SMTP_USER;
  const pass = process.env.SES_SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      'Missing SES SMTP configuration. Required: SES_SMTP_HOST, SES_SMTP_USER, SES_SMTP_PASS'
    );
  }

  // Port 465 uses SSL, ports 25/587 use STARTTLS
  const secure = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    tls: {
      // Reject unauthorized certificates
      rejectUnauthorized: true,
    },
  });
};

export interface SendEmailOptions {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
}

/**
 * Send an email using AWS SES SMTP
 * 
 * @param options Email options
 * @returns Promise resolving to email message info
 */
export async function sendEmail({
  to,
  subject,
  htmlBody,
  textBody,
}: SendEmailOptions): Promise<nodemailer.SentMessageInfo> {
  const fromEmail = process.env.SES_FROM_EMAIL;
  const fromName = process.env.SES_FROM_NAME || 'SAIVD';

  if (!fromEmail) {
    throw new Error('SES_FROM_EMAIL environment variable is not set');
  }

  const transporter = createTransporter();

  try {
    const info = await transporter.sendMail({
      from: `${fromName} <${fromEmail}>`,
      to,
      subject,
      html: htmlBody,
      ...(textBody && { text: textBody }),
    });

    console.log('[Email] Email sent successfully:', {
      messageId: info.messageId,
      to,
      subject,
    });

    return info;
  } catch (error) {
    console.error('[Email] Error sending email:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      to,
      subject,
    });
    throw error;
  }
}

/**
 * Send watermarking completion notification email
 * 
 * @param userEmail Recipient email address
 * @param videoFilename Name of the video file
 * @param displayName User's display name (optional)
 * @returns Promise resolving to email message info
 */
export async function sendWatermarkCompleteEmail(
  userEmail: string,
  videoFilename: string,
  displayName?: string | null
): Promise<nodemailer.SentMessageInfo> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://saivd.netlify.app';
  const videoUrl = `${appUrl}/dashboard/videos`;
  const greetingName = displayName || userEmail.split('@')[0];

  const subject = `Your watermarked video "${videoFilename}" is ready!`;

  const htmlBody = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; border: 1px solid #e5e7eb;">
          <h1 style="color: #111827; margin-top: 0; font-size: 24px;">Your Video is Ready!</h1>
          
          <p style="font-size: 16px; color: #374151;">Hi ${greetingName},</p>
          
          <p style="font-size: 16px; color: #374151;">
            Great news! Your video <strong style="color: #111827;">"${videoFilename}"</strong> has finished processing and your watermarked version is now available.
          </p>
          
          <div style="margin: 30px 0; text-align: center;">
            <a href="${videoUrl}" 
               style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px;">
              View Your Videos
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            You can now download, share, or view your watermarked video from your dashboard.
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="color: #9ca3af; font-size: 12px; margin-bottom: 0;">
            This is an automated notification from SAIVD. 
            If you have any questions, please contact support.
          </p>
        </div>
      </body>
    </html>
  `;

  const textBody = `
Hi ${greetingName},

Great news! Your video "${videoFilename}" has finished processing and your watermarked version is now available.

View your videos: ${videoUrl}

You can now download, share, or view your watermarked video from your dashboard.

---
This is an automated notification from SAIVD.
If you have any questions, please contact support.
  `.trim();

  return sendEmail({
    to: userEmail,
    subject,
    htmlBody,
    textBody,
  });
}
