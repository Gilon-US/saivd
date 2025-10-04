# Project Brief: SAVD App

## Executive Summary

SAVD App is a web application that enables users to upload video files and create watermarked versions of those videos through an external watermarking service. The application provides a clean, user-friendly interface where users can manage their original videos and watermarked versions, with features for creating, viewing, sharing, and deleting both types of videos. The solution addresses the need for secure, user-specific video watermarking with minimal friction, leveraging modern web technologies including Next.js, Supabase, and Wasabi cloud storage.

## Problem Statement

Content creators and businesses frequently need to share videos while maintaining ownership and preventing unauthorized redistribution. Current solutions for video watermarking are often:

- Complex and require technical expertise
- Expensive and not accessible to individual creators
- Not integrated with content management systems
- Lacking user-friendly interfaces for managing original and watermarked content
- Missing features for easy sharing of protected content

The SAVD App addresses these pain points by providing a streamlined, user-friendly solution for video watermarking and management that doesn't require technical expertise while maintaining security and ownership of content.

## Proposed Solution

SAVD App provides an end-to-end solution for video watermarking and management:

- A secure authentication system allowing users to manage their own video content
- Intuitive upload functionality for video files with direct storage to Wasabi cloud
- On-demand watermarking through integration with an external watermarking service
- Side-by-side grid view of original and watermarked videos for easy management
- Public URL generation for sharing watermarked videos only
- Complete video lifecycle management (upload, watermark, share, delete)

The solution leverages modern web technologies (Next.js, Supabase, Wasabi) to create a responsive, secure application that handles the complexities of video storage and processing while presenting a simple interface to users.

## Target Users

### Primary User Segment: Content Creators

- **Demographics**: Individual content creators, small to medium businesses, marketing professionals
- **Current Behaviors**: Creating video content that needs protection before sharing with clients or publishing online
- **Pain Points**: 
  - Lack of simple tools to protect video content
  - Time-consuming process to watermark videos
  - Difficulty managing original and watermarked versions
  - Need for secure sharing options
- **Goals**: 
  - Protect intellectual property in video content
  - Streamline the process of creating shareable, protected videos
  - Maintain organization between original and watermarked content

### Secondary User Segment: Business Teams

- **Demographics**: Marketing teams, sales teams, training departments
- **Current Behaviors**: Sharing video content internally and externally while maintaining brand control
- **Pain Points**:
  - Need for consistent branding across shared videos
  - Managing access to original vs. watermarked content
  - Tracking which videos have been watermarked and shared
- **Goals**:
  - Maintain brand consistency across shared videos
  - Control which team members can access original content
  - Easily track and manage shared watermarked content

## Goals & Success Metrics

### Business Objectives

- Build a fully functional video watermarking management application within 3 months
- Achieve 90% user satisfaction rating for ease of use and functionality
- Process at least 1,000 videos through the watermarking service within 6 months of launch
- Maintain 99.9% uptime for the application and associated services

### User Success Metrics

- Users can successfully upload and watermark videos in less than 5 steps
- Average time from upload to watermarked video availability is under 5 minutes
- Users can locate and manage their videos with minimal navigation (2 clicks or less)
- Public URL sharing works reliably across different platforms and devices

### Key Performance Indicators (KPIs)

- **User Engagement**: Average number of videos uploaded per user per month
- **Processing Efficiency**: Average time from upload to watermarked version availability
- **System Reliability**: Percentage of successful watermarking operations vs. failures
- **User Satisfaction**: Net Promoter Score from user feedback
- **Technical Performance**: Average page load time and API response time

## MVP Scope

### Core Features (Must Have)

- **User Authentication**: Secure login/registration system using Supabase Auth
- **Video Upload**: Ability to upload video files directly to Wasabi storage
- **Video Grid View**: Thumbnail display of original and watermarked videos side by side
- **Watermark Creation**: Button to initiate watermarking process for uploaded videos
- **Watermark Status**: Visual indication of watermarking process status
- **Public URL Generation**: Ability to get shareable links for watermarked videos
- **Video Management**: Delete functionality for both original and watermarked videos
- **User Isolation**: Users can only see and manage their own videos
- **Responsive Design**: Mobile-friendly interface that works across devices

### Out of Scope for MVP

- Batch watermarking of multiple videos
- Custom watermark designs or positioning
- Video editing capabilities
- Analytics on video views or shares
- Team collaboration features
- Advanced search and filtering
- Video preview functionality within the app
- Multiple watermarked versions of the same video

### MVP Success Criteria

The MVP will be considered successful when users can complete the entire workflow (upload, watermark, share, delete) without errors or support, with watermarking operations completing successfully at least 95% of the time, and when the application can handle at least 100 concurrent users without performance degradation.

## Post-MVP Vision

### Phase 2 Features

- **Batch Operations**: Select and watermark multiple videos at once
- **Custom Watermarks**: Allow users to upload and position custom watermarks
- **Video Preview**: In-app video playback for both original and watermarked videos
- **Advanced Search**: Filter and search functionality for video library
- **Usage Analytics**: Dashboard showing video uploads, watermarking, and sharing metrics
- **Email Notifications**: Alert users when watermarking process completes

### Long-term Vision

- **Team Collaboration**: Shared video libraries with role-based permissions
- **API Access**: Allow programmatic access to watermarking services
- **Additional Processing Options**: Compression, format conversion, and other video processing
- **Integration Ecosystem**: Connect with popular content management and marketing platforms
- **Enterprise Features**: SSO, advanced security, and compliance capabilities

### Expansion Opportunities

- **Additional Media Types**: Expand to support image and document watermarking
- **AI-Enhanced Features**: Automatic content tagging and categorization
- **Marketplace**: Allow third-party watermarking services to integrate with the platform
- **White-Label Solution**: Enable businesses to deploy branded versions of the application

## Technical Considerations

### Platform Requirements

- **Target Platforms:** Web browsers (desktop and mobile)
- **Browser/OS Support:** Latest 2 versions of Chrome, Firefox, Safari, Edge
- **Performance Requirements:** Video upload handling up to 500MB, page load times under 2 seconds

### Technology Preferences

- **Frontend:** Next.js 15+, TypeScript, Tailwind CSS, Shadcn UI
- **Backend:** Next.js API routes, Supabase
- **Database:** PostgreSQL (via Supabase)
- **Hosting/Infrastructure:** Docker containers, Docker Compose for deployment

### Architecture Considerations

- **Repository Structure:** Monorepo with frontend and backend in single Next.js project
- **Service Architecture:** 
  - Next.js frontend with server components and API routes
  - Supabase for authentication and database
  - External watermarking service integration via API
  - Wasabi for video storage using pre-signed URLs
- **Integration Requirements:** 
  - External watermarking service API with token authentication
  - Callback URL handling for asynchronous watermarking completion
  - Wasabi S3-compatible storage API
- **Security/Compliance:** 
  - Authentication and authorization via Supabase
  - Secure handling of video assets
  - User isolation for content access

## Constraints & Assumptions

### Constraints

- **Budget:** TBD - Requires Wasabi storage costs, Supabase costs, and external watermarking service costs
- **Timeline:** 3 months to MVP launch
- **Resources:** Development team with Next.js and Supabase expertise
- **Technical:** 
  - External watermarking service has its own limitations and SLA
  - Video size limitations based on upload and processing capabilities
  - Wasabi storage costs scale with usage

### Key Assumptions

- The external watermarking service is reliable and can handle our expected volume
- Users have modern web browsers that support the required technologies
- Video watermarking processing times are acceptable to users (within minutes, not hours)
- Wasabi storage provides sufficient performance for video uploads and retrieval
- The callback mechanism from the external watermarking service is reliable
- Users understand the concept of watermarking and its purpose

## Risks & Open Questions

### Key Risks

- **External Service Dependency:** Reliance on third-party watermarking service creates a potential point of failure
- **Scalability Challenges:** Video processing and storage could face bottlenecks with high user volumes
- **User Experience Complexity:** Balancing simplicity with functionality could be challenging
- **Security Concerns:** Ensuring proper access controls for video content across the system
- **Cost Management:** Storage and processing costs could scale unpredictably with usage

### Open Questions

- What are the specific limitations of the external watermarking service?
- How will the system handle very large video files?
- What happens if the callback from the watermarking service fails?
- How will we handle different video formats and compatibility issues?
- What metrics should we track to evaluate system performance and user satisfaction?

### Areas Needing Further Research

- Performance optimization for video upload and retrieval
- Best practices for secure video storage and access control
- User experience patterns for media management applications
- Scaling strategies for video processing applications
- Error handling and recovery for asynchronous processes

## Next Steps

1. Create detailed technical architecture document
2. Set up development environment with Next.js, Supabase, and Wasabi integration
3. Implement authentication and basic user management
4. Develop video upload functionality with Wasabi storage
5. Create the video management UI with grid view
6. Implement integration with external watermarking service
7. Develop callback handling for watermarking completion
8. Implement public URL generation for watermarked videos
9. Create comprehensive testing plan for all components
10. Plan deployment strategy using Docker and Docker Compose
