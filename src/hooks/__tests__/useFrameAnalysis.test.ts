import { renderHook, act } from '@testing-library/react';
import { useFrameAnalysis, FrameData, FrameAnalysisFunction } from '../useFrameAnalysis';
import { RefObject } from 'react';

describe('useFrameAnalysis', () => {
  let mockVideo: Partial<HTMLVideoElement>;
  let videoRef: RefObject<HTMLVideoElement>;
  let mockCanvas: Partial<HTMLCanvasElement>;
  let mockContext: Partial<CanvasRenderingContext2D>;

  beforeEach(() => {
    // Mock video element
    mockVideo = {
      paused: true,
      ended: false,
      currentTime: 0,
      videoWidth: 1920,
      videoHeight: 1080,
    };

    videoRef = {
      current: mockVideo as HTMLVideoElement,
    };

    // Mock canvas and context
    mockContext = {
      drawImage: jest.fn(),
      getImageData: jest.fn(() => ({
        data: new Uint8ClampedArray(1920 * 1080 * 4),
        width: 1920,
        height: 1080,
        colorSpace: 'srgb',
      } as ImageData)),
    };

    mockCanvas = {
      width: 0,
      height: 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getContext: jest.fn(() => mockContext as CanvasRenderingContext2D) as any,
    };

    // Mock document.createElement for canvas
    jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return mockCanvas as HTMLCanvasElement;
      }
      return document.createElement(tagName);
    });

    // Mock requestAnimationFrame and cancelAnimationFrame
    global.requestAnimationFrame = jest.fn((cb) => {
      setTimeout(cb, 16);
      return 1;
    });
    global.cancelAnimationFrame = jest.fn();

    // Mock performance.now
    jest.spyOn(performance, 'now').mockReturnValue(1000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('initializes with showOverlay as false', () => {
    const { result } = renderHook(() => useFrameAnalysis(videoRef, false));
    
    expect(result.current.showOverlay).toBe(false);
  });

  it('does not start analysis when video is not playing', () => {
    renderHook(() => useFrameAnalysis(videoRef, false));
    
    expect(global.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('starts analysis when video is playing', () => {
    renderHook(() => useFrameAnalysis(videoRef, true));
    
    expect(global.requestAnimationFrame).toHaveBeenCalled();
  });

  it('creates canvas with correct dimensions', async () => {
    renderHook(() => useFrameAnalysis(videoRef, true));
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    
    expect(mockCanvas.width).toBe(1920);
    expect(mockCanvas.height).toBe(1080);
  });

  it('calls analysis function with frame data', async () => {
    const mockAnalysisFunction = jest.fn(() => false);
    
    renderHook(() => useFrameAnalysis(videoRef, true, mockAnalysisFunction));
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    
    expect(mockAnalysisFunction).toHaveBeenCalled();
    const frameData = mockAnalysisFunction.mock.calls[0]?.[0] as FrameData;
    expect(frameData).toHaveProperty('canvas');
    expect(frameData).toHaveProperty('context');
    expect(frameData).toHaveProperty('imageData');
    expect(frameData).toHaveProperty('timestamp');
    expect(frameData).toHaveProperty('videoTime');
  });

  it('updates showOverlay based on analysis function result', async () => {
    const mockAnalysisFunction: FrameAnalysisFunction = () => true;
    
    const { result } = renderHook(() => 
      useFrameAnalysis(videoRef, true, mockAnalysisFunction)
    );
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    
    expect(result.current.showOverlay).toBe(true);
  });

  it('handles analysis function errors gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const errorAnalysisFunction: FrameAnalysisFunction = () => {
      throw new Error('Analysis error');
    };
    
    const { result } = renderHook(() => 
      useFrameAnalysis(videoRef, true, errorAnalysisFunction)
    );
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error in frame analysis:',
      expect.any(Error)
    );
    expect(result.current.showOverlay).toBe(false);
    
    consoleErrorSpy.mockRestore();
  });

  it('stops analysis when video is paused', async () => {
    const { rerender } = renderHook(
      ({ isPlaying }) => useFrameAnalysis(videoRef, isPlaying),
      { initialProps: { isPlaying: true } }
    );
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    
    const callCountWhilePlaying = (global.requestAnimationFrame as jest.Mock).mock.calls.length;
    
    // Pause the video
    rerender({ isPlaying: false });
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    
    // Should not have made additional requestAnimationFrame calls
    expect((global.requestAnimationFrame as jest.Mock).mock.calls.length).toBe(callCountWhilePlaying);
  });

  it('resets overlay when video stops playing', () => {
    const { result, rerender } = renderHook(
      ({ isPlaying }) => useFrameAnalysis(videoRef, isPlaying),
      { initialProps: { isPlaying: true } }
    );
    
    act(() => {
      rerender({ isPlaying: false });
    });
    
    expect(result.current.showOverlay).toBe(false);
  });

  it('cleans up animation frame on unmount', () => {
    const { unmount } = renderHook(() => useFrameAnalysis(videoRef, true));
    
    unmount();
    
    expect(global.cancelAnimationFrame).toHaveBeenCalled();
  });

  it('does not analyze if video element is null', () => {
    const nullVideoRef: RefObject<HTMLVideoElement | null> = { current: null };
    const mockAnalysisFunction = jest.fn(() => false);
    
    renderHook(() => useFrameAnalysis(nullVideoRef, true, mockAnalysisFunction));
    
    expect(mockAnalysisFunction).not.toHaveBeenCalled();
  });

  it('does not analyze if video is ended', async () => {
    Object.defineProperty(mockVideo, 'ended', { value: true, writable: true });
    const mockAnalysisFunction = jest.fn(() => false);
    
    renderHook(() => useFrameAnalysis(videoRef, true, mockAnalysisFunction));
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    
    expect(mockAnalysisFunction).not.toHaveBeenCalled();
  });

  it('uses default analysis function when none provided', async () => {
    const { result } = renderHook(() => useFrameAnalysis(videoRef, true));
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    
    // Default function returns false
    expect(result.current.showOverlay).toBe(false);
  });

  it('draws video frame to canvas', async () => {
    renderHook(() => useFrameAnalysis(videoRef, true));
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    
    expect(mockContext.drawImage).toHaveBeenCalledWith(
      mockVideo,
      0,
      0,
      1920,
      1080
    );
  });

  it('gets image data from canvas', async () => {
    renderHook(() => useFrameAnalysis(videoRef, true));
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    
    expect(mockContext.getImageData).toHaveBeenCalledWith(0, 0, 1920, 1080);
  });

  it('includes correct video time in frame data', async () => {
    mockVideo.currentTime = 5.5;
    const mockAnalysisFunction = jest.fn(() => false);
    
    renderHook(() => useFrameAnalysis(videoRef, true, mockAnalysisFunction));
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    
    const frameData = mockAnalysisFunction.mock.calls[0]?.[0] as FrameData;
    expect(frameData.videoTime).toBe(5.5);
  });

  it('includes performance timestamp in frame data', async () => {
    const mockAnalysisFunction = jest.fn(() => false);
    
    renderHook(() => useFrameAnalysis(videoRef, true, mockAnalysisFunction));
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    
    const frameData = mockAnalysisFunction.mock.calls[0]?.[0] as FrameData;
    expect(frameData.timestamp).toBe(1000);
  });
});
