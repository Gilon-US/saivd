import { render, screen, fireEvent } from '@testing-library/react';
import { UploadModal } from '../UploadModal';

// Mock the VideoUploader component
jest.mock('../VideoUploader', () => ({
  VideoUploader: ({ onUploadComplete }: { onUploadComplete: (data: { key: string; filename: string; originalUrl: string; thumbnailUrl: string }) => void }) => (
    <button onClick={() => onUploadComplete({ key: 'test', filename: 'test.mp4', originalUrl: 'test-url', thumbnailUrl: 'test-thumbnail' })}>
      Mock VideoUploader
    </button>
  ),
}));

describe('UploadModal', () => {
  const mockProps = {
    isOpen: true,
    onClose: jest.fn(),
    onUploadComplete: jest.fn(),
  };

  it('renders when isOpen is true', () => {
    render(<UploadModal {...mockProps} />);
    
    expect(screen.getByText('Upload Video')).toBeInTheDocument();
    expect(screen.getByText('Mock VideoUploader')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<UploadModal {...mockProps} isOpen={false} />);
    
    expect(screen.queryByText('Upload Video')).not.toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    render(<UploadModal {...mockProps} />);
    
    fireEvent.click(screen.getByRole('button', { name: '' })); // Close button has no text
    expect(mockProps.onClose).toHaveBeenCalled();
  });

  it('shows success state after upload completes', () => {
    render(<UploadModal {...mockProps} />);
    
    // Trigger the upload complete callback
    fireEvent.click(screen.getByText('Mock VideoUploader'));
    
    expect(screen.getByText('Upload Successful!')).toBeInTheDocument();
    expect(mockProps.onUploadComplete).toHaveBeenCalledWith({
      key: 'test',
      filename: 'test.mp4',
      originalUrl: 'test-url',
      thumbnailUrl: 'test-thumbnail',
    });
  });

  it('allows uploading another video after completion', () => {
    render(<UploadModal {...mockProps} />);
    
    // Trigger the upload complete callback
    fireEvent.click(screen.getByText('Mock VideoUploader'));
    
    // Click the "Upload Another Video" button
    fireEvent.click(screen.getByText('Upload Another Video'));
    
    // Should be back to the upload form
    expect(screen.getByText('Mock VideoUploader')).toBeInTheDocument();
    expect(screen.queryByText('Upload Successful!')).not.toBeInTheDocument();
  });

  it('closes the modal after completion when close button is clicked', () => {
    render(<UploadModal {...mockProps} />);
    
    // Trigger the upload complete callback
    fireEvent.click(screen.getByText('Mock VideoUploader'));
    
    // Click the "Close" button
    fireEvent.click(screen.getByText('Close'));
    
    expect(mockProps.onClose).toHaveBeenCalled();
  });
});
