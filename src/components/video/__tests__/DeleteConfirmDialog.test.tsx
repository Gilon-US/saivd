import { render, screen, fireEvent } from '@testing-library/react';
import { DeleteConfirmDialog } from '../DeleteConfirmDialog';

describe('DeleteConfirmDialog', () => {
  const mockProps = {
    isOpen: true,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    videoFilename: 'test-video.mp4',
    isDeleting: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders dialog when isOpen is true', () => {
    render(<DeleteConfirmDialog {...mockProps} />);
    
    expect(screen.getByText('Delete Video')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete this video?')).toBeInTheDocument();
    expect(screen.getByText('"test-video.mp4"')).toBeInTheDocument();
  });

  it('does not render dialog when isOpen is false', () => {
    render(<DeleteConfirmDialog {...mockProps} isOpen={false} />);
    
    expect(screen.queryByText('Delete Video')).not.toBeInTheDocument();
  });

  it('calls onClose when cancel button is clicked', () => {
    render(<DeleteConfirmDialog {...mockProps} />);
    
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);
    
    expect(mockProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when X button is clicked', () => {
    render(<DeleteConfirmDialog {...mockProps} />);
    
    const closeButton = screen.getByRole('button', { name: '' }); // X button has no text
    fireEvent.click(closeButton);
    
    expect(mockProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm when delete button is clicked', () => {
    render(<DeleteConfirmDialog {...mockProps} />);
    
    const deleteButton = screen.getByText('Delete Video');
    fireEvent.click(deleteButton);
    
    expect(mockProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows deleting state when isDeleting is true', () => {
    render(<DeleteConfirmDialog {...mockProps} isDeleting={true} />);
    
    expect(screen.getByText('Deleting...')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeDisabled();
    expect(screen.getByRole('button', { name: '' })).toBeDisabled(); // X button
  });

  it('disables buttons when isDeleting is true', () => {
    render(<DeleteConfirmDialog {...mockProps} isDeleting={true} />);
    
    const cancelButton = screen.getByText('Cancel');
    const deleteButton = screen.getByText('Deleting...');
    const closeButton = screen.getByRole('button', { name: '' });
    
    expect(cancelButton).toBeDisabled();
    expect(deleteButton).toBeDisabled();
    expect(closeButton).toBeDisabled();
  });

  it('displays warning message about permanent deletion', () => {
    render(<DeleteConfirmDialog {...mockProps} />);
    
    expect(screen.getByText(/This action cannot be undone/)).toBeInTheDocument();
    expect(screen.getByText(/permanently deleted from storage/)).toBeInTheDocument();
  });

  it('displays alert triangle icon', () => {
    render(<DeleteConfirmDialog {...mockProps} />);
    
    // Check for the alert triangle icon (we can't easily test the icon itself, but we can check the structure)
    const alertIcon = screen.getByText('Are you sure you want to delete this video?').closest('div')?.querySelector('svg');
    expect(alertIcon).toBeInTheDocument();
  });
});
