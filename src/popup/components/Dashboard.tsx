/**
 * Dashboard Component
 * 
 * This component displays the main dashboard interface after user authentication.
 * It shows sync status, recent syncs, and provides controls for manual syncing.
 */

import React, { useEffect, useState, useRef } from 'react'
import axios from 'axios'
import styles from './Dashboard.module.css'
import { getAuth, AuthUser } from '../../services/chrome-auth.service'
import AppBar from './AppBar'
import PageSelectionContainer from './PageSelectionContainer'
import UnsyncedContainer from './UnsyncedContainer'
import SyncButton from './SyncButton'
import NotionDisconnected from './NotionDisconnected'
import ClassSelector from './ClassSelector'
import { canvasApi } from '../../services/canvas/api'
import type { CandidateCourse, SelectedCourse } from '../../services/canvas/api'
import { UnsyncedItem, transformCanvasAssignments } from '../utils/assignmentTransformer'
import { ENDPOINTS } from '../../services/api.config'


interface NotionPage {
  id: string;
  title: string;
  icon?: string;
  type?: string;
}

interface SyncData {
  pageId: string;
  courses: SelectedCourse[];
}

interface DashboardProps {
  selectedPage: NotionPage;
}

// Particle component
const Particle = ({ delay }: { delay: number }) => {
  const style = {
    left: `${Math.random() * 100}%`,
    animation: `${styles.floatParticle} 6s ease-in infinite`,
    animationDelay: `${delay}s`
  };

  return <div className={styles.particle} style={style} />;
};

const Dashboard = ({ selectedPage }: DashboardProps) => {
  const [isLoading, setIsLoading] = useState(false)
  const [isComparing, setIsComparing] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<'success' | 'error' | 'partial' | null>(null)
  const [syncProgress, setSyncProgress] = useState<number>(0)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [firebaseToken, setFirebaseToken] = useState<string | null>(null)
  const [unsyncedItems, setUnsyncedItems] = useState<UnsyncedItem[]>([])
  const [isNotionConnected, setIsNotionConnected] = useState<boolean | null>(null)
  const [checkingConnection, setCheckingConnection] = useState(true)
  const [candidates, setCandidates] = useState<CandidateCourse[]>([])
  const [candidatesLoading, setCandidatesLoading] = useState(false)
  const [candidatesError, setCandidatesError] = useState<string | null>(null)
  const [selectedCourseIds, setSelectedCourseIds] = useState<number[]>([])
  const [classPanelExpanded, setClassPanelExpanded] = useState(false)

  // Generate array of particles with useRef to avoid re-creation on re-renders
  const particles = useRef(
    Array.from({ length: 20 }, (_, i) => (
      <Particle key={i} delay={i * 0.3} />
    ))
  ).current;

  useEffect(() => {
    const auth = getAuth();
    
    // Set up auth state listener
    const unsubscribe = auth.onIdTokenChanged((user: AuthUser | null) => {
      console.log('Auth state changed:', user?.email);
      if (user?.email) {
        setUserEmail(user.email);
        // Get auth token when user is authenticated
        user.getIdToken().then((token: string) => {
          setFirebaseToken(token);
          chrome.storage.local.set({ firebaseToken: token });
        }).catch((error: Error) => {
          console.error('Error getting ID token:', error);
        });
      } else {
        // If we don't have a user email from auth state, try to get it from storage
        chrome.storage.local.get(['userEmail', 'firebaseToken', 'authToken'], (result) => {
          if (result.userEmail) {
            setUserEmail(result.userEmail);
            console.log('Retrieved email from storage:', result.userEmail);
          } else {
            console.log('No email found in storage');
          }
          
          const storedToken = result.firebaseToken || result.authToken;
          if (storedToken) {
            setFirebaseToken(storedToken);
            console.log('Retrieved auth token from storage');
          } else {
            console.log('No auth token found in storage');
          }
        });
      }
    });

    // Cleanup auth listener
    return () => unsubscribe();
  }, []);

  // Trigger comparison when page is selected, authentication is available, Notion is connected, or the class selection changes
  const selectedCourseKey = selectedCourseIds.join(',');
  const candidateKey = candidates.map(c => c.id).join(',');
  useEffect(() => {
    if (selectedPage && firebaseToken && isNotionConnected === true) {
      compareWithNotion();
    }
  }, [selectedPage, firebaseToken, isNotionConnected, selectedCourseKey, candidateKey]);

  // Debug log whenever auth or selectedPage changes
  useEffect(() => {
    console.log('Current user email:', userEmail);
    console.log('Selected page:', selectedPage ? {id: selectedPage.id, title: selectedPage.title} : 'None');
    console.log('Firebase token available:', !!firebaseToken);

    // Store email in chrome storage when it changes
    if (userEmail) {
      chrome.storage.local.set({ userEmail });
    }
  }, [userEmail, selectedPage, firebaseToken]);

  // Check Notion connection
  const checkNotionConnection = async () => {
    try {
      if (!firebaseToken) {
        console.log('Waiting for firebase token...');
        return false;
      }

      console.log('Checking Notion connection in Dashboard');
      setCheckingConnection(true);
      
      const connectedEndpoint = await ENDPOINTS.CONNECTED();
      const response = await axios.get(connectedEndpoint, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${firebaseToken}`
        },
        timeout: 5000
      });

      console.log('Notion connection response:', response.data);
      const isConnected = response.data.connected;
      setIsNotionConnected(isConnected);
      setCheckingConnection(false);
      return isConnected;
    } catch (err) {
      console.error('Error checking Notion connection:', err);
      setIsNotionConnected(false);
      setCheckingConnection(false);
      return false;
    }
  };

  // Check connection when firebase token becomes available
  useEffect(() => {
    if (firebaseToken) {
      checkNotionConnection();
    }
  }, [firebaseToken]);

  // Listen for sync progress updates from background script
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type === 'SYNC_PROGRESS') {
        console.log('Received sync progress:', message.progress, message.message);
        setSyncProgress(message.progress);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  // Load candidate courses from Canvas
  const loadCandidates = React.useCallback(async () => {
    setCandidatesLoading(true);
    setCandidatesError(null);
    try {
      setCandidates(await canvasApi.listCandidateCourses());
    } catch (err) {
      setCandidatesError(err instanceof Error ? err.message : 'Failed to load classes');
    } finally {
      setCandidatesLoading(false);
    }
  }, []);

  useEffect(() => { loadCandidates(); }, [loadCandidates]);

  // Load per-page course selection from storage
  useEffect(() => {
    chrome.storage.local.get(['selectedCoursesByPage'], (result) => {
      const map = (result.selectedCoursesByPage || {}) as Record<string, number[]>;
      setSelectedCourseIds(map[selectedPage.id] ?? []);
    });
    // opportunistically drop the orphaned term key
    chrome.storage.local.remove(['selectedTerm']);
  }, [selectedPage?.id]);

  // Handle course selection toggle
  const handleToggleCourse = (id: number) => {
    setSelectedCourseIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      chrome.storage.local.get(['selectedCoursesByPage'], (result) => {
        const map = (result.selectedCoursesByPage || {}) as Record<string, number[]>;
        chrome.storage.local.set({
          selectedCoursesByPage: { ...map, [selectedPage.id]: next },
        });
      });
      return next;
    });
    setUnsyncedItems([]);
  };

  const selectedCourses: SelectedCourse[] = candidates
    .filter((c) => selectedCourseIds.includes(c.id))
    .map((c) => ({ id: c.id, name: c.name, code: c.code }));

  // New function to compare Canvas assignments with Notion
  const compareWithNotion = async (): Promise<number> => {
    if (!selectedPage || !firebaseToken || selectedCourses.length === 0) {
      setUnsyncedItems([]);
      return 0;
    }

    try {
      setIsComparing(true);

      // Prepare compare data
      const compareData = { pageId: selectedPage.id, courses: selectedCourses };

      console.log('Sending COMPARE message with data:', compareData);
      
      // Send the compare request to background script
      const response = await chrome.runtime.sendMessage({
        type: 'COMPARE',
        data: compareData
      });
      
      console.log('Compare response:', response);
      
      if (response && response.success && response.data) {
        // Check if we have a compareResult with the comparison data
        if (response.data.compareResult?.comparison) {
          // The compareResult structure has a comparison object with course names as keys
          // Each course has an onlyInCanvas array that contains assignments to sync
          const unsyncedAssignments: any[] = [];
          
          // Iterate through each course in the comparison object
          Object.keys(response.data.compareResult.comparison).forEach(courseName => {
            const courseData = response.data.compareResult.comparison[courseName];
            
            // Add all assignments from onlyInCanvas array
            if (courseData.onlyInCanvas && courseData.onlyInCanvas.length > 0) {
              unsyncedAssignments.push(...courseData.onlyInCanvas);
            }
          });
          
          console.log('Extracted unsynced assignments:', unsyncedAssignments);
          
          if (unsyncedAssignments.length > 0) {
            // Transform the unsynced assignments
            const formattedUnsyncedItems = transformCanvasAssignments(
              unsyncedAssignments,
              response.data.courses || []
            );

            console.log('Formatted unsynced items:', formattedUnsyncedItems);
            setUnsyncedItems(formattedUnsyncedItems);
            // Any comparison that still finds items to sync clears the sync
            // status message. It's misleading to show "Sync completed
            // successfully" above a non-empty list, and (Chrome caps the
            // popup at 600px) that extra line pushes the Sync button
            // off-screen. The message only stays when a comparison after a
            // sync comes back empty.
            setSyncStatus(null);
            return formattedUnsyncedItems.length;
          } else {
            console.log('No unsynced assignments found in compareResult');
            setUnsyncedItems([]);
            return 0;
          }
        } else {
          console.log('No comparison data found in compareResult');
          setUnsyncedItems([]);
          return 0;
        }
      } else {
        console.error('Compare failed or returned invalid data:', response);
        setUnsyncedItems([]);
        return 0;
      }
    } catch (error) {
      console.error('Error comparing with Notion:', error);
      setUnsyncedItems([]);
      return 0;
    } finally {
      setIsComparing(false);
    }
  };

  const handleSync = async () => {
    if (!selectedPage || !firebaseToken) {
      console.log('Sync button disabled because:', {
        hasSelectedPage: !!selectedPage,
        hasFirebaseToken: !!firebaseToken
      });
      setSyncStatus('error');
      console.error('Missing required data: page or authentication token');
      return;
    }

    if (selectedCourses.length === 0) return;

    try {
      setIsLoading(true);
      setSyncStatus(null);
      setSyncProgress(0);

      // Prepare sync data
      const syncData: SyncData = { pageId: selectedPage.id, courses: selectedCourses };

      // Update timestamp regardless of final status
      setLastSync(new Date().toLocaleString());

      // Use sync v2 for both development and production (synchronous chunked approach)
      console.log('Starting sync v2 with data:', syncData);
      
      const response = await chrome.runtime.sendMessage({
        type: 'SYNC_TO_NOTION_V2',
        data: syncData
      });
      
      console.log('Sync v2 response:', response);
      
      if (response && response.error) {
        setSyncStatus('error');
        console.error('Sync error:', response.error);
        setIsLoading(false);
        return;
      }
      
      if (response && response.success) {
        const syncResult = response.data?.syncResult;
        
        // Determine status based on results
        if (syncResult?.errors && syncResult.errors.length > 0 && syncResult.totalCreated === 0) {
          setSyncStatus('error');
          console.error('Sync failed with errors:', syncResult.errors);
        } else if (syncResult?.errors && syncResult.errors.length > 0) {
          setSyncStatus('partial');
          console.warn('Sync completed with some errors:', syncResult.errors);
        } else {
          setSyncStatus('success');
          console.log('Sync completed successfully');
        }
        
        // Refresh the unsynced items list. compareWithNotion() clears the
        // sync status message if it still finds items to sync, so "Sync
        // completed successfully" only remains when everything synced.
        try {
          await compareWithNotion();
        } catch (compareError) {
          console.error('Error refreshing unsynced items:', compareError);
        }
      } else {
        setSyncStatus('error');
        console.error('Sync failed:', response);
      }
      
      setIsLoading(false);
      setSyncProgress(100);
    } catch (error) {
      console.error('Sync failed:', error);
      setSyncStatus('error');
      setIsLoading(false);
    }
  }

  const handleChangePageClick = () => {
    // Store the state in chrome.storage.local to trigger App component to show PageSelector
    chrome.storage.local.set({ selectedNotionPage: null, showPageSelector: true });
  }

  const handleNotionRetry = async (isAutoRetry = false) => {
    console.log(`${isAutoRetry ? 'Auto' : 'Manual'} retry: checking Notion connection`);
    await checkNotionConnection();
  }

  // Debug log for button disabled state
  const buttonDisabled = isLoading || !selectedPage || !firebaseToken || isNotionConnected !== true || selectedCourses.length === 0 || candidatesLoading;
  console.log('Sync button state:', {
    isLoading,
    hasSelectedPage: !!selectedPage,
    hasFirebaseToken: !!firebaseToken,
    isNotionConnected,
    isDisabled: buttonDisabled
  });

  // Show loading state while checking connection (matching PageSelector logic)
  if (checkingConnection || (firebaseToken && isNotionConnected === null)) {
    return (
      <div className={styles.container}>
        <AppBar />
        {particles}
        <div className={styles.content}>
          <div className={styles.loadingContainer}>
            <div className={styles.loadingSpinner}></div>
            <p className={styles.loadingText}>
              {!firebaseToken ? 'Checking authentication...' : 'Checking Notion connection...'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show NotionDisconnected if not connected
  if (isNotionConnected === false) {
    return (
      <div className={styles.container}>
        <AppBar />
        {particles}
        <div className={styles.content}>
          <NotionDisconnected onRetry={handleNotionRetry} />
        </div>
      </div>
    );
  }

  // Show main dashboard if connected
  return (
    <div className={styles.container}>
      <AppBar />
      {particles}

      <div className={`${styles.content} ${styles.fadeIn}`}>
        <PageSelectionContainer 
          selectedPage={selectedPage}
          onPageSelect={handleChangePageClick}
          onChangePage={handleChangePageClick}
        />

        {/* Class Selector Section */}
        <ClassSelector
          candidates={candidates}
          loading={candidatesLoading}
          error={candidatesError}
          selectedIds={selectedCourseIds}
          expanded={classPanelExpanded}
          onToggleExpanded={() => setClassPanelExpanded((v) => !v)}
          onToggleCourse={handleToggleCourse}
          onRetry={loadCandidates}
        />

        {/* Unsynced Items Section */}
        {selectedPage && firebaseToken && (
          <UnsyncedContainer 
            unsyncedItems={unsyncedItems}
            onClearItems={() => setUnsyncedItems([])}
            isLoading={isComparing}
          />
        )}

        <SyncButton 
          onSync={handleSync}
          isLoading={isLoading}
          disabled={buttonDisabled}
          lastSync={lastSync}
          syncStatus={syncStatus}
          progress={syncProgress}
        />
      </div>
    </div>
  )
}

export default Dashboard 