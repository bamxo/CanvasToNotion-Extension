import { describe, it, expect } from 'vitest';
import { buildChildrenIndex, getChildrenOf, hasChildren } from '../utils/pageTree';

describe('pageTree', () => {
  const pages = [
    { id: 'root-1', title: 'Class Notes', parentId: null },
    { id: 'root-2', title: 'Assignments', parentId: null },
    { id: 'child-1', title: 'Unit 1', parentId: 'root-1' },
    { id: 'child-2', title: 'Unit 2', parentId: 'root-1' },
    { id: 'grandchild-1', title: 'Homework', parentId: 'child-1' },
  ];

  describe('buildChildrenIndex + getChildrenOf', () => {
    it('groups root-level pages under the null key', () => {
      const index = buildChildrenIndex(pages);
      expect(getChildrenOf(index, null).map((p) => p.id)).toEqual(['root-1', 'root-2']);
    });

    it('groups nested pages under their parentId', () => {
      const index = buildChildrenIndex(pages);
      expect(getChildrenOf(index, 'root-1').map((p) => p.id)).toEqual(['child-1', 'child-2']);
      expect(getChildrenOf(index, 'child-1').map((p) => p.id)).toEqual(['grandchild-1']);
    });

    it('returns an empty array for a page with no children', () => {
      const index = buildChildrenIndex(pages);
      expect(getChildrenOf(index, 'grandchild-1')).toEqual([]);
    });

    it('treats a missing parentId (legacy/flat API response) as root-level', () => {
      const flatPages = [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
      ];
      const index = buildChildrenIndex(flatPages as any);
      expect(getChildrenOf(index, null).map((p) => p.id)).toEqual(['a', 'b']);
    });

    it('treats a parentId pointing outside the accessible set as root-level', () => {
      // Notion search only returns pages explicitly shared with the integration,
      // so a page's real parent may not be in the returned set at all.
      const orphanPages = [{ id: 'orphan', title: 'Orphan', parentId: 'not-in-set' }];
      const index = buildChildrenIndex(orphanPages);
      expect(getChildrenOf(index, null).map((p) => p.id)).toEqual(['orphan']);
    });
  });

  describe('hasChildren', () => {
    it('is true for a page that has children in the set', () => {
      const index = buildChildrenIndex(pages);
      expect(hasChildren(index, 'root-1')).toBe(true);
    });

    it('is false for a page with no children', () => {
      const index = buildChildrenIndex(pages);
      expect(hasChildren(index, 'grandchild-1')).toBe(false);
      expect(hasChildren(index, 'root-2')).toBe(false);
    });
  });
});
