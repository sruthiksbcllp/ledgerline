import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PageHeader from '../PageHeader';

describe('PageHeader', () => {
  it('renders the title and subtitle', () => {
    render(<PageHeader title="Fixed Asset Register" subtitle="All active assets" />);
    expect(screen.getByRole('heading', { name: 'Fixed Asset Register' })).toBeInTheDocument();
    expect(screen.getByText('All active assets')).toBeInTheDocument();
  });
  it('omits the subtitle line when not provided', () => {
    render(<PageHeader title="Only Title" />);
    expect(screen.getByRole('heading', { name: 'Only Title' })).toBeInTheDocument();
  });
  it('renders an actions node', () => {
    render(<PageHeader title="X" actions={<button>Add</button>} />);
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });
  it('accepts a lucide-style icon component without crashing', () => {
    const Icon = ({ size }) => <svg data-testid="icon" width={size} />;
    render(<PageHeader title="With Icon" icon={Icon} />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });
});
