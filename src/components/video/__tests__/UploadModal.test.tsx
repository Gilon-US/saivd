import { render, screen, fireEvent } from '@testing-library/react';
import { UploadModal } from '../UploadModal';

jest.mock('@/components/media/MediaUploader', () => ({
  MediaUploader: ({
    onUploadComplete,
    onVideoBatchComplete,
  }: {
    onUploadComplete?: (data: { kind: 'video'; result: { filename: string } }) => void;
    onVideoBatchComplete?: (result: {
      batchId: string;
      succeeded: { filename: string }[];
      failed: unknown[];
      skipped: unknown[];
    }) => void;
  }) => (
    <button
      onClick={() => {
        const result = { filename: 'test.mp4' };
        onUploadComplete?.({ kind: 'video', result });
        onVideoBatchComplete?.({
          batchId: 'batch-1',
          succeeded: [result],
          failed: [],
          skipped: [],
        });
      }}>
      Mock MediaUploader
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

    expect(screen.getByText('Upload Media')).toBeInTheDocument();
    expect(screen.getByText('Mock MediaUploader')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<UploadModal {...mockProps} isOpen={false} />);

    expect(screen.queryByText('Upload Media')).not.toBeInTheDocument();
  });

  it('calls onClose when header close button is clicked', () => {
    render(<UploadModal {...mockProps} />);

    fireEvent.click(screen.getByRole('button', { name: '' }));
    expect(mockProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onUploadComplete and onClose when upload completes', () => {
    render(<UploadModal {...mockProps} />);

    fireEvent.click(screen.getByText('Mock MediaUploader'));

    expect(mockProps.onUploadComplete).toHaveBeenCalledWith({
      kind: 'video',
      result: { filename: 'test.mp4' },
    });
    expect(mockProps.onClose).toHaveBeenCalledTimes(1);
  });
});
