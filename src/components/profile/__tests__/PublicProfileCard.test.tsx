/**
 * Tests for PublicProfileCard Component
 * Story 2.3: Public Profile Page Component
 */

import { render, screen, waitFor } from '@testing-library/react';
import { PublicProfileCard } from '../PublicProfileCard';

// Mock Next.js Image component
jest.mock('next/image', () => ({
  __esModule: true,
  default: function MockImage({ src, alt, onLoad, onError, ...props }: any) {
    return (
      <img
        src={src}
        alt={alt}
        onLoad={onLoad}
        onError={onError}
        {...props}
      />
    );
  },
}));

// Mock LoadingSpinner component
jest.mock('@/components/ui/loading-spinner', () => ({
  LoadingSpinner: ({ size }: { size?: string }) => (
    <div data-testid="loading-spinner" data-size={size}>Loading...</div>
  ),
}));

describe('PublicProfileCard', () => {
  const mockProfile = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    display_name: 'John Doe',
    bio: 'Software developer and video creator',
    photo: 'https://example.com/photo.jpg'
  };

  it('renders profile with all information', () => {
    render(<PublicProfileCard profile={mockProfile} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Software developer and video creator')).toBeInTheDocument();
    expect(screen.getByAltText('Profile photo of John Doe')).toBeInTheDocument();
  });

  it('renders profile with missing display name', () => {
    const profileWithoutName = { ...mockProfile, display_name: null };
    render(<PublicProfileCard profile={profileWithoutName} />);

    expect(screen.getByText('Anonymous User')).toBeInTheDocument();
    expect(screen.getByText('Software developer and video creator')).toBeInTheDocument();
  });

  it('renders profile with missing bio', () => {
    const profileWithoutBio = { ...mockProfile, bio: null };
    render(<PublicProfileCard profile={profileWithoutBio} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('No bio available')).toBeInTheDocument();
  });

  it('renders profile with missing photo', () => {
    const profileWithoutPhoto = { ...mockProfile, photo: null };
    render(<PublicProfileCard profile={profileWithoutPhoto} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('JD')).toBeInTheDocument(); // Initials
    expect(screen.getByLabelText('Profile photo placeholder for John Doe')).toBeInTheDocument();
  });

  it('renders initials correctly for single name', () => {
    const profileSingleName = { ...mockProfile, display_name: 'John', photo: null };
    render(<PublicProfileCard profile={profileSingleName} />);

    expect(screen.getByText('J')).toBeInTheDocument();
  });

  it('renders initials correctly for multiple names', () => {
    const profileMultipleNames = { 
      ...mockProfile, 
      display_name: 'John Michael Doe Smith', 
      photo: null 
    };
    render(<PublicProfileCard profile={profileMultipleNames} />);

    expect(screen.getByText('JM')).toBeInTheDocument(); // Only first two initials
  });

  it('handles image loading error gracefully', async () => {
    render(<PublicProfileCard profile={mockProfile} />);

    const image = screen.getByAltText('Profile photo of John Doe');
    
    // Simulate image error
    image.dispatchEvent(new Event('error'));

    await waitFor(() => {
      expect(screen.getByText('JD')).toBeInTheDocument(); // Should show initials
    });
  });

  it('shows loading spinner while image loads', () => {
    render(<PublicProfileCard profile={mockProfile} />);

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('handles empty profile gracefully', () => {
    const emptyProfile = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      display_name: null,
      bio: null,
      photo: null
    };
    render(<PublicProfileCard profile={emptyProfile} />);

    expect(screen.getByText('Anonymous User')).toBeInTheDocument();
    expect(screen.getByText('No bio available')).toBeInTheDocument();
    expect(screen.getByText('?')).toBeInTheDocument(); // Default initials
  });

  it('preserves bio formatting with whitespace', () => {
    const profileWithFormattedBio = {
      ...mockProfile,
      bio: 'Line 1\nLine 2\n\nLine 4'
    };
    render(<PublicProfileCard profile={profileWithFormattedBio} />);

    const bioElement = screen.getByText('Line 1\nLine 2\n\nLine 4');
    expect(bioElement).toHaveClass('whitespace-pre-wrap');
  });

  it('has proper accessibility attributes', () => {
    render(<PublicProfileCard profile={mockProfile} />);

    // Check heading hierarchy
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('John Doe');

    // Check image alt text
    const image = screen.getByAltText('Profile photo of John Doe');
    expect(image).toBeInTheDocument();
  });

  it('applies responsive classes correctly', () => {
    render(<PublicProfileCard profile={mockProfile} />);

    const heading = screen.getByText('John Doe');
    expect(heading).toHaveClass('text-2xl', 'sm:text-3xl');

    const bio = screen.getByText('Software developer and video creator');
    expect(bio).toHaveClass('text-base', 'sm:text-lg');
  });
});
