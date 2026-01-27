import { memo, useEffect, useState } from 'react';
import styles from './Dashboard.module.css';

interface SyncButtonProps {
  onSync: () => void;
  isLoading: boolean;
  disabled: boolean;
  lastSync: string | null;
  syncStatus: 'success' | 'error' | 'partial' | null;
  progress?: number;
}

// Use memo to prevent unnecessary re-renders
const SyncButton = memo(({
  onSync,
  isLoading,
  disabled,
  lastSync,
  syncStatus,
  progress = 0
}: SyncButtonProps) => {
  const [showStatus, setShowStatus] = useState(false);

  // Show animation when sync status changes
  useEffect(() => {
    if (syncStatus) {
      setShowStatus(true);
    }
  }, [syncStatus]);
  
  // Prepare status message based on syncStatus to avoid conditional rendering in the JSX
  let statusMessage = null;
  if (syncStatus === 'success') {
    statusMessage = (
      <div className={`${styles.successMessage} ${showStatus ? styles.fadeIn : ''}`}>
        ✓ Sync completed successfully
      </div>
    );
  } else if (syncStatus === 'partial') {
    statusMessage = (
      <div className={`${styles.partialMessage} ${showStatus ? styles.fadeIn : ''}`}>
        ⚠ Sync partially completed
      </div>
    );
  } else if (syncStatus === 'error') {
    statusMessage = (
      <div className={`${styles.errorMessage} ${showStatus ? styles.fadeIn : ''}`}>
        ✗ Sync failed. Please try again.
      </div>
    );
  }

  // Generate button text based on loading state and progress
  const getButtonText = () => {
    if (!isLoading) {
      return 'Sync All Assignments';
    }
    
    if (progress > 0 && progress < 100) {
      return `Syncing... ${progress}%`;
    }
    
    return 'Syncing...';
  };

  return (
    <>
      <div className={styles.statusContainer}>
        {lastSync && (
          <p className={styles.lastSync}>
            Last synced: {lastSync}
          </p>
        )}
        {statusMessage}
      </div>

      <button 
        onClick={onSync} 
        disabled={disabled}
        className={styles.syncButton}
      >
        {getButtonText()}
      </button>
      
      {/* Progress bar shown during sync */}
      {isLoading && progress > 0 && (
        <div className={styles.progressBarContainer}>
          <div 
            className={styles.progressBar} 
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </>
  );
});

export default SyncButton; 