/**
 * FileUploader Component Tests
 * 
 * This file contains tests for the FileUploader component.
 * Run these tests with: npm test FileUploader
 * 
 * Note: These tests require Jest and React Testing Library to be installed:
 * npm install --save-dev jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import FileUploader from '../FileUploader';
import { useDropzone, FileRejection } from 'react-dropzone';

// Mock react-dropzone
jest.mock('react-dropzone', () => ({
  useDropzone: jest.fn(),
}));

describe('FileUploader Component', () => {
  const mockOnFilesSelected = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementation for useDropzone
    (useDropzone as jest.Mock).mockReturnValue({
      getRootProps: () => ({ onClick: jest.fn() }),
      getInputProps: () => ({}),
      isDragActive: false,
    });
  });
  
  it('renders the empty state correctly', () => {
    render(<FileUploader onFilesSelected={mockOnFilesSelected} />);
    
    // Check that the dropzone area is rendered
    expect(screen.getByText(/drag & drop a file here/i)).toBeInTheDocument();
    expect(screen.getByText(/or click to select a file/i)).toBeInTheDocument();
    expect(screen.getByText(/maximum file size:/i)).toBeInTheDocument();
  });
  
  it('shows drag active state', () => {
    // Mock drag active state
    (useDropzone as jest.Mock).mockReturnValue({
      getRootProps: () => ({ onClick: jest.fn() }),
      getInputProps: () => ({}),
      isDragActive: true,
    });
    
    render(<FileUploader onFilesSelected={mockOnFilesSelected} />);
    
    // Check that the drag active text is shown
    expect(screen.getByText(/drop the file here/i)).toBeInTheDocument();
  });
  
  it('displays selected files', () => {
    // Create a mock file
    const mockFile = new File(['file content'], 'test-file.mp4', { type: 'video/mp4' });
    
    // Render with useState mock to set selectedFiles
    jest.spyOn(React, 'useState').mockImplementationOnce(() => [[mockFile], jest.fn()]);
    
    render(<FileUploader onFilesSelected={mockOnFilesSelected} />);
    
    // Check that the file is displayed
    expect(screen.getByText('test-file.mp4')).toBeInTheDocument();
    expect(screen.getByText(/video\/mp4/)).toBeInTheDocument();
    
    // Check that the clear button is displayed
    expect(screen.getByRole('button', { name: /clear selection/i })).toBeInTheDocument();
  });
  
  it('calls onFilesSelected when files are dropped', () => {
    // Mock onDrop callback
    let onDropCallback: (acceptedFiles: File[], fileRejections: FileRejection[]) => void;
    
    (useDropzone as jest.Mock).mockImplementation(({ onDrop }) => {
      onDropCallback = onDrop;
      return {
        getRootProps: () => ({ onClick: jest.fn() }),
        getInputProps: () => ({}),
        isDragActive: false,
      };
    });
    
    render(<FileUploader onFilesSelected={mockOnFilesSelected} />);
    
    // Create a mock file
    const mockFile = new File(['file content'], 'test-file.mp4', { type: 'video/mp4' });
    
    // Simulate drop event
    onDropCallback!([mockFile], []);
    
    // Check that onFilesSelected was called with the file
    expect(mockOnFilesSelected).toHaveBeenCalledWith([mockFile]);
  });
  
  it('shows error for invalid file type', () => {
    // Mock onDrop callback
    let onDropCallback: (acceptedFiles: File[], fileRejections: FileRejection[]) => void;
    
    (useDropzone as jest.Mock).mockImplementation(({ onDrop }) => {
      onDropCallback = onDrop;
      return {
        getRootProps: () => ({ onClick: jest.fn() }),
        getInputProps: () => ({}),
        isDragActive: false,
      };
    });
    
    render(<FileUploader onFilesSelected={mockOnFilesSelected} />);
    
    // Create a mock file rejection
    const mockRejection = {
      file: new File(['file content'], 'test-file.txt', { type: 'text/plain' }),
      errors: [{ code: 'file-invalid-type', message: 'File type must be video/*' }],
    };
    
    // Simulate drop event with rejection
    onDropCallback!([], [mockRejection]);
    
    // Check that error message is displayed
    expect(screen.getByText(/invalid file type/i)).toBeInTheDocument();
    
    // Check that onFilesSelected was not called
    expect(mockOnFilesSelected).not.toHaveBeenCalled();
  });
  
  it('shows error for file too large', () => {
    // Mock onDrop callback
    let onDropCallback: (acceptedFiles: File[], fileRejections: FileRejection[]) => void;
    
    (useDropzone as jest.Mock).mockImplementation(({ onDrop }) => {
      onDropCallback = onDrop;
      return {
        getRootProps: () => ({ onClick: jest.fn() }),
        getInputProps: () => ({}),
        isDragActive: false,
      };
    });
    
    render(<FileUploader onFilesSelected={mockOnFilesSelected} />);
    
    // Create a mock file rejection
    const mockRejection = {
      file: new File(['file content'], 'large-file.mp4', { type: 'video/mp4' }),
      errors: [{ code: 'file-too-large', message: 'File is too large' }],
    };
    
    // Simulate drop event with rejection
    onDropCallback!([], [mockRejection]);
    
    // Check that error message is displayed
    expect(screen.getByText(/file is too large/i)).toBeInTheDocument();
    
    // Check that onFilesSelected was not called
    expect(mockOnFilesSelected).not.toHaveBeenCalled();
  });
  
  it('allows removing a selected file', () => {
    // Create a mock file
    const mockFile = new File(['file content'], 'test-file.mp4', { type: 'video/mp4' });
    
    // Render with useState mock to set selectedFiles
    const setSelectedFilesMock = jest.fn();
    jest.spyOn(React, 'useState').mockImplementationOnce(() => [[mockFile], setSelectedFilesMock]);
    
    render(<FileUploader onFilesSelected={mockOnFilesSelected} />);
    
    // Find and click the remove button
    const removeButton = screen.getByLabelText(/remove file/i);
    fireEvent.click(removeButton);
    
    // Check that onFilesSelected was called with empty array
    expect(mockOnFilesSelected).toHaveBeenCalledWith([]);
  });
  
  it('allows clearing all selected files', () => {
    // Create mock files
    const mockFile1 = new File(['content1'], 'file1.mp4', { type: 'video/mp4' });
    const mockFile2 = new File(['content2'], 'file2.mp4', { type: 'video/mp4' });
    
    // Render with useState mock to set selectedFiles
    const setSelectedFilesMock = jest.fn();
    jest.spyOn(React, 'useState').mockImplementationOnce(() => [[mockFile1, mockFile2], setSelectedFilesMock]);
    
    render(<FileUploader onFilesSelected={mockOnFilesSelected} />);
    
    // Find and click the clear selection button
    const clearButton = screen.getByRole('button', { name: /clear selection/i });
    fireEvent.click(clearButton);
    
    // Check that onFilesSelected was called with empty array
    expect(mockOnFilesSelected).toHaveBeenCalledWith([]);
  });
});
