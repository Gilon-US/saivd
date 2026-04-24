# SAVD App - User Flows

This document outlines the key user flows in the SAVD App, providing a clear understanding of how users will interact with the system.

## Core User Journeys

### 1. User Registration & Login

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│             │     │             │     │             │     │             │
│  Visit      │────▶│  Click      │────▶│  Complete   │────▶│  Redirected │
│  Homepage   │     │  Register   │     │  Form       │     │  to Videos  │
│             │     │             │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

**Detailed Steps:**
1. User visits the SAVD App homepage
2. User clicks "Register" button
3. User completes registration form with email and password
4. System creates user account in Supabase Auth
5. User is automatically logged in
6. User is redirected to the video management dashboard

### 2. Video Upload Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│             │     │             │     │             │     │             │
│  Click      │────▶│  Select     │────▶│  Upload     │────▶│  Video      │
│  Upload     │     │  Video      │     │  Progress   │     │  Added      │
│             │     │             │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

**Detailed Steps:**
1. User clicks "Upload Video" button on dashboard
2. User selects video file from their device
3. System validates file type and size
4. Frontend requests pre-signed URL from API
5. Video uploads directly to Wasabi storage
6. Progress bar shows upload status
7. Upon completion, video appears in grid view with thumbnail
8. System shows "Create Watermarked Version" button next to the video

### 3. Creating Watermarked Version

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│             │     │             │     │             │     │             │
│  Click      │────▶│  Processing │────▶│  Callback   │────▶│  Watermarked│
│  Watermark  │     │  Indicator  │     │  Received   │     │  Available  │
│             │     │             │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

**Detailed Steps:**
1. User clicks "Create Watermarked Version" button for a video
2. System sends request to external watermarking service with video URL
3. UI updates to show "Processing" status
4. External service processes the video (asynchronously)
5. External service calls back to SAVD App when complete
6. System updates database with watermarked video URL
7. UI updates to show watermarked video thumbnail
8. "Get Public URL" button appears for the watermarked version

### 4. Generating Public URL

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│             │     │             │     │             │
│  Click Get  │────▶│  URL        │────▶│  Copy URL   │
│  Public URL │     │  Generated  │     │  to Clipboard│
│             │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
```

**Detailed Steps:**
1. User clicks "Get Public URL" button for a watermarked video
2. System generates a secure token for public access
3. System creates and displays a public URL
4. User can copy URL to clipboard
5. URL can be shared with anyone to view the watermarked video

### 5. Deleting Videos

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│             │     │             │     │             │
│  Click      │────▶│  Confirm    │────▶│  Video      │
│  Delete     │     │  Deletion   │     │  Removed    │
│             │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
```

**Detailed Steps:**
1. User clicks "Delete" button for a video (original or watermarked)
2. System displays confirmation dialog
3. User confirms deletion
4. System removes video from storage and database
5. UI updates to reflect the deletion
6. If watermarked version is deleted, "Create Watermarked Version" button reappears

## User Interface Flows

### Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│ SAVD App                                       User Profile │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐                  ┌─────────────────────┐   │
│  │ Upload Video│                  │ Filter/Sort Options │   │
│  └─────────────┘                  └─────────────────────┘   │
│                                                             │
│  ┌─────────────────────┐       ┌─────────────────────────┐  │
│  │                     │       │                         │  │
│  │  Original Video 1   │       │  Watermarked Version 1  │  │
│  │                     │       │                         │  │
│  │  [Delete]           │       │  [Get Public URL]       │  │
│  │                     │       │  [Delete]               │  │
│  └─────────────────────┘       └─────────────────────────┘  │
│                                                             │
│  ┌─────────────────────┐       ┌─────────────────────────┐  │
│  │                     │       │                         │  │
│  │  Original Video 2   │       │  [Create Watermarked    │  │
│  │                     │       │   Version]              │  │
│  │  [Delete]           │       │                         │  │
│  │                     │       │                         │  │
│  └─────────────────────┘       └─────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Mobile Layout

```
┌─────────────────────────────┐
│ SAVD App           Profile  │
├─────────────────────────────┤
│                             │
│  ┌─────────────┐            │
│  │ Upload Video│            │
│  └─────────────┘            │
│                             │
│  ┌─────────────────────────┐│
│  │                         ││
│  │  Original Video 1       ││
│  │                         ││
│  │  [Delete]               ││
│  │                         ││
│  └─────────────────────────┘│
│                             │
│  ┌─────────────────────────┐│
│  │                         ││
│  │  Watermarked Version 1  ││
│  │                         ││
│  │  [Get Public URL]       ││
│  │  [Delete]               ││
│  └─────────────────────────┘│
│                             │
└─────────────────────────────┘
```

## Error Handling Flows

### Upload Failure

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│             │     │             │     │             │     │             │
│  Upload     │────▶│  Error      │────▶│  Error      │────▶│  Option to  │
│  Initiated  │     │  Occurs     │     │  Displayed  │     │  Retry      │
│             │     │             │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

**Detailed Steps:**
1. User initiates video upload
2. Upload fails (network issue, file too large, etc.)
3. System displays error notification with details
4. User can retry upload or select a different file

### Watermarking Failure

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│             │     │             │     │             │     │             │
│  Watermark  │────▶│  Processing │────▶│  Error      │────▶│  Option to  │
│  Requested  │     │  Started    │     │  Callback   │     │  Retry      │
│             │     │             │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

**Detailed Steps:**
1. User requests watermarked version
2. System shows processing status
3. External service encounters an error
4. Error callback received by system
5. System updates status to "Error"
6. User can retry watermarking process

## Notification Flows

### Watermarking Completion

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│             │     │             │     │             │
│  Watermark  │────▶│  Processing │────▶│  Success    │
│  Processing │     │  Complete   │     │  Notification│
│             │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
```

**Detailed Steps:**
1. Watermarking process is in progress
2. External service completes processing
3. Callback received by system
4. System updates database and UI
5. Success notification displayed to user
6. Watermarked thumbnail appears in grid

### Error Notifications

```
┌─────────────┐     ┌─────────────┐
│             │     │             │
│  Error      │────▶│  Toast      │
│  Occurs     │     │  Notification│
│             │     │             │
└─────────────┘     └─────────────┘
```

**Detailed Steps:**
1. Error occurs during any operation
2. System displays toast notification
3. Error details logged for troubleshooting
4. User can dismiss notification or take action

## Authentication Flows

### Password Reset

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│             │     │             │     │             │     │             │
│  Click      │────▶│  Enter      │────▶│  Email      │────▶│  Set New    │
│  Forgot     │     │  Email      │     │  Sent       │     │  Password   │
│  Password   │     │             │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

**Detailed Steps:**
1. User clicks "Forgot Password" on login screen
2. User enters email address
3. System sends password reset email via Supabase Auth
4. User clicks link in email
5. User sets new password
6. User is redirected to login

### Logout Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│             │     │             │     │             │
│  Click      │────▶│  Session    │────▶│  Redirect   │
│  Logout     │     │  Terminated │     │  to Login   │
│             │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
```

**Detailed Steps:**
1. User clicks "Logout" in profile menu
2. System terminates user session
3. User is redirected to login page

## Administrative Flows

### User Profile Management

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│             │     │             │     │             │     │             │
│  Click      │────▶│  View       │────▶│  Edit       │────▶│  Save       │
│  Profile    │     │  Profile    │     │  Details    │     │  Changes    │
│             │     │             │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

**Detailed Steps:**
1. User clicks profile icon
2. System displays profile information
3. User edits details (name, email, etc.)
4. User saves changes
5. System updates user information in database
