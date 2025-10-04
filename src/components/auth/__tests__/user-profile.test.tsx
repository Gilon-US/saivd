/**
 * UserProfile Component Tests
 * 
 * This file contains tests for the UserProfile component.
 * Run these tests with: npm test user-profile
 * 
 * Note: These tests require Jest and React Testing Library to be installed:
 * npm install --save-dev jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserProfile } from '../UserProfile';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';

// Mock the hooks
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/contexts/ProfileContext', () => ({
  useProfile: jest.fn(),
}));

describe('UserProfile Component', () => {
  // Setup default mock values
  const mockUser = {
    id: 'user-123',
    email: 'user@example.com',
  };
  
  const mockProfile = {
    id: 'user-123',
    email: 'user@example.com',
    display_name: 'Test User',
    avatar_url: null,
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  };
  
  const mockUpdateProfile = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
    });
    
    (useProfile as jest.Mock).mockReturnValue({
      profile: mockProfile,
      loading: false,
      error: null,
      updateProfile: mockUpdateProfile,
    });
  });
  
  it('renders the profile form with user data', () => {
    render(<UserProfile />);
    
    // Check that the form elements are rendered with the correct values
    expect(screen.getByLabelText(/email/i)).toHaveValue('user@example.com');
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Test User');
  });
  
  it('shows loading state when profile is loading', () => {
    (useProfile as jest.Mock).mockReturnValue({
      profile: null,
      loading: true,
      error: null,
      updateProfile: mockUpdateProfile,
    });
    
    render(<UserProfile />);
    
    // Check for loading indicator
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
  
  it('shows error message when there is an error', () => {
    (useProfile as jest.Mock).mockReturnValue({
      profile: mockProfile,
      loading: false,
      error: 'Failed to load profile',
      updateProfile: mockUpdateProfile,
    });
    
    render(<UserProfile />);
    
    // Check for error message
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load profile');
  });
  
  it('validates display name on submit', async () => {
    render(<UserProfile />);
    
    // Clear the display name field
    const displayNameInput = screen.getByLabelText(/display name/i);
    fireEvent.change(displayNameInput, { target: { value: '' } });
    
    // Submit the form
    const submitButton = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(submitButton);
    
    // Check for validation error
    await waitFor(() => {
      expect(screen.getByText(/display name must be at least 2 characters/i)).toBeInTheDocument();
    });
    
    // Verify updateProfile was not called
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });
  
  it('submits the form with valid data', async () => {
    render(<UserProfile />);
    
    // Change the display name
    const displayNameInput = screen.getByLabelText(/display name/i);
    fireEvent.change(displayNameInput, { target: { value: 'New Name' } });
    
    // Submit the form
    const submitButton = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(submitButton);
    
    // Verify updateProfile was called with the correct data
    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({ display_name: 'New Name' });
    });
  });
});
