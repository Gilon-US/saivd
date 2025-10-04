/**
 * Tests for ProfilePhoto Component
 * Story 2.3: Public Profile Page Component
 */

import { render, screen, waitFor } from '@testing-library/react';
import { ProfilePhoto } from '../ProfilePhoto';

// Mock Next.js Image component
jest.mock('next/image', () => ({
  __esModule: true,
  default: function MockImage({ src, alt, onLoad, onError, fill, ...props }: any) {
    return (
      <img
        src={src}
        alt={alt}
        onLoad={onLoad}
        onError={onError}
        data-fill={fill}
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

describe('ProfilePhoto', () => {
  it('renders image when photo URL is provided', () => {
    render(
      <ProfilePhoto 
        photo="https://example.com/photo.jpg" 
        displayName="John Doe" 
      />
    );

    const image = screen.getByAltText('Profile photo of John Doe');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', 'https://example.com/photo.jpg');
  });

  it('renders initials when no photo is provided', () => {
    render(
      <ProfilePhoto 
        photo={null} 
        displayName="John Doe" 
      />
    );

    expect(screen.getByText('JD')).toBeInTheDocument();
    expect(screen.getByLabelText('Profile photo placeholder for John Doe')).toBeInTheDocument();
  });

  it('renders single initial for single name', () => {
    render(
      <ProfilePhoto 
        photo={null} 
        displayName="John" 
      />
    );

    expect(screen.getByText('J')).toBeInTheDocument();
  });

  it('renders two initials for multiple names', () => {
    render(
      <ProfilePhoto 
        photo={null} 
        displayName="John Michael Doe Smith" 
      />
    );

    expect(screen.getByText('JM')).toBeInTheDocument();
  });

  it('renders question mark for anonymous user', () => {
    render(
      <ProfilePhoto 
        photo={null} 
        displayName={null} 
      />
    );

    expect(screen.getByText('?')).toBeInTheDocument();
    expect(screen.getByLabelText('Profile photo placeholder for user')).toBeInTheDocument();
  });

  it('falls back to initials when image fails to load', async () => {
    render(
      <ProfilePhoto 
        photo="https://example.com/broken-image.jpg" 
        displayName="John Doe" 
      />
    );

    const image = screen.getByAltText('Profile photo of John Doe');
    
    // Simulate image error
    image.dispatchEvent(new Event('error'));

    await waitFor(() => {
      expect(screen.getByText('JD')).toBeInTheDocument();
    });
  });

  it('shows loading spinner while image loads', () => {
    render(
      <ProfilePhoto 
        photo="https://example.com/photo.jpg" 
        displayName="John Doe" 
      />
    );

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('hides loading spinner when image loads', async () => {
    render(
      <ProfilePhoto 
        photo="https://example.com/photo.jpg" 
        displayName="John Doe" 
      />
    );

    const image = screen.getByAltText('Profile photo of John Doe');
    
    // Simulate image load
    image.dispatchEvent(new Event('load'));

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });
  });

  it('applies correct size classes', () => {
    const { rerender } = render(
      <ProfilePhoto 
        photo={null} 
        displayName="John Doe" 
        size="sm"
      />
    );

    let container = screen.getByLabelText('Profile photo placeholder for John Doe');
    expect(container).toHaveClass('w-12', 'h-12');

    rerender(
      <ProfilePhoto 
        photo={null} 
        displayName="John Doe" 
        size="lg"
      />
    );

    container = screen.getByLabelText('Profile photo placeholder for John Doe');
    expect(container).toHaveClass('w-24', 'h-24', 'sm:w-32', 'sm:h-32');
  });

  it('applies correct text size classes', () => {
    const { rerender } = render(
      <ProfilePhoto 
        photo={null} 
        displayName="John Doe" 
        size="sm"
      />
    );

    let initials = screen.getByText('JD');
    expect(initials).toHaveClass('text-sm');

    rerender(
      <ProfilePhoto 
        photo={null} 
        displayName="John Doe" 
        size="xl"
      />
    );

    initials = screen.getByText('JD');
    expect(initials).toHaveClass('text-3xl', 'sm:text-4xl');
  });

  it('applies custom className', () => {
    render(
      <ProfilePhoto 
        photo={null} 
        displayName="John Doe" 
        className="custom-class"
      />
    );

    const container = screen.getByLabelText('Profile photo placeholder for John Doe');
    expect(container).toHaveClass('custom-class');
  });

  it('uses correct loading spinner size based on photo size', () => {
    const { rerender } = render(
      <ProfilePhoto 
        photo="https://example.com/photo.jpg" 
        displayName="John Doe" 
        size="sm"
      />
    );

    let spinner = screen.getByTestId('loading-spinner');
    expect(spinner).toHaveAttribute('data-size', 'sm');

    rerender(
      <ProfilePhoto 
        photo="https://example.com/photo.jpg" 
        displayName="John Doe" 
        size="xl"
      />
    );

    spinner = screen.getByTestId('loading-spinner');
    expect(spinner).toHaveAttribute('data-size', 'lg');
  });

  it('handles empty display name gracefully', () => {
    render(
      <ProfilePhoto 
        photo={null} 
        displayName="" 
      />
    );

    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('handles whitespace-only display name', () => {
    render(
      <ProfilePhoto 
        photo={null} 
        displayName="   " 
      />
    );

    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('converts initials to uppercase', () => {
    render(
      <ProfilePhoto 
        photo={null} 
        displayName="john doe" 
      />
    );

    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    render(
      <ProfilePhoto 
        photo="https://example.com/photo.jpg" 
        displayName="John Doe" 
      />
    );

    const image = screen.getByAltText('Profile photo of John Doe');
    expect(image).toBeInTheDocument();
  });

  it('sets priority for large images', () => {
    render(
      <ProfilePhoto 
        photo="https://example.com/photo.jpg" 
        displayName="John Doe" 
        size="lg"
      />
    );

    const image = screen.getByAltText('Profile photo of John Doe');
    expect(image).toHaveAttribute('priority');
  });

  it('does not set priority for small images', () => {
    render(
      <ProfilePhoto 
        photo="https://example.com/photo.jpg" 
        displayName="John Doe" 
        size="sm"
      />
    );

    const image = screen.getByAltText('Profile photo of John Doe');
    expect(image).not.toHaveAttribute('priority');
  });
});
