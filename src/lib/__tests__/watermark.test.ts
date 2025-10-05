/**
 * Watermarking Service Client Tests
 * 
 * This file contains tests for the watermarking service client.
 * Run these tests with: npm test watermark
 * 
 * Note: These tests require Jest to be installed:
 * npm install --save-dev jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom
 */

import axios from 'axios';
import { backOff } from 'exponential-backoff';
import { 
  requestWatermarking,
  checkWatermarkingStatus
} from '../watermark';

// Mock axios and exponential-backoff
jest.mock('axios');
jest.mock('exponential-backoff');

// Mock environment variables
const originalEnv = process.env;
beforeEach(() => {
  jest.resetModules();
  process.env = { 
    ...originalEnv,
    WATERMARK_SERVICE_URL: 'https://api.watermarking-service.com',
    WATERMARK_SERVICE_API_KEY: 'test-api-key',
    NEXT_PUBLIC_APP_URL: 'https://example.com'
  };
});

afterEach(() => {
  process.env = originalEnv;
  jest.clearAllMocks();
});

describe('Watermarking Service Client', () => {
  // Mock axios create method
  const mockAxiosCreate = axios.create as jest.MockedFunction<typeof axios.create>;
  const mockAxiosInstance = {
    post: jest.fn(),
    get: jest.fn()
  };
  
  // Mock backOff function
  const mockBackOff = backOff as jest.MockedFunction<typeof backOff>;
  
  beforeEach(() => {
    // Setup axios mock
    mockAxiosCreate.mockReturnValue(mockAxiosInstance as unknown as ReturnType<typeof axios.create>);
    
    // Setup backOff mock to call the function directly
    mockBackOff.mockImplementation((fn) => fn());
    
    // Mock console.log to avoid cluttering test output
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  
  describe('requestWatermarking', () => {
    it('should successfully request watermarking', async () => {
      // Mock successful response
      const mockResponse = {
        data: {
          jobId: 'test-job-id',
          estimatedProcessingTime: 60
        }
      };
      mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);
      
      // Call the function
      const result = await requestWatermarking(
        'https://example.com/video.mp4',
        'https://example.com/callback',
        { position: 'center', opacity: 0.7 }
      );
      
      // Check that axios was called with correct parameters
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/watermark',
        {
          videoUrl: 'https://example.com/video.mp4',
          callbackUrl: 'https://example.com/callback',
          options: {
            position: 'center',
            opacity: 0.7,
            scale: 0.3
          }
        }
      );
      
      // Check the result
      expect(result).toEqual({
        jobId: 'test-job-id',
        estimatedProcessingTime: 60
      });
    });
    
    it('should throw error for missing video URL', async () => {
      await expect(requestWatermarking(
        '',
        'https://example.com/callback'
      )).rejects.toThrow('Video URL is required');
    });
    
    it('should throw error for missing callback URL', async () => {
      await expect(requestWatermarking(
        'https://example.com/video.mp4',
        ''
      )).rejects.toThrow('Callback URL is required');
    });
    
    it('should handle authentication errors', async () => {
      // Mock 401 error
      const mockError = {
        response: {
          status: 401,
          data: { message: 'Invalid API key' }
        }
      };
      mockAxiosInstance.post.mockRejectedValueOnce(mockError);
      
      // Mock axios.isAxiosError
      (axios.isAxiosError as jest.Mock) = jest.fn().mockReturnValue(true);
      
      // Call the function and expect error
      await expect(requestWatermarking(
        'https://example.com/video.mp4',
        'https://example.com/callback'
      )).rejects.toThrow('Authentication failed: Invalid API key');
    });
    
    it('should handle network errors', async () => {
      // Mock network error
      const mockError = {
        request: {},
        message: 'Network Error'
      };
      mockAxiosInstance.post.mockRejectedValueOnce(mockError);
      
      // Mock axios.isAxiosError
      (axios.isAxiosError as jest.Mock) = jest.fn().mockReturnValue(true);
      
      // Call the function and expect error
      await expect(requestWatermarking(
        'https://example.com/video.mp4',
        'https://example.com/callback'
      )).rejects.toThrow('No response from watermarking service');
    });
  });
  
  describe('checkWatermarkingStatus', () => {
    it('should successfully check watermarking status', async () => {
      // Mock successful response
      const mockResponse = {
        data: {
          jobId: 'test-job-id',
          status: 'completed',
          progress: 100,
          result: {
            videoUrl: 'https://example.com/watermarked.mp4',
            thumbnailUrl: 'https://example.com/thumbnail.jpg'
          }
        }
      };
      mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);
      
      // Call the function
      const result = await checkWatermarkingStatus('test-job-id');
      
      // Check that axios was called with correct parameters
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/status/test-job-id');
      
      // Check the result
      expect(result).toEqual({
        jobId: 'test-job-id',
        status: 'completed',
        progress: 100,
        result: {
          videoUrl: 'https://example.com/watermarked.mp4',
          thumbnailUrl: 'https://example.com/thumbnail.jpg'
        }
      });
    });
    
    it('should throw error for missing job ID', async () => {
      await expect(checkWatermarkingStatus('')).rejects.toThrow('Job ID is required');
    });
    
    it('should handle job not found errors', async () => {
      // Mock 404 error
      const mockError = {
        response: {
          status: 404,
          data: { message: 'Job not found' }
        }
      };
      mockAxiosInstance.get.mockRejectedValueOnce(mockError);
      
      // Mock axios.isAxiosError
      (axios.isAxiosError as jest.Mock) = jest.fn().mockReturnValue(true);
      
      // Call the function and expect error
      await expect(checkWatermarkingStatus('invalid-job-id')).rejects.toThrow('Job not found: invalid-job-id');
    });
  });
  
  describe('generateCallbackUrl', () => {
    it('should generate correct callback URL', () => {
      const token = 'test-token';
      const result = generateCallbackUrl(token);
      expect(result).toBe('https://example.com/api/callbacks/watermark?token=test-token');
    });
    
    it('should encode special characters in token', () => {
      const token = 'test token&special=chars';
      const result = generateCallbackUrl(token);
      expect(result).toBe('https://example.com/api/callbacks/watermark?token=test%20token%26special%3Dchars');
    });
    
    it('should throw error for missing token', () => {
      expect(() => generateCallbackUrl('')).toThrow('Token is required');
    });
    
    it('should use default URL if environment variable is not set', () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      const token = 'test-token';
      const result = generateCallbackUrl(token);
      expect(result).toBe('http://localhost:3000/api/callbacks/watermark?token=test-token');
    });
  });
  
  describe('parseWatermarkingError', () => {
    it('should parse axios error with response', () => {
      const error = {
        response: {
          status: 500,
          data: { message: 'Internal server error' }
        }
      };
      
      // Mock axios.isAxiosError
      (axios.isAxiosError as jest.Mock) = jest.fn().mockReturnValue(true);
      
      const result = parseWatermarkingError(error);
      expect(result).toBe('Watermarking service error (500): Internal server error');
    });
    
    it('should parse axios error with request but no response', () => {
      const error = {
        request: {},
        message: 'Network Error'
      };
      
      // Mock axios.isAxiosError
      (axios.isAxiosError as jest.Mock) = jest.fn().mockReturnValue(true);
      
      const result = parseWatermarkingError(error);
      expect(result).toBe('No response from watermarking service');
    });
    
    it('should parse axios error with neither request nor response', () => {
      const error = {
        message: 'Request setup error'
      };
      
      // Mock axios.isAxiosError
      (axios.isAxiosError as jest.Mock) = jest.fn().mockReturnValue(true);
      
      const result = parseWatermarkingError(error);
      expect(result).toBe('Request error: Request setup error');
    });
    
    it('should parse regular Error object', () => {
      const error = new Error('Test error');
      
      // Mock axios.isAxiosError
      (axios.isAxiosError as jest.Mock) = jest.fn().mockReturnValue(false);
      
      const result = parseWatermarkingError(error);
      expect(result).toBe('Test error');
    });
    
    it('should handle unknown error types', () => {
      const error = 123;
      
      // Mock axios.isAxiosError
      (axios.isAxiosError as jest.Mock) = jest.fn().mockReturnValue(false);
      
      const result = parseWatermarkingError(error);
      expect(result).toBe('Unknown error');
    });
  });
});
