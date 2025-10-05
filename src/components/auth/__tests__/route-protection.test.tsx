/**
 * Route Protection Tests
 * 
 * This file contains tests for route protection functionality.
 * Run these tests with: npm test route-protection
 * 
 * Note: These tests require Jest and React Testing Library to be installed:
 * npm install --save-dev jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom
 */

import { render, screen } from '@testing-library/react';
import { NextRequest } from 'next/server';
import { AuthGuard } from '../AuthGuard';
import { middleware } from '@/middleware';

// Mock the next/navigation module
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

// Mock the supabase client
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn().mockReturnValue({ 
        data: { subscription: { unsubscribe: jest.fn() } } 
      }),
    },
  },
}));

// Mock the contexts/AuthContext
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock Next.js middleware components
jest.mock('next/server', () => ({
  NextResponse: {
    next: jest.fn().mockReturnValue({ headers: new Map() }),
    redirect: jest.fn().mockImplementation((url) => ({ url })),
    json: jest.fn().mockImplementation((body, init) => ({ body, init })),
  },
}));

// Mock createMiddlewareClient
jest.mock('@supabase/auth-helpers-nextjs', () => ({
  createMiddlewareClient: jest.fn().mockReturnValue({
    auth: {
      getSession: jest.fn(),
    },
  }),
}));

// Import the mocks for direct access in tests
import { useAuth } from '@/contexts/AuthContext';
import { NextResponse } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

describe('Route Protection', () => {
  // Reset all mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AuthGuard Component', () => {
    it('shows loading state when authentication is in progress', () => {
      // Mock the useAuth hook to return loading state
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        loading: true,
      });

      render(
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      );

      // Should show loading state
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('redirects unauthenticated users', async () => {
      // Mock the useAuth hook to return unauthenticated state
      const mockPush = jest.fn();
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        loading: false,
      });

      // Mock router
      const { useRouter } = await import('next/navigation');
      (useRouter as jest.Mock).mockReturnValue({
        push: mockPush,
      });

      render(
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      );

      // Should not render children
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
      
      // Should redirect to login
      expect(mockPush).toHaveBeenCalled();
    });

    it('renders children for authenticated users', () => {
      // Mock the useAuth hook to return authenticated state
      (useAuth as jest.Mock).mockReturnValue({
        user: { id: '123', email: 'user@example.com' },
        loading: false,
      });

      render(
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      );

      // Should render children
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });

  describe('Next.js Middleware', () => {
    it('allows authenticated users to access protected routes', async () => {
      // Mock authenticated session
      const mockGetSession = jest.fn().mockResolvedValue({
        data: { session: { user: { id: '123' } } },
      });
      
      (createMiddlewareClient as jest.Mock).mockReturnValue({
        auth: {
          getSession: mockGetSession,
        },
      });

      // Create mock request to a protected route
      const req = {
        nextUrl: {
          pathname: '/dashboard',
        },
        url: 'http://localhost:3000/dashboard',
      };

      await middleware(req as NextRequest);

      // Should call getSession
      expect(mockGetSession).toHaveBeenCalled();
      
      // Should not redirect (NextResponse.next should be called)
      expect(NextResponse.next).toHaveBeenCalled();
      expect(NextResponse.redirect).not.toHaveBeenCalled();
    });

    it('redirects unauthenticated users from protected routes', async () => {
      // Mock unauthenticated session
      const mockGetSession = jest.fn().mockResolvedValue({
        data: { session: null },
      });
      
      (createMiddlewareClient as jest.Mock).mockReturnValue({
        auth: {
          getSession: mockGetSession,
        },
      });

      // Create mock request to a protected route
      const req = {
        nextUrl: {
          pathname: '/dashboard',
        },
        url: 'http://localhost:3000/dashboard',
      };

      await middleware(req as NextRequest);

      // Should call getSession
      expect(mockGetSession).toHaveBeenCalled();
      
      // Should redirect to login
      expect(NextResponse.redirect).toHaveBeenCalled();
    });

    it('returns 401 for unauthenticated API requests', async () => {
      // Mock unauthenticated session
      const mockGetSession = jest.fn().mockResolvedValue({
        data: { session: null },
      });
      
      (createMiddlewareClient as jest.Mock).mockReturnValue({
        auth: {
          getSession: mockGetSession,
        },
      });

      // Create mock request to a protected API route
      const req = {
        nextUrl: {
          pathname: '/api/user',
        },
        url: 'http://localhost:3000/api/user',
      };

      await middleware(req as NextRequest);

      // Should call getSession
      expect(mockGetSession).toHaveBeenCalled();
      
      // Should return JSON with 401 status
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'unauthorized',
          }),
        }),
        expect.objectContaining({
          status: 401,
        })
      );
    });
  });
});
