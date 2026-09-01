import React from 'react';
import { FaCalendarAlt, FaChevronDown, FaChevronRight } from 'react-icons/fa';
import type { CandidateCourse } from '../../services/canvas/api';
import styles from './Dashboard.module.css';

interface ClassSelectorProps {
  candidates: CandidateCourse[];
  loading: boolean;
  error: string | null;
  selectedIds: number[];
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleCourse: (id: number) => void;
  onRetry: () => void;
}

interface TermGroup {
  termId: number | null;
  termName: string;
  startAt: string | null;
  courses: CandidateCourse[];
}

export function groupCoursesByTerm(courses: CandidateCourse[]): TermGroup[] {
  const groups = new Map<number | 'other', TermGroup>();
  for (const c of courses) {
    const key = c.term.id ?? 'other';
    if (!groups.has(key)) {
      groups.set(key, {
        termId: c.term.id ?? null,
        termName: c.term.name ?? 'Other',
        startAt: c.term.startAt ?? null,
        courses: [],
      });
    }
    groups.get(key)!.courses.push(c);
  }
  return Array.from(groups.values()).sort((a, b) => {
    if (a.termId === null && b.termId === null) return 0;
    if (a.termId === null) return 1; // Other last
    if (b.termId === null) return -1;
    if (a.startAt && b.startAt) return b.startAt.localeCompare(a.startAt); // newest first
    if (a.startAt) return -1;
    if (b.startAt) return 1;
    return 0;
  });
}

const ClassSelector: React.FC<ClassSelectorProps> = ({
  candidates, loading, error, selectedIds, expanded,
  onToggleExpanded, onToggleCourse, onRetry,
}) => {
  const count = selectedIds.length;
  const groups = groupCoursesByTerm(candidates);

  return (
    <div className={styles.classSelectorContainer}>
      <button
        type="button"
        className={styles.classSelectorHeader}
        onClick={onToggleExpanded}
        aria-expanded={expanded}
      >
        <FaCalendarAlt className={styles.classSelectorIcon} />
        {count > 0 ? (
          <span className={styles.classSelectorSummary}>{`Classes: ${count} selected`}</span>
        ) : (
          <span className={styles.classSelectorEmpty}>Select classes to sync</span>
        )}
        {expanded
          ? <FaChevronDown className={styles.classSelectorChevron} />
          : <FaChevronRight className={styles.classSelectorChevron} />}
      </button>

      {expanded && (
        <div className={styles.classSelectorBody}>
          {loading && <p className={styles.classSelectorLoading}>Loading your classes...</p>}

          {!loading && error && (
            <div className={styles.classSelectorError}>
              <p>{error}</p>
              <button type="button" className={styles.classSelectorRetry} onClick={onRetry}>
                Retry
              </button>
            </div>
          )}

          {!loading && !error && candidates.length === 0 && (
            <p className={styles.classSelectorEmptyList}>No Canvas classes found for your account.</p>
          )}

          {!loading && !error && groups.map((group) => (
            <div key={group.termId ?? 'other'} className={styles.classSelectorGroup}>
              <div className={styles.classSelectorGroupHeader}>{group.termName}</div>
              {group.courses.map((c) => (
                <label key={c.id} className={styles.classSelectorRow}>
                  <input
                    type="checkbox"
                    className={styles.classSelectorCheckbox}
                    checked={selectedIds.includes(c.id)}
                    onChange={() => onToggleCourse(c.id)}
                  />
                  <span className={styles.classSelectorCourseName}>{c.name}</span>
                  {c.code && <span className={styles.classSelectorCourseCode}>{c.code}</span>}
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClassSelector;
