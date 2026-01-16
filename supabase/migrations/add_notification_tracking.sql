-- Add column to track notification status for watermarking completion emails
-- This prevents duplicate email notifications when the same video completes

ALTER TABLE videos 
ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMP WITH TIME ZONE;

-- Add index for efficient queries on notification status
CREATE INDEX IF NOT EXISTS idx_videos_notification_sent_at 
ON videos(notification_sent_at) 
WHERE notification_sent_at IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN videos.notification_sent_at IS 'Timestamp when watermarking completion email notification was sent. NULL if notification not yet sent.';
