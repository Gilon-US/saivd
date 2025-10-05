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
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
    });

    it('validates password matching', async () => {
      render(
        <AuthProvider>
          <RegisterForm />
        </AuthProvider>
      );
      
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
      fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'different' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      
      await waitFor(() => {
        expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
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
