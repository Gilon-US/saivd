/**
 * Integration tests for Public Profile Page
 * Story 2.3: Public Profile Page Component
 */

import { render, screen, waitFor } from '@testing-library/react';
import { useParams } from 'next/navigation';
import PublicProfilePage from '../page';

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useParams: jest.fn(),
}));

// Mock fetch
global.fetch = jest.fn();

// Mock components
jest.mock('@/components/ui/loading-spinner', () => ({
  LoadingSpinner: ({ size }: { size?: string }) => (
    <div data-testid="loading-spinner" data-size={size}>Loading...</div>
  ),
}));

jest.mock('@/components/profile/PublicProfileCard', () => ({
  PublicProfileCard: ({ profile }: { profile: any }) => (
    <div data-testid="profile-card">
      <h1>{profile.display_name || 'Anonymous User'}</h1>
      <p>{profile.bio || 'No bio'}</p>
    </div>
  ),
}));

const mockUseParams = useParams as jest.MockedFunction<typeof useParams>;
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('PublicProfilePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseParams.mockReturnValue({ userId: '550e8400-e29b-41d4-a716-446655440000' });
  });

  it('shows loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
    
    render(<PublicProfilePage />);
    
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.getByText('Loading profile...')).toBeInTheDocument();
  });

  it('displays profile data when API call succeeds', async () => {
    const mockProfile = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      display_name: 'John Doe',
      bio: 'Software developer',
      photo: 'https://example.com/photo.jpg'
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockProfile }),
    } as Response);

    render(<PublicProfilePage />);

    await waitFor(() => {
      expect(screen.getByTestId('profile-card')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Software developer')).toBeInTheDocument();
    });
  });

  it('displays error state when profile not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, error: 'User not found' }),
    } as Response);

    render(<PublicProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Profile Not Found')).toBeInTheDocument();
      expect(screen.getByText('User not found')).toBeInTheDocument();
      expect(screen.getByText('Go Back')).toBeInTheDocument();
    });
  });

  it('displays error state when API call fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(<PublicProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Profile Not Found')).toBeInTheDocument();
      expect(screen.getByText('Failed to load profile')).toBeInTheDocument();
    });
  });

  it('displays error when userId is missing', async () => {
    mockUseParams.mockReturnValue({ userId: undefined });

    render(<PublicProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Profile Not Found')).toBeInTheDocument();
      expect(screen.getByText('Invalid profile URL')).toBeInTheDocument();
    });
  });

  it('makes API call with correct userId', async () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';
    mockUseParams.mockReturnValue({ userId });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { id: userId, display_name: 'Test', bio: null, photo: null } }),
    } as Response);

    render(<PublicProfilePage />);

    expect(mockFetch).toHaveBeenCalledWith(`/api/profile/${userId}`);
  });

  it('handles empty profile data gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: null }),
    } as Response);

    render(<PublicProfilePage />);

    await waitFor(() => {
      // Should not render anything when profile is null
      expect(screen.queryByTestId('profile-card')).not.toBeInTheDocument();
      expect(screen.queryByText('Profile Not Found')).not.toBeInTheDocument();
    });
  });

  it('has proper accessibility attributes', async () => {
    const mockProfile = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      display_name: 'John Doe',
      bio: 'Software developer',
      photo: null
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockProfile }),
    } as Response);

    render(<PublicProfilePage />);

    await waitFor(() => {
      const main = screen.getByRole('main');
      expect(main).toBeInTheDocument();
    });
  });

  it('shows loading announcement for screen readers', () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
    
    render(<PublicProfilePage />);
    
    const loadingText = screen.getByText('Loading profile...');
    expect(loadingText).toHaveAttribute('aria-live', 'polite');
  });

  it('refetches profile when userId changes', async () => {
    const userId1 = '550e8400-e29b-41d4-a716-446655440000';
    const userId2 = '550e8400-e29b-41d4-a716-446655440001';

    mockUseParams.mockReturnValue({ userId: userId1 });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: userId1, display_name: 'User 1', bio: null, photo: null } }),
    } as Response);

    const { rerender } = render(<PublicProfilePage />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(`/api/profile/${userId1}`);
    });

    // Change userId
    mockUseParams.mockReturnValue({ userId: userId2 });
    mockFetch.mockClear();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: userId2, display_name: 'User 2', bio: null, photo: null } }),
    } as Response);

    rerender(<PublicProfilePage />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(`/api/profile/${userId2}`);
    });
  });
});
