import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('react-icons/fa', () => ({
  FaArrowRight: () => <span>→</span>,
  FaInfoCircle: () => <span>ⓘ</span>,
}));

vi.mock('../Dashboard.module.css', () => ({
  default: new Proxy({}, { get: (_t, k) => String(k) }),
}));

import UsageCounter from '../UsageCounter';

describe('UsageCounter', () => {
  it('renders the "X of Y class slots used" label', () => {
    render(<UsageCounter used={3} limit={5} upgradeUrl="https://example.com/settings" />);
    expect(screen.getByText('3 of 5 class slots used')).toBeInTheDocument();
  });

  it('exposes the slot-usage tooltip content', () => {
    render(<UsageCounter used={0} limit={5} upgradeUrl="https://example.com/settings" />);
    expect(screen.getByText('Slot Usage Info')).toBeInTheDocument();
    expect(
      screen.getByText(/a class slot is used the moment you hit sync/i),
    ).toBeInTheDocument();
  });

  it('links "Upgrade" to the provided URL, opening in a new tab', () => {
    render(<UsageCounter used={5} limit={5} upgradeUrl="https://example.com/settings" />);
    const link = screen.getByRole('link', { name: /upgrade for unlimited/i });
    expect(link).toHaveAttribute('href', 'https://example.com/settings');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders one bar segment per slot and fills the used ones', () => {
    const { container } = render(
      <UsageCounter used={3} limit={5} upgradeUrl="https://example.com/settings" />,
    );
    const segments = container.querySelectorAll('.usageCounterSegment');
    expect(segments).toHaveLength(5);
    expect(container.querySelectorAll('.usageCounterSegmentFilled')).toHaveLength(3);
  });

  it('clamps the filled count when usage exceeds the limit', () => {
    const { container } = render(
      <UsageCounter used={9} limit={5} upgradeUrl="https://example.com/settings" />,
    );
    expect(container.querySelectorAll('.usageCounterSegmentFilled')).toHaveLength(5);
  });

  it('names the class in each filled segment and leaves empty ones bare', () => {
    const { container } = render(
      <UsageCounter
        used={2}
        usedClasses={['Intro to CS', 'Organic Chemistry']}
        limit={5}
        upgradeUrl="https://example.com/settings"
      />,
    );
    const tips = container.querySelectorAll('.usageCounterSegmentTip');
    expect(tips).toHaveLength(2);
    expect(screen.getByText('Intro to CS')).toBeInTheDocument();
    expect(screen.getByText('Organic Chemistry')).toBeInTheDocument();

    const focusable = container.querySelectorAll('.usageCounterSegment[tabindex="0"]');
    expect(focusable).toHaveLength(2);
  });
});
