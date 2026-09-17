import React, { useState, useEffect, useMemo } from 'react';
import { FaFile, FaExclamationCircle, FaCog, FaChevronRight } from 'react-icons/fa';
import styles from './PageSelector.module.css';
import { configService } from '../../services/config';
import { buildChildrenIndex, getChildrenOf, hasChildren } from '../utils/pageTree';

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
  };

  useEffect(() => {
    // Trigger animation after component mounts
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

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

      {validStack.length > 0 && (
        <div className={styles.breadcrumbBar}>
          <button className={styles.breadcrumbItem} onClick={() => handleBreadcrumbSelect(-1)}>
            All pages
          </button>
          {validStack.map((page, index) => (
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
          ))}
        </div>
      )}

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