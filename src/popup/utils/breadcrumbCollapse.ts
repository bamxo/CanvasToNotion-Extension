export interface CollapsedBreadcrumb<T> {
  hidden: T[];
  tail: T[];
}

// Keeps a breadcrumb trail on one line by folding everything but the last
// `visibleTailCount` entries into `hidden` (rendered as a "..." dropdown by
// the caller) instead of letting the trail wrap or grow unbounded.
export const collapseBreadcrumb = <T>(stack: T[], visibleTailCount = 2): CollapsedBreadcrumb<T> => {
  if (stack.length <= visibleTailCount) {
    return { hidden: [], tail: stack };
  }

  return {
    hidden: stack.slice(0, stack.length - visibleTailCount),
    tail: stack.slice(stack.length - visibleTailCount),
  };
};
