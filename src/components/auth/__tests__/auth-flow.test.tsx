/**
 * Auth Flow Tests
 * 
 * This file contains tests for the authentication flow.
 * Run these tests with: npm test auth-flow
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RegisterForm } from '../RegisterForm';
import { LoginForm } from '../LoginForm';
import { LogoutButton } from '../LogoutButton';
import { AuthProvider } from '@/contexts/AuthContext';

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
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      getSession: jest.fn().mockReturnValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({ 
        data: { subscription: { unsubscribe: jest.fn() } } 
      }),
    },
  },
  getUserFromSession: jest.fn(),
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/components/auth/SignupCaptcha', () => ({
  SignupCaptcha: () => null,
}));

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      signInWithPassword: jest.fn().mockResolvedValue({ error: null }),
    },
  })),
}));

describe('Authentication Flow', () => {
  // Login Form Tests
  describe('LoginForm', () => {
    it('renders login form correctly', () => {
      render(
        <AuthProvider>
          <LoginForm />
        </AuthProvider>
      );
      
      expect(screen.getByText('Login')).toBeInTheDocument();
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /terms and conditions/i })).toHaveAttribute('href', '/terms');
    });

    it('validates required fields', async () => {
      render(
        <AuthProvider>
          <LoginForm />
        </AuthProvider>
      );
      
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
      
      await waitFor(() => {
        expect(screen.getByText('Email is required')).toBeInTheDocument();
        expect(screen.getByText('Password is required')).toBeInTheDocument();
      });
    });

    it('validates email format', async () => {
      render(
        <AuthProvider>
          <LoginForm />
        </AuthProvider>
      );
      
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'invalid-email' } });
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
      
      await waitFor(() => {
        expect(screen.getByText('Email is invalid')).toBeInTheDocument();
      });
    });
  });

  // Registration Form Tests
  describe('RegisterForm', () => {
    it('renders registration form correctly', () => {
      render(
        <AuthProvider>
          <RegisterForm />
        </AuthProvider>
      );
      
      expect(screen.getByText('Create an account')).toBeInTheDocument();
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
      expect(screen.getByLabelText('Phone number')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /terms and conditions/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /terms and conditions/i })).toHaveAttribute('href', '/terms');
      expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
    });

    it('requires accepting terms before submit', async () => {
      render(
        <AuthProvider>
          <RegisterForm />
        </AuthProvider>
      );

      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } });
      fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '4155552671' } });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Secure1!pass' } });
      fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'Secure1!pass' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

      await waitFor(() => {
        expect(screen.getByText(/must read and accept the Terms/i)).toBeInTheDocument();
      });
    });

    it('shows password mismatch while typing confirm password', async () => {
      render(
        <AuthProvider>
          <RegisterForm />
        </AuthProvider>
      );

      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Secure1!pass' } });
      fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'different' } });

      await waitFor(() => {
        expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
      });
    });

    it('shows phone validation on blur', async () => {
      render(
        <AuthProvider>
          <RegisterForm />
        </AuthProvider>
      );

      const phoneInput = screen.getByLabelText('Phone number');
      fireEvent.change(phoneInput, { target: { value: '123' } });
      fireEvent.blur(phoneInput);

      await waitFor(() => {
        expect(
          screen.getByText('Enter a valid US number (10 digits) or international +country code'),
        ).toBeInTheDocument();
      });
    });
  });

  // Logout Button Tests
  describe('LogoutButton', () => {
    it('renders logout button correctly', () => {
      render(
        <AuthProvider>
          <LogoutButton />
        </AuthProvider>
      );
      
      expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    });
  });
});
