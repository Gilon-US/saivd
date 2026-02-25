import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VideoPlayer } from '../VideoPlayer';

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  X: () => <div data-testid="x-icon">X</div>,
  Play: () => <div data-testid="play-icon">Play</div>,
  Pause: () => <div data-testid="pause-icon">Pause</div>,
  Volume2: () => <div data-testid="volume-icon">Volume</div>,
  VolumeX: () => <div data-testid="mute-icon">Mute</div>,
  Maximize: () => <div data-testid="maximize-icon">Maximize</div>,
}));

// Mock useFrameAnalysis hook
const mockUseFrameAnalysis = jest.fn(() => ({ qrUrl: null, showOverlay: false }));
jest.mock('@/hooks/useFrameAnalysis', () => ({
  useFrameAnalysis: mockUseFrameAnalysis,
}));

// Mock useWatermarkVerification hook (frontend decode + RSA verify)
jest.mock('@/hooks/useWatermarkVerification', () => ({
  useWatermarkVerification: jest.fn(),
}));

describe('VideoPlayer', () => {
  const mockOnClose = jest.fn();
  const defaultProps = {
    videoUrl: 'https://example.com/test-video.mp4',
    onClose: mockOnClose,
    isOpen: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders when isOpen is true', () => {
    render(<VideoPlayer {...defaultProps} />);
    
    const video = screen.getByRole('application', { hidden: true }) || document.querySelector('video');
    expect(video).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<VideoPlayer {...defaultProps} isOpen={false} />);
    
    const video = document.querySelector('video');
    expect(video).not.toBeInTheDocument();
  });

  it('displays the correct video URL', () => {
    render(<VideoPlayer {...defaultProps} />);
    
    const video = document.querySelector('video');
    expect(video).toHaveAttribute('src', defaultProps.videoUrl);
  });

  it('calls onClose when close button is clicked', () => {
    render(<VideoPlayer {...defaultProps} />);
    
    const closeButton = screen.getByLabelText('Close video player');
    fireEvent.click(closeButton);
    
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('toggles play/pause when play button is clicked', () => {
    render(<VideoPlayer {...defaultProps} />);
    
    const video = document.querySelector('video') as HTMLVideoElement;
    const playButton = screen.getByLabelText('Play');
    
    // Mock video methods
    video.play = jest.fn();
    video.pause = jest.fn();
    
    // Click to play
    fireEvent.click(playButton);
    expect(video.play).toHaveBeenCalled();
    
    // Click to pause
    const pauseButton = screen.getByLabelText('Pause');
    fireEvent.click(pauseButton);
    expect(video.pause).toHaveBeenCalled();
  });

  it('toggles mute when mute button is clicked', () => {
    render(<VideoPlayer {...defaultProps} />);
    
    const video = document.querySelector('video') as HTMLVideoElement;
    const muteButton = screen.getByLabelText('Mute');
    
    // Initially not muted
    expect(video.muted).toBe(false);
    
    // Click to mute
    fireEvent.click(muteButton);
    expect(video.muted).toBe(true);
    
    // Click to unmute
    const unmuteButton = screen.getByLabelText('Unmute');
    fireEvent.click(unmuteButton);
    expect(video.muted).toBe(false);
  });

  it('updates current time when seek bar is changed', () => {
    render(<VideoPlayer {...defaultProps} />);
    
    const video = document.querySelector('video') as HTMLVideoElement;
    const seekBar = screen.getByRole('slider');
    
    // Simulate metadata loaded
    Object.defineProperty(video, 'duration', { value: 100, writable: true });
    fireEvent.loadedMetadata(video);
    
    // Change seek position
    fireEvent.change(seekBar, { target: { value: '50' } });
    
    expect(video.currentTime).toBe(50);
  });

  it('displays formatted time correctly', () => {
    render(<VideoPlayer {...defaultProps} />);
    
    const video = document.querySelector('video') as HTMLVideoElement;
    
    // Set duration and current time
    Object.defineProperty(video, 'duration', { value: 125, writable: true });
    Object.defineProperty(video, 'currentTime', { value: 65, writable: true });
    
    fireEvent.loadedMetadata(video);
    fireEvent.timeUpdate(video);
    
    // Should display "1:05 / 2:05"
    expect(screen.getByText(/1:05/)).toBeInTheDocument();
    expect(screen.getByText(/2:05/)).toBeInTheDocument();
  });

  it('resets video when closed', async () => {
    const { rerender } = render(<VideoPlayer {...defaultProps} />);
    
    const video = document.querySelector('video') as HTMLVideoElement;
    video.pause = jest.fn();
    
    // Set some state
    Object.defineProperty(video, 'currentTime', { value: 50, writable: true });
    
    // Close the player
    rerender(<VideoPlayer {...defaultProps} isOpen={false} />);
    
    await waitFor(() => {
      expect(video.pause).toHaveBeenCalled();
    });
  });

  it('shows overlay when frame analysis returns true', () => {
    mockUseFrameAnalysis.mockReturnValue({ showOverlay: true });
    
    render(<VideoPlayer {...defaultProps} />);
    
    expect(screen.getByText('Analysis Alert')).toBeInTheDocument();
  });

  it('hides overlay when frame analysis returns false', () => {
    mockUseFrameAnalysis.mockReturnValue({ showOverlay: false });
    
    render(<VideoPlayer {...defaultProps} />);
    
    expect(screen.queryByText('Analysis Alert')).not.toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    render(<VideoPlayer {...defaultProps} />);
    
    expect(screen.getByLabelText('Close video player')).toBeInTheDocument();
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
    expect(screen.getByLabelText('Mute')).toBeInTheDocument();
    expect(screen.getByLabelText('Fullscreen')).toBeInTheDocument();
  });

  it('handles fullscreen toggle', () => {
    render(<VideoPlayer {...defaultProps} />);
    
    const video = document.querySelector('video') as HTMLVideoElement;
    const fullscreenButton = screen.getByLabelText('Fullscreen');
    
    // Mock fullscreen API
    video.requestFullscreen = jest.fn();
    document.exitFullscreen = jest.fn();
    
    // Enter fullscreen
    fireEvent.click(fullscreenButton);
    expect(video.requestFullscreen).toHaveBeenCalled();
    
    // Exit fullscreen
    Object.defineProperty(document, 'fullscreenElement', { value: video, writable: true });
    fireEvent.click(fullscreenButton);
    expect(document.exitFullscreen).toHaveBeenCalled();
  });

  it('stops playing when video ends', () => {
    render(<VideoPlayer {...defaultProps} />);
    
    const video = document.querySelector('video') as HTMLVideoElement;
    const playButton = screen.getByLabelText('Play');
    
    video.play = jest.fn();
    
    // Start playing
    fireEvent.click(playButton);
    expect(video.play).toHaveBeenCalled();
    
    // Video ends
    fireEvent.ended(video);
    
    // Should show play button again
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
  });
});
