/**
 * LogoutButton Component Tests
 * 
 * This file contains tests for the LogoutButton component.
 * Run these tests with: npm test logout-button
 * 
 * Note: These tests require Jest and React Testing Library to be installed:
 * npm install --save-dev jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LogoutButton } from '../LogoutButton';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

// Mock the hooks
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('LogoutButton Component', () => {
  // Setup default mock values
  const mockSignOut = jest.fn();
  const mockPush = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    (useAuth as jest.Mock).mockReturnValue({
      signOut: mockSignOut,
    });
    
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });
  });
  
  it('renders logout button correctly', () => {
    render(<LogoutButton />);
    
    // Check that the button is rendered with the correct text
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });
  
  it('renders logout button with icon when showIcon is true', () => {
    render(<LogoutButton showIcon={true} />);
    
    // Check that the SVG icon is rendered
    const button = screen.getByRole('button', { name: /log out/i });
    expect(button.querySelector('svg')).toBeInTheDocument();
  });
  
  it('calls signOut and redirects on click', async () => {
    // Mock successful signOut
    mockSignOut.mockResolvedValueOnce(undefined);
    
    render(<LogoutButton />);
    
    // Click the logout button
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));
    
    // Verify signOut was called
    expect(mockSignOut).toHaveBeenCalled();
    
    // Wait for the async operations to complete
    await waitFor(() => {
      // Verify toast success was called
      expect(toast.success).toHaveBeenCalledWith('Logged out successfully');
      // Verify redirection
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });
  
  it('redirects to custom path when redirectTo is provided', async () => {
    // Mock successful signOut
    mockSignOut.mockResolvedValueOnce(undefined);
    
    render(<LogoutButton redirectTo="/custom-path" />);
    
    // Click the logout button
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));
    
    // Wait for the async operations to complete
    await waitFor(() => {
      // Verify redirection to custom path
      expect(mockPush).toHaveBeenCalledWith('/custom-path');
    });
  });
  
  it('shows error toast when logout fails', async () => {
    // Mock failed signOut
    mockSignOut.mockRejectedValueOnce(new Error('Logout failed'));
    
    render(<LogoutButton />);
    
    // Click the logout button
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));
    
    // Wait for the async operations to complete
    await waitFor(() => {
      // Verify toast error was called
      expect(toast.error).toHaveBeenCalledWith('Failed to log out');
      // Verify no redirection
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
  
  it('disables button during logout process', async () => {
    // Mock signOut with a delay to test loading state
    mockSignOut.mockImplementationOnce(() => new Promise(resolve => setTimeout(resolve, 100)));
    
    render(<LogoutButton />);
    
    const button = screen.getByRole('button', { name: /log out/i });
    
    // Click the logout button
    fireEvent.click(button);
    
    // Verify button is disabled and shows loading text
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Logging out...');
    
    // Wait for the async operations to complete
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });
  });
});
