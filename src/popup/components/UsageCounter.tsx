import { FaArrowRight, FaInfoCircle } from 'react-icons/fa';
import styles from './Dashboard.module.css';

interface UsageCounterProps {
  /** Class slots the user has consumed — i.e. classes written to the DB by a sync. */
  used: number;
  /** Names of the classes filling the used slots, in order — shown per segment on hover. */
  usedClasses?: string[];
  /** Free-tier slot cap. */
  limit: number;
  /** Where the "Upgrade" link points (the web-app settings page). */
  upgradeUrl: string;
}

/**
 * Free-tier class-sync usage meter, shown between the unsynced list and the
 * sync button. Paid tiers don't render this at all — the parent decides.
 */
const UsageCounter = ({ used, usedClasses = [], limit, upgradeUrl }: UsageCounterProps) => {
  const filled = Math.max(0, Math.min(used, limit));

  return (
    <div className={styles.usageCounter}>
      <div className={styles.usageCounterTop}>
        <span className={styles.usageCounterLabel}>
          <span className={styles.usageCounterDot} />
          <span
            className={styles.usageCounterInfo}
            tabIndex={0}
            role="note"
            aria-label="Slot usage info"
          >
            <span className={styles.usageCounterInfoText}>
              {used} of {limit} class slots used
            </span>
            <span className={styles.usageCounterTooltip} role="tooltip">
              <span className={styles.usageCounterTooltipHeader}>
                <FaInfoCircle aria-hidden /> Slot Usage Info
              </span>
              <span className={styles.usageCounterTooltipBody}>
                A class slot is used the moment you hit sync. Slots are permanent,
                so once a class is added, you can&apos;t swap it out.
              </span>
            </span>
          </span>
        </span>
        <a
          className={styles.usageCounterUpgrade}
          href={upgradeUrl}
          target="_blank"
          rel="noreferrer"
        >
          Upgrade for unlimited <FaArrowRight aria-hidden />
        </a>
      </div>

      <div
        className={styles.usageCounterBar}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={filled}
        aria-label="Free class-sync slots used"
      >
        {Array.from({ length: limit }, (_, i) => {
          const isFilled = i < filled;
          const className = isFilled ? usedClasses[i] : undefined;
          return (
            <span
              key={i}
              className={`${styles.usageCounterSegment} ${
                isFilled ? styles.usageCounterSegmentFilled : ''
              }`}
              tabIndex={className ? 0 : undefined}
              aria-label={className}
            >
              {className && (
                <span className={styles.usageCounterSegmentTip} role="tooltip">
                  {className}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export default UsageCounter;
