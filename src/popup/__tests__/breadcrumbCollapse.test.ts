import { describe, it, expect } from 'vitest';
import { collapseBreadcrumb } from '../utils/breadcrumbCollapse';

describe('collapseBreadcrumb', () => {
  const stack = ['a', 'b', 'c', 'd', 'e'];

  it('does not collapse anything when the stack fits within the visible tail count', () => {
    expect(collapseBreadcrumb(['a', 'b'], 2)).toEqual({ hidden: [], tail: ['a', 'b'] });
  });

  it('does not collapse a stack exactly at the visible tail count', () => {
    expect(collapseBreadcrumb(['a', 'b'], 2)).toEqual({ hidden: [], tail: ['a', 'b'] });
  });

  it('collapses everything but the last N entries into hidden', () => {
    expect(collapseBreadcrumb(stack, 2)).toEqual({
      hidden: ['a', 'b', 'c'],
      tail: ['d', 'e'],
    });
  });

  it('defaults to a visible tail count of 2', () => {
    expect(collapseBreadcrumb(stack)).toEqual({
      hidden: ['a', 'b', 'c'],
      tail: ['d', 'e'],
    });
  });

  it('handles an empty stack', () => {
    expect(collapseBreadcrumb([], 2)).toEqual({ hidden: [], tail: [] });
  });
});
