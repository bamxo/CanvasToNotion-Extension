import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('react-icons/fa', () => ({
  FaAngleLeft: () => <span>‹</span>,
  FaFile: () => <span>📄</span>,
}));

vi.mock('../Dashboard.module.css', () => ({
  default: new Proxy({}, { get: (_t, k) => String(k) }),
}));

import PageHeader from '../PageHeader';

describe('PageHeader', () => {
  const onBack = vi.fn();
  beforeEach(() => vi.clearAllMocks());

  it('renders the page emoji icon and the title as a heading', () => {
    render(<PageHeader page={{ title: 'Another Page', icon: '👀' }} onBack={onBack} />);
    expect(screen.getByRole('heading', { name: 'Another Page' })).toBeInTheDocument();
    expect(screen.getByText('👀')).toBeInTheDocument();
  });

  it('falls back to a file icon when the page has no icon', () => {
    render(<PageHeader page={{ title: 'No Icon Page' }} onBack={onBack} />);
    expect(screen.getByRole('heading', { name: 'No Icon Page' })).toBeInTheDocument();
    expect(screen.getByText('📄')).toBeInTheDocument();
  });

  it('calls onBack when the back button is clicked', () => {
    render(<PageHeader page={{ title: 'Another Page', icon: '👀' }} onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: /back to page selection/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
