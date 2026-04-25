# SAVD App - Architecture Overview

## Introduction

This document provides a comprehensive overview of the SAVD App architecture, focusing on the integration between Next.js API routes, Supabase, and the external watermarking service. The architecture is designed to support the requirements outlined in the PRD, with particular emphasis on security, scalability, and maintainability.

## Architecture Principles

1. **Security First**: Implement security at all layers of the application
2. **Scalable Design**: Architecture should scale with increasing users and video content
3. **Resilient Processing**: Robust error handling and recovery for asynchronous processes
4. **Clear Boundaries**: Well-defined interfaces between system components
5. **Developer Experience**: Maintainable codebase with clear patterns and practices

## High-Level Architecture

The SAVD App follows a modern web application architecture with the following key components:

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

## Core Components

1. **Frontend Layer**
   - Next.js React components with App Router
   - Shadcn UI component library with Tailwind CSS
   - Client-side state management using React hooks and context

2. **API Layer**
   - Next.js API routes for backend functionality
   - Authentication middleware for protected routes
   - Error handling and validation middleware

3. **Service Layer**
   - Supabase client for authentication and database operations
   - Wasabi S3 client for video storage
   - External watermarking service client

4. **Data Layer**
   - Supabase PostgreSQL database with row-level security
   - Wasabi S3 for video file storage
   - Redis for caching (optional, for future scaling)

## Key Integrations

1. **Supabase Integration**
   - Authentication with JWT tokens
   - Database with row-level security policies
   - Real-time subscriptions for status updates

2. **Wasabi Storage Integration**
   - Pre-signed URLs for direct uploads
   - Secure access control for video files
   - Thumbnail generation and storage

3. **External Watermarking Service Integration**
   - Asynchronous API requests
   - Webhook callbacks for completion notification
   - Error handling and retry mechanisms

## Architecture Documents

This architecture is divided into the following detailed documents:

1. [Frontend Architecture](./01-frontend-architecture.md)
2. [Backend API Architecture](./02-backend-api-architecture.md)
3. [Database Design](./03-database-design.md)
4. [Authentication & Security](./04-authentication-security.md)
5. [Video Processing Workflow](./05-video-processing-workflow.md)
6. [Deployment & DevOps](./06-deployment-devops.md)

## Implementation Roadmap

The implementation will follow a phased approach aligned with the epics defined in the PRD:

1. **Phase 1**: Authentication & User Management
2. **Phase 2**: Video Upload & Storage
3. **Phase 3**: Video Watermarking Integration
4. **Phase 4**: Video Management & Sharing
5. **Phase 5**: UI Refinement & Mobile Optimization

Each phase will include comprehensive testing, documentation, and security reviews before proceeding to the next phase.
