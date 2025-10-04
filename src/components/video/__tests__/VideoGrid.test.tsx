import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VideoGrid, Video } from '../VideoGrid';

// Mock the useToast hook
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}));

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    return <img {...props} />;
  },
}));

describe('VideoGrid', () => {
  const mockVideos: Video[] = [
    {
      id: '1',
      filename: 'test-video.mp4',
      original_url: 'https://example.com/test-video.mp4',
      original_thumbnail_url: 'https://example.com/test-thumbnail.jpg',
      preview_thumbnail_data: null,
      processed_url: null,
      processed_thumbnail_url: null,
      status: 'uploaded',
      upload_date: '2025-09-20T12:00:00Z',
    },
    {
      id: '2',
      filename: 'another-video.mp4',
      original_url: 'https://example.com/another-video.mp4',
      original_thumbnail_url: 'https://example.com/another-thumbnail.jpg',
      preview_thumbnail_data: null,
      processed_url: null,
      processed_thumbnail_url: null,
      status: 'processed',
      upload_date: '2025-09-21T12:00:00Z',
    },
  ];

  const mockProps = {
    videos: mockVideos,
    isLoading: false,
    error: null,
    onRefresh: jest.fn(),
    onOpenUploadModal: jest.fn(),
  };

  it('renders videos in a grid', () => {
    render(<VideoGrid {...mockProps} />);
    
    expect(screen.getByText('test-video.mp4')).toBeInTheDocument();
    expect(screen.getByText('another-video.mp4')).toBeInTheDocument();
  });

  it('shows empty state when no videos are available', () => {
    render(
      <VideoGrid
        {...mockProps}
        videos={[]}
      />
    );
    
    expect(screen.getByText('No videos yet')).toBeInTheDocument();
    expect(screen.getByText('Upload your first video')).toBeInTheDocument();
  });

  it('shows loading state when isLoading is true', () => {
    render(
      <VideoGrid
        {...mockProps}
        isLoading={true}
      />
    );
    
    expect(screen.getByText('Loading videos...')).toBeInTheDocument();
  });

  it('shows error state when there is an error', () => {
    render(
      <VideoGrid
        {...mockProps}
        error="Failed to load videos"
      />
    );
    
    expect(screen.getByText('Error loading videos')).toBeInTheDocument();
    expect(screen.getByText('Failed to load videos')).toBeInTheDocument();
  });

  it('calls onOpenUploadModal when upload button is clicked in empty state', () => {
    render(
      <VideoGrid
        {...mockProps}
        videos={[]}
      />
    );
    
    fireEvent.click(screen.getByText('Upload your first video'));
    expect(mockProps.onOpenUploadModal).toHaveBeenCalled();
  });

  it('calls onRefresh when refresh button is clicked in error state', () => {
    render(
      <VideoGrid
        {...mockProps}
        error="Failed to load videos"
      />
    );
    
    fireEvent.click(screen.getByText('Try again'));
    expect(mockProps.onRefresh).toHaveBeenCalled();
  });

  describe('Delete functionality', () => {
    beforeEach(() => {
      // Reset all mocks before each test
      jest.clearAllMocks();
      // Mock fetch globally
      global.fetch = jest.fn();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('renders delete button for each video', () => {
      render(<VideoGrid {...mockProps} />);
      
      const deleteButtons = screen.getAllByTitle(/Delete "/);
      expect(deleteButtons).toHaveLength(2);
      expect(screen.getByTitle('Delete "test-video.mp4"')).toBeInTheDocument();
      expect(screen.getByTitle('Delete "another-video.mp4"')).toBeInTheDocument();
    });

    it('opens confirmation dialog when delete button is clicked', () => {
      render(<VideoGrid {...mockProps} />);
      
      const deleteButton = screen.getByTitle('Delete "test-video.mp4"');
      fireEvent.click(deleteButton);
      
      expect(screen.getByText('Delete Video')).toBeInTheDocument();
      expect(screen.getByText('Are you sure you want to delete this video?')).toBeInTheDocument();
      expect(screen.getByText('"test-video.mp4"')).toBeInTheDocument();
    });

    it('closes confirmation dialog when cancel is clicked', () => {
      render(<VideoGrid {...mockProps} />);
      
      // Open dialog
      const deleteButton = screen.getByTitle('Delete "test-video.mp4"');
      fireEvent.click(deleteButton);
      
      // Close dialog
      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);
      
      expect(screen.queryByText('Delete Video')).not.toBeInTheDocument();
    });

    it('calls delete API and refreshes grid on successful deletion', async () => {
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { message: 'Video deleted successfully', id: '1' }
        }),
      } as Response);

      render(<VideoGrid {...mockProps} />);
      
      // Open dialog
      const deleteButton = screen.getByTitle('Delete "test-video.mp4"');
      fireEvent.click(deleteButton);
      
      // Confirm deletion
      const confirmButton = screen.getByText('Delete Video');
      fireEvent.click(confirmButton);
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/videos/1', {
          method: 'DELETE',
        });
        expect(mockProps.onRefresh).toHaveBeenCalled();
      });
    });

    it('shows error message on failed deletion', async () => {
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          error: { message: 'Failed to delete video' }
        }),
      } as Response);

      const mockToast = jest.fn();
      require('@/hooks/useToast').useToast.mockReturnValue({ toast: mockToast });

      render(<VideoGrid {...mockProps} />);
      
      // Open dialog
      const deleteButton = screen.getByTitle('Delete "test-video.mp4"');
      fireEvent.click(deleteButton);
      
      // Confirm deletion
      const confirmButton = screen.getByText('Delete Video');
      fireEvent.click(confirmButton);
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Delete failed',
          description: 'Failed to delete video',
          variant: 'error',
        });
      });
    });

    it('disables buttons during deletion process', async () => {
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      // Mock a slow response to test loading state
      mockFetch.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: async () => ({ success: true, data: { message: 'Video deleted successfully', id: '1' } })
        } as Response), 100))
      );

      render(<VideoGrid {...mockProps} />);
      
      // Open dialog
      const deleteButton = screen.getByTitle('Delete "test-video.mp4"');
      fireEvent.click(deleteButton);
      
      // Confirm deletion
      const confirmButton = screen.getByText('Delete Video');
      fireEvent.click(confirmButton);
      
      // Check that buttons are disabled during deletion
      expect(screen.getByText('Deleting...')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeDisabled();
    });
  });
});
