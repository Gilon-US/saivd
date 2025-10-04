/**
 * VideoUploader Component Tests
 * 
 * This file contains tests for the VideoUploader component.
 * Run these tests with: npm test VideoUploader
 * 
 * Note: These tests require Jest and React Testing Library to be installed:
 * npm install --save-dev jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { VideoUploader } from '../VideoUploader';
import { FileUploader } from '@/components/FileUploader';

// Mock dependencies
jest.mock('@/components/FileUploader', () => ({
  FileUploader: jest.fn(),
}));

// Mock URL.createObjectURL and URL.revokeObjectURL
const mockCreateObjectURL = jest.fn();
const mockRevokeObjectURL = jest.fn();

Object.defineProperty(window.URL, 'createObjectURL', {
  writable: true,
  value: mockCreateObjectURL,
});

Object.defineProperty(window.URL, 'revokeObjectURL', {
  writable: true,
  value: mockRevokeObjectURL,
});

describe('VideoUploader Component', () => {
  const mockOnVideoSelected = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementation for FileUploader
    (FileUploader as jest.Mock).mockImplementation(({ onFilesSelected }) => (
      <div data-testid="file-uploader">
        <button 
          data-testid="mock-select-file" 
          onClick={() => {
            const mockFile = new File(['file content'], 'test-video.mp4', { type: 'video/mp4' });
            onFilesSelected([mockFile]);
          }}
        >
          Select File
        </button>
      </div>
    ));
    
    // Mock createObjectURL to return a fake URL
    mockCreateObjectURL.mockReturnValue('blob:mock-url');
  });
  
  it('renders the FileUploader component', () => {
    render(<VideoUploader onVideoSelected={mockOnVideoSelected} />);
    
    // Check that the FileUploader is rendered
    expect(screen.getByTestId('file-uploader')).toBeInTheDocument();
  });
  
  it('passes the correct props to FileUploader', () => {
    render(<VideoUploader onVideoSelected={mockOnVideoSelected} maxSize={1000} />);
    
    // Check that FileUploader was called with correct props
    expect(FileUploader).toHaveBeenCalledWith(
      expect.objectContaining({
        accept: { 'video/*': ['.mp4', '.mov', '.avi', '.webm'] },
        maxSize: 1000,
      }),
      expect.anything()
    );
  });
  
  it('creates a video preview when a file is selected', async () => {
    render(<VideoUploader onVideoSelected={mockOnVideoSelected} />);
    
    // Simulate file selection
    screen.getByTestId('mock-select-file').click();
    
    // Wait for the preview to be created
    await waitFor(() => {
      // Check that createObjectURL was called
      expect(mockCreateObjectURL).toHaveBeenCalled();
      
      // Check that onVideoSelected was called with the file
      expect(mockOnVideoSelected).toHaveBeenCalledWith(expect.any(File));
    });
  });
  
  it('cleans up object URLs when unmounting', async () => {
    const { unmount } = render(<VideoUploader onVideoSelected={mockOnVideoSelected} />);
    
    // Simulate file selection
    screen.getByTestId('mock-select-file').click();
    
    // Wait for the preview to be created
    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });
    
    // Unmount the component
    unmount();
    
    // Check that revokeObjectURL was called
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
  
  it('cleans up previous object URL when selecting a new file', async () => {
    render(<VideoUploader onVideoSelected={mockOnVideoSelected} />);
    
    // Simulate first file selection
    screen.getByTestId('mock-select-file').click();
    
    // Wait for the first preview to be created
    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    });
    
    // Simulate second file selection
    mockCreateObjectURL.mockReturnValue('blob:mock-url-2');
    screen.getByTestId('mock-select-file').click();
    
    // Wait for the second preview to be created
    await waitFor(() => {
      // Check that createObjectURL was called again
      expect(mockCreateObjectURL).toHaveBeenCalledTimes(2);
      
      // Check that revokeObjectURL was called for the first URL
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });
  });
  
  it('handles empty file selection', async () => {
    // Override FileUploader mock for this test
    (FileUploader as jest.Mock).mockImplementation(({ onFilesSelected }) => (
      <div data-testid="file-uploader">
        <button 
          data-testid="mock-select-empty" 
          onClick={() => onFilesSelected([])}
        >
          Select Empty
        </button>
      </div>
    ));
    
    render(<VideoUploader onVideoSelected={mockOnVideoSelected} />);
    
    // Simulate empty file selection
    screen.getByTestId('mock-select-empty').click();
    
    // Wait for the callback to be called
    await waitFor(() => {
      // Check that onVideoSelected was called with null
      expect(mockOnVideoSelected).toHaveBeenCalledWith(null);
      
      // Check that createObjectURL was not called
      expect(mockCreateObjectURL).not.toHaveBeenCalled();
    });
  });
});
