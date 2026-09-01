import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ClassSelector, { groupCoursesByTerm } from './ClassSelector'
import type { CandidateCourse } from '../../services/canvas/api'

const course = (over: Partial<CandidateCourse>): CandidateCourse => ({
  id: 1, name: 'Course', code: 'C1',
  term: { id: null, name: null, startAt: null },
  enrollmentState: 'active', ...over,
})

const baseProps = {
  candidates: [] as CandidateCourse[],
  loading: false,
  error: null as string | null,
  selectedIds: [] as number[],
  expanded: false,
  onToggleExpanded: vi.fn(),
  onToggleCourse: vi.fn(),
  onRetry: vi.fn(),
}

describe('groupCoursesByTerm', () => {
  it('orders term groups by startAt desc with Other last', () => {
    const groups = groupCoursesByTerm([
      course({ id: 1, term: { id: 9, name: 'Spring 2026', startAt: '2026-03-20T00:00:00Z' } }),
      course({ id: 2, term: { id: 10, name: 'Fall 2026', startAt: '2026-09-20T00:00:00Z' } }),
      course({ id: 3, term: { id: null, name: null, startAt: null } }),
    ])
    expect(groups.map(g => g.termName)).toEqual(['Fall 2026', 'Spring 2026', 'Other'])
    expect(groups[0].courses.map(c => c.id)).toEqual([2])
  })
})

describe('ClassSelector', () => {
  it('collapsed shows the empty prompt when nothing is selected', () => {
    render(<ClassSelector {...baseProps} />)
    expect(screen.getByText('Select classes to sync')).toBeInTheDocument()
  })

  it('collapsed shows the selected count', () => {
    render(<ClassSelector {...baseProps} selectedIds={[1, 2, 3]} />)
    expect(screen.getByText('Classes: 3 selected')).toBeInTheDocument()
  })

  it('clicking the header calls onToggleExpanded', () => {
    const onToggleExpanded = vi.fn()
    render(<ClassSelector {...baseProps} onToggleExpanded={onToggleExpanded} />)
    fireEvent.click(screen.getByText('Select classes to sync'))
    expect(onToggleExpanded).toHaveBeenCalled()
  })

  it('expanded + loading shows the spinner text', () => {
    render(<ClassSelector {...baseProps} expanded loading />)
    expect(screen.getByText('Loading your classes...')).toBeInTheDocument()
  })

  it('expanded + error shows the message and a wired Retry button', () => {
    const onRetry = vi.fn()
    render(<ClassSelector {...baseProps} expanded error="Canvas authentication required. Please log into Canvas first." onRetry={onRetry} />)
    expect(screen.getByText('Canvas authentication required. Please log into Canvas first.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('expanded renders grouped courses and toggles on checkbox click', () => {
    const onToggleCourse = vi.fn()
    render(<ClassSelector
      {...baseProps}
      expanded
      candidates={[
        course({ id: 1, name: 'Algorithms', code: 'CSE101', term: { id: 10, name: 'Fall 2026', startAt: '2026-09-20T00:00:00Z' } }),
        course({ id: 2, name: 'Old Bio', code: 'BIO1', term: { id: 9, name: 'Spring 2026', startAt: '2026-03-20T00:00:00Z' } }),
      ]}
      selectedIds={[1]}
      onToggleCourse={onToggleCourse}
    />)
    expect(screen.getByText('Fall 2026')).toBeInTheDocument()
    expect(screen.getByText('Spring 2026')).toBeInTheDocument()
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes[0].checked).toBe(true)
    fireEvent.click(boxes[1])
    expect(onToggleCourse).toHaveBeenCalledWith(2)
  })

  it('expanded with no candidates shows the empty-list message', () => {
    render(<ClassSelector {...baseProps} expanded />)
    expect(screen.getByText('No Canvas classes found for your account.')).toBeInTheDocument()
  })
})
