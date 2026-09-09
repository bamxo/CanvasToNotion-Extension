import { FaAngleLeft, FaFile } from 'react-icons/fa';
import styles from './Dashboard.module.css';

interface PageHeaderProps {
  page: { title: string; icon?: string };
  onBack: () => void;
}

/**
 * Compact header for the synced dashboard: a back button that returns to the
 * Notion page selector, the page's emoji icon, and the page name as the title.
 */
const PageHeader = ({ page, onBack }: PageHeaderProps) => (
  <div className={styles.pageHeader}>
    <button
      type="button"
      className={styles.pageHeaderBack}
      onClick={onBack}
      aria-label="Back to page selection"
    >
      <FaAngleLeft />
    </button>
    {page.icon ? (
      <span className={styles.pageHeaderIcon}>{page.icon}</span>
    ) : (
      <FaFile className={styles.pageHeaderIcon} />
    )}
    <h2 className={styles.pageHeaderTitle}>{page.title}</h2>
  </div>
);

export default PageHeader;
