# SAVD App - Architecture Documentation

## Introduction

This directory contains comprehensive architecture documentation for the SAVD App. The documentation is organized into multiple focused documents that cover different aspects of the system architecture, from high-level overview to detailed implementation guidelines.

## Document Structure

### 1. [Architecture Overview](./00-architecture-overview.md)

A high-level overview of the SAVD App architecture, including key components, integrations, and architectural principles. This document serves as an entry point to understand the overall system design.

### 2. [Frontend Architecture](./01-frontend-architecture.md)

Detailed documentation of the frontend architecture, including component organization, state management, routing strategy, and UI/UX considerations. This document focuses on the React/Next.js implementation and client-side concerns.

### 3. [Backend API Architecture](./02-backend-api-architecture.md)

Comprehensive documentation of the backend API architecture, including API endpoints, authentication/authorization, error handling, and external service integration. This document focuses on the Next.js API routes implementation.

### 4. [Database Design](./03-database-design.md)

Detailed database schema design, including tables, relationships, indexes, views, functions, triggers, and security policies. This document focuses on the Supabase PostgreSQL implementation and data modeling.

### 5. [Authentication & Security](./04-authentication-security.md)

In-depth documentation of the authentication and security architecture, including user authentication flow, authorization controls, data security, and security best practices.

### 6. Video Processing Workflows

A series of documents detailing the video processing workflows:

- [6.1 Video Upload Workflow](./05a-video-upload-workflow.md): Implementation of secure video uploads to Wasabi storage using pre-signed URLs.
- [6.2 Watermarking Workflow](./05b-watermarking-workflow.md): Integration with the external watermarking service, including asynchronous processing and callback handling.
- [6.3 Public Sharing Workflow](./05c-public-sharing-workflow.md): Implementation of secure public URL generation for watermarked videos.

### 7. [Deployment & DevOps](./06-deployment-devops.md)

Comprehensive documentation of the deployment architecture and DevOps practices, including containerization, CI/CD pipeline, monitoring, logging, and operational considerations.

## Key Architecture Decisions

1. **Next.js App Router**: Using Next.js App Router for server components, API routes, and client-side rendering.

2. **Supabase Integration**: Leveraging Supabase for authentication and PostgreSQL database with row-level security.

3. **Wasabi Storage**: Using Wasabi S3-compatible storage for video files with pre-signed URLs for direct uploads.

4. **External Watermarking Service**: Integrating with an external service for video watermarking via asynchronous API.

5. **Docker Containerization**: Containerizing the application with Docker for consistent environments across development and production.

6. **Security-First Approach**: Implementing comprehensive security measures at all levels of the application.

7. **Asynchronous Processing**: Using asynchronous workflows for video processing to handle long-running operations.

## Implementation Roadmap

The implementation follows the phased approach outlined in the [Implementation Roadmap](../implementation-roadmap.md) document:

1. **Phase 1**: Project Setup & Foundation (Authentication & User Management)
2. **Phase 2**: Video Upload & Storage
3. **Phase 3**: Video Watermarking Integration
4. **Phase 4**: Video Management & Sharing
5. **Phase 5**: UI Refinement & Mobile Optimization

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            Client Browser                               │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             Next.js App                                 │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │                 │  │                 │  │                         │  │
│  │  React UI       │  │  API Routes     │  │  Server Components      │  │
│  │  (Shadcn UI)    │  │                 │  │                         │  │
│  │                 │  │                 │  │                         │  │
│  └─────────────────┘  └────────┬────────┘  └─────────────────────────┘  │
│                                │                                        │
└────────────────────────────────┼────────────────────────────────────────┘
                                 │
                                 ▼
┌───────────────┐  ┌─────────────────────┐  ┌───────────────────────────┐
│               │  │                     │  │                           │
│  Supabase     │◀─┼─▶ External          │  │ Wasabi Cloud Storage      │
│  (Auth & DB)  │  │  Watermarking       │  │ (Video Storage)           │
│               │  │  Service            │  │                           │
└───────────────┘  └─────────────────────┘  └───────────────────────────┘
```

## Technology Stack

- **Frontend**: Next.js, React, TypeScript, Shadcn UI, Tailwind CSS
- **Backend**: Next.js API Routes, Node.js
- **Database**: Supabase PostgreSQL
- **Storage**: Wasabi S3-compatible Storage
- **Authentication**: Supabase Auth
- **External Services**: Third-party Watermarking API
- **DevOps**: Docker, Docker Compose, GitHub Actions, Nginx

## Best Practices

Throughout the architecture documentation, we emphasize the following best practices:

1. **Security**: Implementing security at all layers of the application
2. **Scalability**: Designing for growth and increased load
3. **Maintainability**: Creating clean, well-documented code and architecture
4. **Performance**: Optimizing for speed and resource efficiency
5. **Resilience**: Building robust error handling and recovery mechanisms
6. **User Experience**: Focusing on intuitive, responsive interfaces

## Additional Resources

- [Project Brief](../brief.md): High-level overview of the SAVD App
- [Technical Architecture](../technical-architecture.md): Simplified technical architecture document
- [Product Requirements Document](../prd.md): Detailed product requirements
- [Database Schema](../database-schema.md): Database schema documentation
- [API Specification](../api-specification.md): API endpoint specifications
- [Implementation Guides](../implementation-guides/00-index.md): Detailed implementation guides

## Contributing to Architecture

When contributing to the architecture documentation:

1. Follow the established document structure
2. Update diagrams when making significant changes
3. Document key decisions and their rationales
4. Ensure consistency across all architecture documents
5. Consider security, performance, and scalability implications
