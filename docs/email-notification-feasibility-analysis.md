# Email Notification Feasibility Analysis: Watermarking Completion

## Executive Summary

**Question**: Can we use Supabase to send email notifications when watermarking completes, triggered from the frontend polling mechanism?

**Short Answer**: **Partially Feasible** - Supabase does not have built-in email sending capabilities, but we can use Supabase Edge Functions with third-party email services (Resend, SendGrid, etc.) or database triggers. However, there are significant architectural considerations that make a frontend-triggered approach less ideal.

## Current Implementation Analysis

### Frontend Polling Mechanism

**Location**: `src/components/video/VideoGrid.tsx`

**Current Behavior**:
- Polls `/api/videos/watermark/status` every **2 seconds**
- Detects when jobs transition from "processing" to "completed"/"success"
- Updates UI when `videosUpdated > 0` or `hasCompletedJobs === true`
- Uses `onSilentRefresh()` to update the video list

**Key Detection Point** (lines 448-467):
```typescript
const hasCompletedJobs = json.data.hasCompletedJobs ?? false;
const videosUpdated = json.data.videosUpdated ?? 0;

if ((hasCompletedJobs || videosUpdated > 0 || hasProcessingVideos) && !isCancelled) {
  onSilentRefresh();
}
```

### Backend Status Endpoint

**Location**: `src/app/api/videos/watermark/status/route.ts`

**Current Behavior**:
- Fetches queue status from external watermarking service
- Updates database when jobs complete (lines 121-171)
- Returns `videosUpdated` count and `hasCompletedJobs` flag
- Already has access to user context via `supabase.auth.getUser()`

## Supabase Email Capabilities

### ❌ **Supabase Does NOT Have Built-in Email Sending**

Supabase does not provide a native email sending service. However, there are several approaches:

### ✅ **Option 1: Supabase Edge Functions + Third-Party Email Service**

**How it works**:
1. Frontend detects completion in polling
2. Frontend calls a Supabase Edge Function via API
3. Edge Function uses a third-party service (Resend, SendGrid, Mailgun, etc.) to send email
4. Edge Function can access user email from Supabase Auth

**Pros**:
- No backend service needed (Edge Functions are serverless)
- Can be triggered from frontend
- Access to Supabase Auth for user email
- Scalable and serverless

**Cons**:
- Requires setting up Edge Functions (additional infrastructure)
- Requires third-party email service account and API keys
- Additional cost for email service
- Edge Functions have execution time limits

### ✅ **Option 2: Database Triggers + Edge Functions**

**How it works**:
1. Create a database trigger on `videos` table when `status` changes to "processed"
2. Trigger calls a Supabase Edge Function
3. Edge Function sends email via third-party service

**Pros**:
- More reliable (doesn't depend on frontend being open)
- Automatic - no frontend code needed
- Works even if user closes browser

**Cons**:
- Requires database trigger setup
- Still needs Edge Functions + email service
- More complex to debug

### ✅ **Option 3: Next.js API Route + Third-Party Email Service**

**How it works**:
1. Frontend detects completion in polling
2. Frontend calls a Next.js API route (e.g., `/api/videos/[id]/notify-complete`)
3. API route uses third-party email service directly
4. API route accesses user email from Supabase Auth

**Pros**:
- Uses existing Next.js infrastructure
- No Edge Functions needed
- Simpler than Edge Functions
- Can reuse existing API patterns

**Cons**:
- Requires third-party email service
- Frontend must be open to trigger
- API route must handle email service integration

## Recommended Approach: Next.js API Route + Resend

### Why This Approach?

1. **Leverages existing infrastructure** - You already have Next.js API routes
2. **No new services** - Resend is simple, affordable, and developer-friendly
3. **Frontend can trigger** - Works with your existing polling mechanism
4. **User email available** - Can get from Supabase Auth in the API route

### Implementation Flow

```
Frontend Polling (VideoGrid.tsx)
  ↓
Detects: videosUpdated > 0 OR hasCompletedJobs === true
  ↓
For each newly completed video:
  ↓
Call: POST /api/videos/[id]/notify-complete
  ↓
API Route:
  1. Verify user authentication
  2. Get user email from Supabase Auth
  3. Get video details (filename, etc.)
  4. Check if notification already sent (prevent duplicates)
  5. Send email via Resend API
  6. Mark notification as sent in database
```

## Factors to Consider

### 1. **Duplicate Notification Prevention**

**Problem**: Frontend polls every 2 seconds. If a video completes, the frontend will detect it on every poll until the status changes.

**Solution**: 
- Add a `notification_sent_at` timestamp field to `videos` table
- Only send email if `notification_sent_at IS NULL`
- Update timestamp after successful email send

**Database Migration Needed**:
```sql
ALTER TABLE videos 
ADD COLUMN notification_sent_at TIMESTAMP WITH TIME ZONE;
```

### 2. **User Email Availability**

**Current Access**:
- User email is available via `supabase.auth.getUser()` in API routes
- Profile context has `profile.email` field
- Auth context has `user.email`

**Consideration**: Ensure email is verified before sending notifications.

### 3. **Email Service Selection**

**Recommended: Resend**
- **Cost**: Free tier: 3,000 emails/month, then $0.30/1,000
- **Setup**: Simple API, good documentation
- **Features**: Transactional emails, templates, analytics
- **Integration**: Simple REST API, no complex setup

**Alternative: SendGrid**
- **Cost**: Free tier: 100 emails/day
- **Setup**: More complex, but more features
- **Features**: Advanced analytics, templates, webhooks

**Alternative: Mailgun**
- **Cost**: Free tier: 5,000 emails/month
- **Setup**: Moderate complexity
- **Features**: Good for transactional emails

### 4. **Email Template Design**

**Required Information**:
- User's display name or email
- Video filename
- Link to view the watermarked video
- Timestamp of completion

**Example Template**:
```
Subject: Your watermarked video is ready!

Hi [Display Name],

Your video "[Video Filename]" has finished processing and is ready to view.

[View Watermarked Video] button/link

Thank you for using SAVD!
```

### 5. **Error Handling**

**Scenarios to Handle**:
- Email service API failure
- Invalid email address
- Rate limiting from email service
- Network errors
- User closes browser before notification triggers

**Strategy**:
- Log errors but don't block UI updates
- Retry logic for transient failures
- Fallback: User can see completion in UI when they return

### 6. **Rate Limiting**

**Email Service Limits**:
- Resend: 3,000/month free, then paid
- SendGrid: 100/day free
- Mailgun: 5,000/month free

**Consideration**: 
- Multiple videos completing simultaneously
- Multiple users with multiple videos
- Need to monitor usage

### 7. **User Experience**

**Current State**:
- User must keep page open to see completion
- No notification if user closes browser

**With Email**:
- User can close browser and receive email
- Better UX for long-running processes
- Can include direct link to completed video

### 8. **Security Considerations**

**API Key Storage**:
- Store email service API keys in environment variables
- Never expose in frontend code
- Use server-side only (Next.js API routes)

**User Verification**:
- Only send to authenticated users
- Verify email belongs to video owner
- Prevent email spoofing

### 9. **Cost Analysis**

**Resend Pricing** (Recommended):
- Free: 3,000 emails/month
- Paid: $0.30 per 1,000 emails after free tier

**Example Calculation**:
- 100 users, each processing 10 videos/month = 1,000 emails/month
- Well within free tier
- At scale: 10,000 videos/month = $3/month

### 10. **Frontend Dependency**

**Current Limitation**:
- Frontend must be open and polling to detect completion
- If user closes browser, no notification sent

**Mitigation Options**:
1. **Accept limitation**: Email only sent if frontend detects it
2. **Database trigger approach**: More reliable but requires Edge Functions
3. **Hybrid**: Try frontend first, fallback to database trigger

## Implementation Recommendations

### Phase 1: Basic Email Notification (Recommended)

**Steps**:
1. **Add Resend dependency**:
   ```bash
   npm install resend
   ```

2. **Create API route**: `/api/videos/[id]/notify-complete`
   - Verify authentication
   - Get user email from Supabase Auth
   - Get video details
   - Check `notification_sent_at` to prevent duplicates
   - Send email via Resend
   - Update `notification_sent_at` timestamp

3. **Update VideoGrid polling**:
   - When `videosUpdated > 0`, call notification API for each updated video
   - Handle errors gracefully (don't block UI)

4. **Database migration**:
   - Add `notification_sent_at` column to `videos` table

**Code Structure**:
```typescript
// In VideoGrid.tsx polling logic
if (videosUpdated > 0) {
  // Get list of video IDs that were updated
  const updatedVideoIds = /* extract from response */;
  
  // Send notifications (fire and forget)
  updatedVideoIds.forEach(videoId => {
    fetch(`/api/videos/${videoId}/notify-complete`, {
      method: 'POST',
    }).catch(err => {
      console.error('Failed to send notification:', err);
      // Don't block UI - email is nice-to-have
    });
  });
}
```

### Phase 2: Enhanced Reliability (Optional)

**If frontend dependency is problematic**:
- Implement database trigger approach
- Use Supabase Edge Functions
- More complex but more reliable

## Alternative: Browser Notifications

**If email is too complex for this phase**:
- Use Browser Notification API
- Works when page is open
- No external service needed
- Less reliable (requires page to be open)

## Conclusion

### ✅ **Feasible with Limitations**

**Yes, you can implement email notifications using Supabase + third-party email service**, but:

1. **Supabase doesn't send emails directly** - Need Resend/SendGrid/etc.
2. **Frontend dependency exists** - Email only sent if frontend detects completion
3. **Requires API route** - Next.js API route + email service integration
4. **Cost is minimal** - Free tier covers most use cases
5. **Duplicate prevention needed** - Track `notification_sent_at` in database

### Recommended Next Steps

1. **Start with Resend + Next.js API route** (simplest)
2. **Add `notification_sent_at` column** to prevent duplicates
3. **Integrate into existing polling logic** in VideoGrid
4. **Monitor email service usage** and costs
5. **Consider database trigger approach** later if frontend dependency becomes problematic

### Estimated Implementation Effort

- **Setup**: 2-3 hours (Resend account, API route, email template)
- **Integration**: 1-2 hours (polling logic update, duplicate prevention)
- **Testing**: 1-2 hours (test various scenarios)
- **Total**: 4-7 hours

This is a reasonable feature to implement without a dedicated backend service.
