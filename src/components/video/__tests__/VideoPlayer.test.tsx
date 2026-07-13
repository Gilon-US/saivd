import { render, screen, fireEvent } from '@testing-library/react';
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
  ExternalLink: () => <div data-testid="external-link-icon">Link</div>,
}));

// Mock useFrameAnalysis hook
jest.mock('@/hooks/useFrameAnalysis', () => ({
  useFrameAnalysis: jest.fn(() => ({ qrUrl: null })),
}));

// Mock useWatermarkVerification hook (frontend decode + RSA verify)
jest.mock('@/hooks/useWatermarkVerification', () => ({
  useWatermarkVerification: jest.fn(),
}));

jest.mock('@/contexts/ProfileContext', () => ({
  useProfile: () => ({
    profile: {qr_overlay_position: 'top-right'},
  }),
}));

jest.mock('@/components/presentation/PresentationQrFlipButton', () => ({
  PresentationQrFlipButton: () => <div data-testid="presentation-qr">QR</div>,
}));

describe('VideoPlayer', () => {
  const mockOnClose = jest.fn();
  const defaultProps = {
    videoUrl: 'https://example.com/test-video.mp4',
    onClose: mockOnClose,
    isOpen: true,
    enableFrameAnalysis: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      writable: true,
      configurable: true,
    });
  });

  it('renders when isOpen is true', () => {
    render(<VideoPlayer {...defaultProps} />);

    const video = document.querySelector('video');
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

  it('unmounts video when closed', () => {
    const { rerender } = render(<VideoPlayer {...defaultProps} />);

    expect(document.querySelector('video')).toBeInTheDocument();
    rerender(<VideoPlayer {...defaultProps} isOpen={false} />);

    expect(document.querySelector('video')).not.toBeInTheDocument();
  });

  it('shows staged verification overlay copy while verifying', () => {
    render(
      <VideoPlayer
        {...defaultProps}
        enableFrameAnalysis={true}
        verificationStatus="verifying"
      />
    );
    expect(screen.getByText(/Verifying authenticity|Preparing secure verification/i)).toBeInTheDocument();
  });

  it('allows playback controls while verification is in progress', () => {
    render(
      <VideoPlayer
        {...defaultProps}
        enableFrameAnalysis={true}
        verificationStatus="verifying"
      />
    );

    const video = document.querySelector('video') as HTMLVideoElement;
    expect(video).toHaveAttribute('src', defaultProps.videoUrl);
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
  });

  it('blocks playback controls when verification fails', () => {
    render(
      <VideoPlayer
        {...defaultProps}
        enableFrameAnalysis={true}
        verificationStatus="failed"
      />
    );

    expect(screen.getByText(/not authentic|viewing not allowed/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Play')).not.toBeInTheDocument();
  });

  it('shows creator profile QR button only after verified identity is available', () => {
    const { rerender } = render(
      <VideoPlayer
        {...defaultProps}
        enableFrameAnalysis={true}
        verificationStatus="verifying"
        verifiedUserId={null}
      />
    );

    expect(screen.queryByLabelText('View creator profile')).not.toBeInTheDocument();

    rerender(
      <VideoPlayer
        {...defaultProps}
        enableFrameAnalysis={true}
        verificationStatus="verified"
        verifiedUserId="123"
        videoId="test-video-id"
      />
    );

    expect(screen.getByTestId('presentation-qr')).toBeInTheDocument();
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
    const stage = video.parentElement as HTMLDivElement;
    const fullscreenButton = screen.getByLabelText('Fullscreen');

    stage.requestFullscreen = jest.fn();
    document.exitFullscreen = jest.fn();

    fireEvent.click(fullscreenButton);
    expect(stage.requestFullscreen).toHaveBeenCalled();

    Object.defineProperty(document, 'fullscreenElement', {value: stage, writable: true});
    fireEvent.click(fullscreenButton);
    expect(document.exitFullscreen).toHaveBeenCalled();
  });

  it('does not fullscreen empty stage when ssrVideo without shell root', () => {
    render(
      <VideoPlayer
        {...defaultProps}
        ssrVideo
        playbackContext="public"
        videoId="vid-1"
      />,
    );

    const stage = document.querySelector('[data-video-stage]') as HTMLDivElement;
    stage.requestFullscreen = jest.fn();

    fireEvent.click(screen.getByLabelText('Fullscreen'));

    expect(stage.requestFullscreen).not.toHaveBeenCalled();
  });

  it('fullscreens SSR shell root when ssrVideo is inside PublicVideoShell', () => {
    render(
      <div data-saivd-fullscreen-root data-video-stage className="relative h-full w-full">
        <video data-saivd-public-video="vid-1" />
        <VideoPlayer
          {...defaultProps}
          embedded
          ssrVideo
          playbackContext="public"
          videoId="vid-1"
        />
      </div>,
    );

    const shellRoot = document.querySelector('[data-saivd-fullscreen-root]') as HTMLDivElement;
    const innerStage = shellRoot.querySelector('[data-video-stage]') as HTMLDivElement;
    shellRoot.requestFullscreen = jest.fn();
    innerStage.requestFullscreen = jest.fn();

    fireEvent.click(screen.getByLabelText('Fullscreen'));

    expect(shellRoot.requestFullscreen).toHaveBeenCalled();
    expect(innerStage.requestFullscreen).not.toHaveBeenCalled();
  });

  it('stops playing when video ends', () => {
    render(<VideoPlayer {...defaultProps} />);
    
    const video = document.querySelector('[data-video-stage] video') as HTMLVideoElement;
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
