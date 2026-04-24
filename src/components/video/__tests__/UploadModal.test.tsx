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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders when isOpen is true', () => {
    render(<UploadModal {...mockProps} />);

    expect(screen.getByText('Upload Video')).toBeInTheDocument();
    expect(screen.getByText('Mock VideoUploader')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<UploadModal {...mockProps} isOpen={false} />);

    expect(screen.queryByText('Upload Video')).not.toBeInTheDocument();
  });

  it('calls onClose when header close button is clicked', () => {
    render(<UploadModal {...mockProps} />);

    fireEvent.click(screen.getByRole('button', { name: '' }));
    expect(mockProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onUploadComplete and onClose when upload completes', () => {
    render(<UploadModal {...mockProps} />);

    fireEvent.click(screen.getByText('Mock VideoUploader'));

    expect(mockProps.onUploadComplete).toHaveBeenCalledWith({
      key: 'test',
      filename: 'test.mp4',
      originalUrl: 'test-url',
      thumbnailUrl: 'test-thumbnail',
    });
    expect(mockProps.onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Upload Successful!')).not.toBeInTheDocument();
    expect(screen.getByText('Mock VideoUploader')).toBeInTheDocument();
  });
});
