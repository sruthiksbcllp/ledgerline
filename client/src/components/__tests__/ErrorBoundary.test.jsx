import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';

const Boom = () => { throw new Error('kaboom'); };

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(<ErrorBoundary><div>healthy</div></ErrorBoundary>);
    expect(screen.getByText('healthy')).toBeInTheDocument();
  });
  it('catches a thrown render error and shows the fallback instead of crashing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
    expect(screen.getByText(/kaboom/)).toBeInTheDocument();
    spy.mockRestore();
  });
});
