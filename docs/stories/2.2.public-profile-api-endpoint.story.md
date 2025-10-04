# Story 2.2: Public Profile API Endpoint

## Status
Ready for Review

## Story
**As a** frontend developer,
**I want** a public API endpoint to fetch user profile data by user ID,
**so that** I can display public user profiles without requiring authentication.

## Acceptance Criteria
1. API endpoint `/api/profile/[userId]` accepts GET requests with user ID parameter
2. Endpoint validates user ID format (must be valid UUID)
3. Endpoint returns public profile data (id, display_name, bio, photo) for valid users
4. Endpoint returns appropriate error responses for invalid requests (400, 404, 500)
5. Endpoint works without authentication (public access)
6. Response format follows standardized JSON structure with success/error indicators
7. Endpoint includes proper error logging for debugging
8. API includes rate limiting considerations for public access

## Tasks / Subtasks
- [x] Create dynamic API route structure (AC: 1)
  - [x] Create directory `/src/app/api/profile/[userId]/`
  - [x] Implement `route.ts` file with GET handler
  - [x] Configure Next.js dynamic routing for userId parameter
  - [x] Test route accessibility and parameter extraction

- [x] Implement UUID validation utility (AC: 2)
  - [x] Create or update `/src/utils/validation.ts` with `isValidUUID` function
  - [x] Implement proper UUID format validation (RFC 4122)
  - [x] Add validation error handling with descriptive messages
  - [x] Test validation with valid and invalid UUID formats

- [x] Implement profile data fetching logic (AC: 3, 5)
  - [x] Set up Supabase client for public access (no auth required)
  - [x] Query profiles table with SELECT on specific fields only
  - [x] Filter query by user ID parameter
  - [x] Handle single record retrieval with proper error checking

- [x] Implement comprehensive error handling (AC: 4, 7)
  - [x] Add 400 response for invalid UUID format
  - [x] Add 404 response for user not found
  - [x] Add 500 response for server/database errors
  - [x] Include proper error logging with context information
  - [x] Ensure error messages are user-friendly but not revealing sensitive info

- [x] Standardize response format (AC: 6)
  - [x] Implement consistent JSON response structure
  - [x] Include success boolean indicator in all responses
  - [x] Structure data field for successful responses
  - [x] Structure error field for failed responses
  - [x] Add proper HTTP status codes for all response types

- [x] Add API tests and validation (AC: 1-8)
  - [x] Create unit tests for UUID validation function
  - [x] Create integration tests for API endpoint
  - [x] Test successful profile retrieval scenarios
  - [x] Test all error scenarios (invalid UUID, user not found, server error)
  - [x] Test public access (no authentication required)
  - [x] Performance testing for response times

## Dev Notes

### Architecture Context
This story implements Phase 2 of the Public User Profile Feature. It creates the API layer that will be consumed by the public profile page component in Story 2.3.

### API Specifications
[Source: docs/architecture/public-user-profile-feature.md#api-layer]

**Endpoint Structure:**
- **Method**: GET
- **Path**: `/api/profile/[userId]`
- **Authentication**: None required (public access)
- **Parameters**: userId (UUID format in URL path)

**Response Format:**
```json
// Success Response (200)
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "display_name": "John Doe",
    "bio": "Software developer and video creator",
    "photo": "https://example.com/photos/user-123.jpg"
  }
}

// Error Responses
{
  "success": false,
  "error": "Invalid user ID format"  // 400
}

{
  "success": false,
  "error": "User not found"  // 404
}

{
  "success": false,
  "error": "Server error"  // 500
}
```

### Implementation Details
[Source: docs/architecture/public-user-profile-feature.md#api-route-implementation]

**Complete API Implementation:**
```typescript
// /src/app/api/profile/[userId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { isValidUUID } from '@/utils/validation';

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;
    
    // Validate UUID format
    if (!isValidUUID(userId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid user ID format' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    
    // Fetch public profile data - no auth required due to public RLS policy
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, display_name, bio, photo')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      console.log(`Profile not found for user ID: ${userId}`);
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: profile
    });
  } catch (error) {
    console.error('Error fetching public profile:', error);
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    );
  }
}
```

**UUID Validation Utility:**
```typescript
// /src/utils/validation.ts
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}
```

### Security Considerations
[Source: docs/architecture/public-user-profile-feature.md#security-considerations]

**Public Access Security:**
- No authentication required (relies on RLS policy from Story 2.1)
- Only safe profile fields exposed (id, display_name, bio, photo)
- Input validation prevents injection attacks
- Rate limiting should be considered for production deployment

**Data Sanitization:**
- Only SELECT specific fields, never use SELECT *
- No sensitive data (email, timestamps) exposed
- Error messages don't reveal system internals
- Proper logging without exposing user data

### Database Integration
**Dependencies:**
- Requires Story 2.1 completion (photo column and public RLS policy)
- Uses existing Supabase client configuration
- Leverages public read access RLS policy: "Allow public read access to profiles"

**Query Structure:**
```sql
-- This query will be executed by the API
SELECT id, display_name, bio, photo 
FROM public.profiles 
WHERE id = $1;
```

### Error Handling Strategy
**Client-Side Errors (400):**
- Invalid UUID format
- Malformed request parameters

**Not Found Errors (404):**
- User ID doesn't exist in database
- Profile record not found

**Server Errors (500):**
- Database connection issues
- Supabase client errors
- Unexpected runtime exceptions

### Testing Strategy
**Unit Tests:**
- UUID validation function with various input formats
- Response format validation
- Error message consistency

**Integration Tests:**
- End-to-end API request/response cycle
- Database query execution
- Public access verification (no auth headers)

**Test Cases:**
```typescript
// Example test cases
describe('GET /api/profile/[userId]', () => {
  test('returns profile for valid user ID');
  test('returns 400 for invalid UUID format');
  test('returns 404 for non-existent user');
  test('returns 500 for database errors');
  test('works without authentication');
  test('only returns safe profile fields');
});
```

### File Locations
- **API Route**: `/src/app/api/profile/[userId]/route.ts`
- **Validation Utility**: `/src/utils/validation.ts`
- **API Tests**: `/src/app/api/profile/[userId]/__tests__/route.test.ts`
- **Integration Tests**: `/src/tests/api/public-profile-api.test.ts`

### Performance Considerations
**Optimization:**
- Single database query per request
- Minimal data transfer (only required fields)
- Proper indexing on profiles.id (UUID primary key)
- Consider caching for frequently accessed profiles

**Monitoring:**
- Log response times for performance tracking
- Monitor error rates for reliability
- Track usage patterns for scaling decisions

## Testing
- Unit tests for UUID validation utility
- Integration tests for API endpoint functionality
- Test successful profile retrieval with valid user IDs
- Test error handling for invalid UUIDs, missing users, and server errors
- Test public access (no authentication required)
- Test response format consistency across all scenarios
- Performance testing for acceptable response times
- Security testing to ensure no sensitive data exposure

## Dev Agent Record

### Agent Model Used
Cascade

### Debug Log References
1. Created dynamic API route `/src/app/api/profile/[userId]/route.ts` with GET handler
2. Implemented UUID validation utility in `/src/utils/validation.ts` with RFC 4122 compliance
3. Added comprehensive error handling for 400, 404, and 500 status codes
4. Implemented standardized JSON response format with success/error indicators
5. Created unit tests for validation utilities and API endpoint functionality
6. Created integration tests for end-to-end API testing including security and performance

### Completion Notes
1. Successfully created dynamic API route with Next.js file-based routing
2. Implemented robust UUID validation with comprehensive test coverage
3. Added Supabase client integration for public profile data fetching
4. Implemented proper error handling with user-friendly messages and security considerations
5. Created standardized response format consistent across all endpoints
6. Added comprehensive test suite covering unit, integration, and security testing
7. Ensured public access works without authentication using RLS policies from Story 2.1

### File List
- src/app/api/profile/[userId]/route.ts (new)
- src/utils/validation.ts (new)
- src/app/api/profile/[userId]/__tests__/route.test.ts (new)
- src/utils/__tests__/validation.test.ts (new)
- src/tests/api/public-profile-api.test.ts (new)

## Change Log
| Date | Version | Description | Author |
| ---- | ------- | ----------- | ------ |
| 2025-09-29 | 1.0 | Initial story draft | Scrum Master |
| 2025-09-29 | 1.1 | Implementation completed | Dev |
