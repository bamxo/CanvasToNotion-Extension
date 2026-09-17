import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FaFile, FaExclamationCircle, FaCog, FaChevronRight, FaEllipsisH } from 'react-icons/fa';
import styles from './PageSelector.module.css';
import { configService } from '../../services/config';
import { buildChildrenIndex, getChildrenOf, hasChildren } from '../utils/pageTree';
import { collapseBreadcrumb } from '../utils/breadcrumbCollapse';

interface NotionPage {
  id: string;
  title: string;
  icon?: string;
  type?: string;
  parentId?: string | null;
}

interface DefaultPageViewProps {
  pages: NotionPage[];
  isLoading: boolean;
  onPageSelect: (page: NotionPage) => void;
}

const DefaultPageView: React.FC<DefaultPageViewProps> = ({
  pages,
  isLoading,
  onPageSelect
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [stack, setStack] = useState<NotionPage[]>([]);
  const [isEllipsisOpen, setIsEllipsisOpen] = useState(false);
  const breadcrumbRef = useRef<HTMLDivElement>(null);

  const childrenIndex = useMemo(() => buildChildrenIndex(pages), [pages]);

  // Drop any breadcrumb entries that no longer exist in a fresh pages
  // response (e.g. the user removed integration access to that page)
  // instead of navigating into a stale, now-nonexistent page.
  const validStack = useMemo(() => {
    const pageIds = new Set(pages.map((p) => p.id));
    const staleIndex = stack.findIndex((p) => !pageIds.has(p.id));
    return staleIndex === -1 ? stack : stack.slice(0, staleIndex);
  }, [stack, pages]);

  const currentParentId = validStack.at(-1)?.id ?? null;
  const visiblePages = getChildrenOf(childrenIndex, currentParentId);

  const handleDrillInto = (page: NotionPage) => {
    setStack((prev) => [...prev, page]);
  };

  const handleBreadcrumbSelect = (index: number) => {
    // index === -1 resets to the root
    setStack((prev) => prev.slice(0, index + 1));
    setIsEllipsisOpen(false);
  };

  useEffect(() => {
    // Trigger animation after component mounts
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Close the "..." dropdown on an outside click, and whenever navigation
  // changes the trail out from under it.
  useEffect(() => {
    setIsEllipsisOpen(false);
  }, [validStack]);

  useEffect(() => {
    if (!isEllipsisOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (breadcrumbRef.current && !breadcrumbRef.current.contains(event.target as Node)) {
        setIsEllipsisOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEllipsisOpen]);

  const handleOpenSettings = async () => {
    // Determine the settings URL based on environment
    const webAppBaseUrl = await configService.getWebAppBaseUrl();
    
    chrome.tabs.create({ url: `${webAppBaseUrl}/settings` });
    window.close();
  };

  const animationStyle = {
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? 'scale(1)' : 'scale(0.95)',
    transition: 'opacity 0.5s ease-in-out, transform 0.5s ease-out'
  };

  // If no pages, display the full-screen no pages message
  if (pages.length === 0) {
    return (
      <div style={animationStyle} className={styles.notionDisconnectedContainer}>
        <div className={styles.iconWrapper}>
          <FaExclamationCircle className={styles.disconnectedIcon} />
        </div>
        <h2 className={styles.disconnectedTitle}>No Pages Found</h2>
        <p className={styles.disconnectedMessage}>
          You need to connect to Notion and select pages to sync with in settings.
        </p>
        <button 
          className={styles.settingsButton}
          onClick={handleOpenSettings}
        >
          <FaCog className={styles.settingsIcon} />
          Open Settings
        </button>
      </div>
    );
  }

  // Regular view with pages
  return (
    <div style={animationStyle} className={styles.defaultPageWrapper}>
      <div className={styles.headerContainer}>
        <h2 className={styles.title}>Select a Page</h2>
        <p className={styles.subtext}>
          Tap a page to sync to it, or tap the arrow to look inside.
        </p>
        {isLoading && <span className={styles.refreshIndicator}>Refreshing...</span>}
      </div>

      {validStack.length > 0 && (() => {
        const { hidden, tail } = collapseBreadcrumb(validStack, 2);
        return (
          <div className={styles.breadcrumbBar} ref={breadcrumbRef}>
            <button className={styles.breadcrumbItem} onClick={() => handleBreadcrumbSelect(-1)}>
              All pages
            </button>

            {hidden.length > 0 && (
              <>
                <FaChevronRight className={styles.breadcrumbSeparator} />
                <div className={styles.breadcrumbEllipsisWrapper}>
                  <button
                    className={styles.breadcrumbEllipsis}
                    onClick={() => setIsEllipsisOpen((open) => !open)}
                    aria-label="Show hidden breadcrumb pages"
                    aria-expanded={isEllipsisOpen}
                  >
                    <FaEllipsisH />
                  </button>
                  {isEllipsisOpen && (
                    <div className={styles.breadcrumbDropdown} role="menu">
                      {hidden.map((page, index) => (
                        <button
                          key={page.id}
                          className={styles.breadcrumbDropdownItem}
                          role="menuitem"
                          onClick={() => handleBreadcrumbSelect(index)}
                        >
                          {page.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {tail.map((page, tailIndex) => {
              const index = hidden.length + tailIndex;
              return (
                <React.Fragment key={page.id}>
                  <FaChevronRight className={styles.breadcrumbSeparator} />
                  <button
                    className={styles.breadcrumbItem}
                    onClick={() => handleBreadcrumbSelect(index)}
                    disabled={index === validStack.length - 1}
                  >
                    {page.title}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        );
      })()}

      <div className={styles.pageList}>
        {visiblePages.map((page: NotionPage) => {
          const canDrillIn = hasChildren(childrenIndex, page.id);
          return (
            <div key={page.id} className={styles.pageItem}>
              <button className={styles.pageItemMain} onClick={() => onPageSelect(page)}>
                {page.icon ? (
                  <span className={styles.pageIcon}>{page.icon}</span>
                ) : (
                  <FaFile className={styles.defaultPageIcon} />
                )}
                <span className={styles.pageTitle}>{page.title}</span>
              </button>
              {canDrillIn && (
                <>
                  <span className={styles.pageItemDivider} />
                  <button
                    className={styles.drillIntoButton}
                    data-testid="drill-into"
                    aria-label={`View subpages of ${page.title}`}
                    onClick={() => handleDrillInto(page)}
                  >
                    <FaChevronRight />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <FaFile className={styles.legendIcon} />
          Select page
        </span>
        <span className={styles.legendItem}>
          <FaChevronRight className={styles.legendIcon} />
          View subpages
        </span>
      </div>
    </div>
  );
};

export default DefaultPageView; 