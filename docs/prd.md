# SAVD App Product Requirements Document (PRD)

## Goals and Background Context

### Goals

- Implement the complete video watermarking workflow from upload to sharing
- Create a secure, user-friendly interface for managing original and watermarked videos
- Integrate with external watermarking service via asynchronous API
- Enable public sharing of watermarked videos only
- Ensure proper user isolation and content security
- Deliver a responsive, mobile-friendly application

### Background Context

The SAVD App is a video watermarking management platform designed to help content creators protect their intellectual property. The base project infrastructure has been established, but the core functionality for video uploading, watermarking, and sharing needs to be implemented. The application leverages Next.js for the frontend and API routes, Supabase for authentication and database management, and Wasabi Cloud Storage for video file storage. This PRD focuses on implementing the critical features needed to deliver a complete MVP.

### Change Log

| Date       | Version | Description | Author          |
| ---------- | ------- | ----------- | --------------- |
| 2025-09-20 | 1.0     | Initial PRD | Product Manager |

## Requirements

### Functional

1. **FR1**: Users must be able to register and log in using email/password via Supabase Auth.
2. **FR2**: Authenticated users must be able to upload video files to Wasabi storage through pre-signed URLs.
3. **FR3**: The system must generate and display thumbnails for uploaded videos.
4. **FR4**: Users must be able to view all their uploaded videos in a grid layout with thumbnails.
5. **FR5**: Users must be able to initiate watermarking for any uploaded video through a dedicated button.
6. **FR6**: The system must integrate with the external watermarking service via API with token authentication.
7. **FR7**: The system must provide a callback endpoint for the external watermarking service to notify when processing is complete.
8. **FR8**: The system must display watermarked videos alongside their original versions in the grid view.
9. **FR9**: Users must be able to generate public URLs for sharing watermarked videos only.
10. **FR10**: Users must be able to delete both original and watermarked versions of their videos.
11. **FR11**: The system must show appropriate status indicators during video upload and watermarking processes.
12. **FR12**: Users must only be able to access and manage their own videos (user isolation).
13. **FR13**: The system must handle errors gracefully during upload, watermarking, and deletion processes.
14. **FR14**: The application must provide toast notifications for important events (upload complete, watermarking complete, errors).

### Non Functional

1. **NFR1**: The application must be responsive and work on both desktop and mobile devices.
2. **NFR2**: The application must support video uploads up to 500MB in size.
3. **NFR3**: The user interface must be intuitive with minimal learning curve (no more than 5 steps to complete the watermarking workflow).
4. **NFR4**: The application must maintain 99.9% uptime for critical operations.
5. **NFR5**: Page load times must be under 2 seconds for the main dashboard.
6. **NFR6**: The application must securely handle authentication tokens and API credentials.
7. **NFR7**: The system must implement proper error handling and recovery for asynchronous processes.
8. **NFR8**: The application must be deployable using Docker and Docker Compose.
9. **NFR9**: The codebase must follow best practices for Next.js and React development.
10. **NFR10**: The application must implement proper database indexing for efficient queries.

## User Interface Design Goals

### Overall UX Vision

The SAVD App aims to provide a clean, intuitive interface that focuses on the core functionality of video management and watermarking. The design should emphasize simplicity and efficiency, allowing users to quickly upload, watermark, and share their videos with minimal friction. The interface should provide clear visual feedback for asynchronous operations and maintain a consistent layout across different devices.

### Key Interaction Paradigms

- **Grid-based Content Display**: Videos are presented in a grid layout with original and watermarked versions side by side for easy comparison and management.
- **Action-Oriented Buttons**: Primary actions (upload, watermark, share, delete) are prominently displayed with clear labels and icons.
- **Status Indicators**: Visual indicators show the current status of operations (uploading, processing, completed, error).
- **Toast Notifications**: Non-intrusive notifications provide feedback for completed operations and errors.
- **Drag-and-Drop**: Intuitive drag-and-drop functionality for video uploads with fallback button option.
- **Responsive Adaptation**: Interface elements reorganize based on screen size while maintaining functionality.

### Core Screens and Views

- **Login/Registration Screen**: Simple form with email/password fields and authentication options.
- **Video Dashboard**: Main grid view showing all user videos with thumbnails and action buttons.
- **Upload Interface**: Drag-and-drop area with progress indicator and file selection button.
- **Video Actions Panel**: Contextual actions for each video (watermark, share, delete).
- **Public URL Generation Dialog**: Interface for creating and copying shareable links.
- **User Profile**: Basic profile management with account settings.

### Accessibility: WCAG AA

The application should meet WCAG AA accessibility standards, including:

- Proper color contrast for text and interactive elements
- Keyboard navigation support for all features
- Screen reader compatibility for critical functions
- Focus indicators for interactive elements
- Alternative text for all images and thumbnails

### Branding

The application should follow a clean, professional design aesthetic with:

- A neutral color palette with accent colors for important actions
- Consistent typography using the Geist font family
- Minimal use of decorative elements, focusing on functionality
- Clear visual hierarchy emphasizing content and actions

### Target Device and Platforms: Web Responsive

The application must work seamlessly across:

- Desktop browsers (Chrome, Firefox, Safari, Edge - latest 2 versions)
- Mobile browsers on iOS and Android
- Tablet devices in both portrait and landscape orientations

## Technical Assumptions

### Repository Structure: Monorepo

The project will maintain a monorepo structure with the Next.js application containing both frontend and backend code. This approach simplifies deployment and ensures consistency between client and server components. The repository will include dedicated directories for components, API routes, utilities, and configuration files.

### Service Architecture

The application will follow a serverless architecture pattern using Next.js API routes for backend functionality. This architecture leverages:

- **Next.js App Router**: For page routing and server components
- **Next.js API Routes**: For backend functionality and external service integration
- **Supabase**: For authentication and database management
- **Wasabi S3 SDK**: For cloud storage operations
- **External Watermarking Service**: For video processing via API

This architecture minimizes server management overhead while providing scalability for the application's needs.

### Testing Requirements

The application requires a comprehensive testing approach including:

- **Unit Tests**: For individual components and utility functions using Jest and React Testing Library
- **Integration Tests**: For API routes and service integrations
- **End-to-End Tests**: For critical user flows using Cypress or Playwright
- **Manual Testing**: For visual verification and edge cases

Test coverage should focus on critical paths including authentication, file uploads, watermarking operations, and public URL generation.

### Additional Technical Assumptions and Requests

- **Environment Variables**: Sensitive configuration (API keys, tokens) must be stored in environment variables
- **Error Handling**: Implement robust error handling for API calls and asynchronous operations
- **TypeScript**: Use TypeScript for all components and API routes for type safety
- **State Management**: Use React hooks for local state and context for shared state
- **API Documentation**: Document all API endpoints with request/response formats
- **Database Migrations**: Use Supabase migrations for database schema changes
- **Caching Strategy**: Implement appropriate caching for thumbnails and frequently accessed data
- **Security Headers**: Configure proper security headers for all API responses

## Epic List

1. **Epic 1: Authentication & User Management** - Implement secure user authentication and profile management
2. **Epic 2: Video Upload & Storage** - Enable video uploading to Wasabi with proper metadata management
3. **Epic 3: Video Watermarking Integration** - Implement the external watermarking service integration
4. **Epic 4: Video Management & Sharing** - Create the video management interface with sharing capabilities
5. **Epic 5: UI Refinement & Mobile Optimization** - Polish the user interface and ensure mobile compatibility

## Epic 1: Authentication & User Management

As the foundation for the application, this epic establishes secure user authentication and basic profile management to ensure users can securely access their content.

### Story 1.1 Implement Supabase Authentication

As a user,
I want to register and log in to the application using my email and password,
so that I can securely access my content.

#### Acceptance Criteria

1: User can register with email and password
2: User can log in with registered credentials
3: User receives appropriate error messages for invalid inputs
4: User session is maintained across page refreshes
5: Authentication state is properly managed in the application

### Story 1.2 Create Protected Routes

As a developer,
I want to implement protected routes in the application,
so that unauthenticated users cannot access restricted content.

#### Acceptance Criteria

1: Unauthenticated users are redirected to the login page when attempting to access protected routes
2: Authenticated users can access protected routes
3: Authentication state is checked on initial page load
4: Route protection is implemented using Next.js middleware or equivalent

### Story 1.3 Implement User Profile Management

As a user,
I want to view and edit my profile information,
so that I can manage my account details.

#### Acceptance Criteria

1: User can view their profile information
2: User can update their display name and email
3: Changes are saved to the Supabase database
4: User receives confirmation when changes are saved
5: Input validation prevents invalid data submission

### Story 1.4 Create User Logout Functionality

As a user,
I want to log out of the application,
so that I can secure my account when I'm done using the application.

#### Acceptance Criteria

1: User can log out via a button in the navigation or profile menu
2: Logout clears the user session
3: User is redirected to the login page after logout
4: User cannot access protected routes after logout without logging in again

## Epic 2: Video Upload & Storage

This epic focuses on implementing the core functionality for uploading videos to Wasabi storage and managing their metadata in the database.

### Story 2.1 Create Video Upload Component

As a user,
I want to upload videos through a drag-and-drop interface,
so that I can easily add content to the application.

#### Acceptance Criteria

1: User can drag and drop video files onto the upload area
2: User can click a button to select videos from their device
3: Upload component validates file types and sizes before uploading
4: Upload component shows a preview of selected files before upload
5: Component is responsive and works on mobile devices

### Story 2.2 Implement Pre-signed URL Generation

As a developer,
I want to generate pre-signed URLs for direct uploads to Wasabi,
so that users can securely upload large files without server limitations.

#### Acceptance Criteria

1: API endpoint generates pre-signed URLs for Wasabi uploads
2: Pre-signed URLs include necessary security parameters
3: URLs are generated with appropriate expiration times
4: Error handling for failed URL generation
5: Authentication and authorization checks are performed

### Story 2.3 Create Video Upload Process

As a user,
I want to see the progress of my video uploads,
so that I know when they will be completed.

#### Acceptance Criteria

1: Upload progress is displayed with a progress bar
2: User receives notification when upload is complete
3: Uploaded videos appear in the grid view after completion
4: Error messages are displayed for failed uploads
5: User can cancel uploads in progress

### Story 2.4 Implement Video Metadata Storage

As a developer,
I want to store video metadata in the database,
so that we can track and manage uploaded videos.

#### Acceptance Criteria

1: Video metadata is saved to Supabase database on successful upload
2: Metadata includes filename, size, upload date, and storage URL
3: Videos are associated with the correct user account
4: Database schema includes appropriate indexes for efficient queries
5: Row-level security policies ensure users can only access their own videos

## Epic 3: Video Watermarking Integration

This epic covers the integration with the external watermarking service and the implementation of the watermarking workflow.

### Story 3.1 Implement Watermarking API Integration

As a developer,
I want to integrate with the external watermarking service API,
so that users can create watermarked versions of their videos.

#### Acceptance Criteria

1: API client is configured with proper authentication
2: API requests include all required parameters
3: Error handling for failed API calls
4: Retry logic for transient failures
5: API responses are properly parsed and handled

### Story 3.2 Create Watermarking Request Flow

As a user,
I want to request watermarking for my uploaded videos,
so that I can create protected versions for sharing.

#### Acceptance Criteria

1: User can click a "Create Watermarked Version" button for each video
2: System sends appropriate request to external watermarking service
3: User sees a loading indicator while watermarking is in progress
4: Database is updated with watermarking request status
5: Error handling for failed watermarking requests

### Story 3.3 Implement Callback Handling

As a developer,
I want to implement a callback endpoint for the watermarking service,
so that the application can be notified when watermarking is complete.

#### Acceptance Criteria

1: Callback endpoint is accessible to the external service
2: Endpoint validates incoming requests for authenticity
3: System updates database with watermarked video information
4: User interface is updated to show watermarked version
5: Error handling for failed callbacks

### Story 3.4 Display Watermarked Videos

As a user,
I want to see watermarked versions of my videos alongside originals,
so that I can easily manage and compare them.

#### Acceptance Criteria

1: Watermarked videos are displayed in the grid view next to originals
2: Thumbnails are generated for watermarked videos
3: UI clearly distinguishes between original and watermarked versions
4: Watermarked videos show appropriate status indicators
5: UI updates automatically when watermarking is complete

## Epic 4: Video Management & Sharing

This epic focuses on implementing the functionality for managing videos and sharing watermarked versions.

### Story 4.1 Implement Video Grid View

As a user,
I want to see all my videos in a grid layout,
so that I can easily browse and manage my content.

#### Acceptance Criteria

1: Videos are displayed in a responsive grid layout
2: Grid shows thumbnails for each video
3: Original and watermarked versions are displayed side by side
4: Grid adapts to different screen sizes
5: Videos are loaded with pagination for performance

### Story 4.2 Create Video Deletion Functionality

As a user,
I want to delete videos I no longer need,
so that I can manage my content library.

#### Acceptance Criteria

1: User can delete original videos with a delete button
2: User can delete watermarked versions separately
3: Confirmation dialog prevents accidental deletion
4: Files are removed from Wasabi storage
5: Database records are updated accordingly

### Story 4.3 Implement Public URL Generation

As a user,
I want to generate public URLs for my watermarked videos,
so that I can share them with others.

#### Acceptance Criteria

1: User can generate a public URL for any watermarked video
2: System creates a secure token for public access
3: Public URLs do not expose original videos
4: User can copy URL to clipboard with a button
5: User can revoke public access when needed

### Story 4.4 Create Public Video Viewing Page

As a developer,
I want to create a public page for viewing shared videos,
so that recipients can watch watermarked videos without authentication.

#### Acceptance Criteria

1: Public page displays watermarked video using secure token
2: Page includes basic video controls
3: Page is responsive and works on mobile devices
4: Invalid or expired tokens show appropriate error messages
5: Page does not allow access to other videos or application features

## Epic 5: UI Refinement & Mobile Optimization

This epic focuses on polishing the user interface and ensuring a great experience across all devices.

### Story 5.1 Implement Toast Notifications

As a user,
I want to receive toast notifications for important events,
so that I'm informed about the status of my actions.

#### Acceptance Criteria

1: Toast notifications appear for completed uploads
2: Notifications show for watermarking completion
3: Error notifications provide helpful information
4: Notifications are non-intrusive and dismissible
5: Notifications are styled consistently with the application theme

### Story 5.2 Create Loading States and Animations

As a user,
I want to see appropriate loading states during operations,
so that I know the application is working.

#### Acceptance Criteria

1: Loading indicators appear during API calls
2: Upload and processing operations show progress when possible
3: Skeleton loaders appear when content is loading
4: Animations are subtle and professional
5: Loading states are accessible and work with screen readers

### Story 5.3 Optimize Mobile Experience

As a mobile user,
I want the application to work well on my device,
so that I can manage my videos on the go.

#### Acceptance Criteria

1: All features are functional on mobile devices
2: Touch targets are appropriately sized
3: Layout adapts to different screen sizes
4: Mobile-specific interactions (swipe, etc.) are implemented where appropriate
5: Performance is optimized for mobile networks

### Story 5.4 Implement Error Handling UI

As a user,
I want to see clear error messages when something goes wrong,
so that I can understand and resolve issues.

#### Acceptance Criteria

1: Error states are visually distinct
2: Error messages are clear and actionable
3: Critical errors provide recovery options when possible
4: Form validation errors appear inline with fields
5: System errors are logged for troubleshooting

## Next Steps

### UX Expert Prompt

As a UX Expert, please review the PRD for the SAVD App and focus on creating detailed wireframes and interaction designs for the video management interface. Pay special attention to the grid view layout, upload flow, and watermarking process indicators. The design should be clean, intuitive, and follow the Shadcn UI design system with Tailwind CSS.

### Architect Prompt

As an Architect, please review the PRD for the SAVD App and create a detailed technical implementation plan. Focus on the integration between Next.js API routes, Supabase, and the external watermarking service. Design the database schema with appropriate indexes and security policies. Provide guidance on implementing the asynchronous watermarking workflow with proper error handling and recovery mechanisms.

NOTE: Addition details are in the `implementation-guides` folder. Review those documents for additional details.
