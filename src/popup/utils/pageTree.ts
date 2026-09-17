export interface TreeNotionPage {
  id: string;
  title: string;
  icon?: string;
  type?: string;
  parentId?: string | null;
}

export type ChildrenIndex = Map<string | null, TreeNotionPage[]>;

const ROOT_KEY = null;

// Builds a parentId -> children lookup from the flat list the /notion/pages
// endpoint returns. A page whose parentId is missing, or points at a page
// outside the accessible set (Notion search only returns pages explicitly
// shared with the integration), is folded into the root bucket so it never
// silently disappears from the picker.
export const buildChildrenIndex = (pages: TreeNotionPage[]): ChildrenIndex => {
  const knownIds = new Set(pages.map((p) => p.id));
  const index: ChildrenIndex = new Map();

  for (const page of pages) {
    const parentId = page.parentId && knownIds.has(page.parentId) ? page.parentId : ROOT_KEY;
    const bucket = index.get(parentId);
    if (bucket) {
      bucket.push(page);
    } else {
      index.set(parentId, [page]);
    }
  }

  return index;
};

export const getChildrenOf = (index: ChildrenIndex, parentId: string | null): TreeNotionPage[] =>
  index.get(parentId) ?? [];

export const hasChildren = (index: ChildrenIndex, pageId: string): boolean =>
  (index.get(pageId)?.length ?? 0) > 0;
