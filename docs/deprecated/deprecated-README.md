# SAVD App - Technical Documentation

## Introduction

Welcome to the SAVD App technical documentation. This documentation provides comprehensive information about the architecture, implementation, deployment, and security of the SAVD App, a Next.js application for uploading files to Wasabi Cloud Storage.

## Documentation Overview

This documentation is organized into several sections, each focusing on a specific aspect of the application:

### Core Documentation

1. [**Project Documentation**](./project-documentation.md)  
   Comprehensive overview of the project, including architecture, technology stack, components, and features.

2. [**API Documentation**](./api-documentation.md)  
   Detailed information about the API endpoints, request/response formats, and usage examples.

3. [**Deployment Guide**](./deployment-guide.md)  
   Instructions for deploying the application in development and production environments.

4. [**Architecture Diagram**](./architecture-diagram.md)  
   Visual representations of the application architecture, data flow, and component relationships.

5. [**Security Guide**](./security-guide.md)  
   Security considerations, best practices, and recommendations for hardening the application.

## Quick Start

For new developers joining the project, we recommend following these steps:

1. **Setup Development Environment**:
   - Follow the installation instructions in the [Project Documentation](./project-documentation.md#setup-and-installation)
   - Configure your environment variables as described in the [Deployment Guide](./deployment-guide.md#environment-configuration)

2. **Understand the Architecture**:
   - Review the [Architecture Diagram](./architecture-diagram.md) to understand the system components
   - Read the [Project Documentation](./project-documentation.md#architecture-overview) for detailed explanations

3. **API Integration**:
   - Refer to the [API Documentation](./api-documentation.md) for endpoint details and usage examples
   - Understand the file upload flow described in the [Project Documentation](./project-documentation.md#data-flow)

4. **Deployment**:
   - Follow the [Deployment Guide](./deployment-guide.md) for development and production deployment
   - Review the [Security Guide](./security-guide.md) for security best practices

## Key Features

- 🚀 **Next.js 15** with TypeScript
- 🎨 **Tailwind CSS** for styling  
- 🧩 **Shadcn UI** component library
- ☁️ **Wasabi Cloud Storage** integration
- 📁 **Drag & drop file uploads**
- 📊 **Upload progress tracking**
- 🎉 **Toast notifications**
- 🐳 **Docker** support for development and production

## Technology Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Shadcn UI
- **File Upload**: React Dropzone
- **Cloud Storage**: Wasabi (S3-compatible)
- **AWS SDK**: v3 (for S3 operations)
- **Containerization**: Docker with multi-stage builds
- **Web Server**: Nginx (production)
- **Caching**: Redis (optional in production)

## Project Structure

```
savd-app/
├── docs/                     # Project documentation
├── nginx/                    # Nginx configuration
├── public/                   # Static assets
├── scripts/                  # Utility scripts
├── src/                      # Application source code
│   ├── app/                  # Next.js App Router
│   ├── components/           # React components
│   └── lib/                  # Utility libraries
├── docker-compose.yml        # Development Docker Compose
├── docker-compose.prod.yml   # Production Docker Compose
└── Dockerfile                # Multi-stage Docker build
```

## Contributing

When contributing to this project, please:

1. Review the [Project Documentation](./project-documentation.md) to understand the architecture
2. Follow the code style and conventions used in the project
3. Write tests for new features and ensure all tests pass
4. Update documentation as needed
5. Submit pull requests with clear descriptions of changes

## Troubleshooting

For common issues and their solutions, refer to:

- [Deployment Guide - Troubleshooting](./deployment-guide.md#troubleshooting)
- [Security Guide - Common Issues](./security-guide.md#security-risks)
- [Project Documentation - Known Limitations](./project-documentation.md#performance-optimizations)

## Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Wasabi Cloud Storage Documentation](https://wasabi.com/help/documentation/)
- [AWS SDK v3 Documentation](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
- [Docker Documentation](https://docs.docker.com/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Shadcn UI Documentation](https://ui.shadcn.com/)
