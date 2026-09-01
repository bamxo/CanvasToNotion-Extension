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
import TermSelector from './TermSelector'
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
  termSystem?: 'quarter' | 'semester';
}

interface DashboardProps {
  selectedPage: NotionPage;
}

interface Assignment {
  id: string;
  name: string;
  courseId: string;
  due_at: string;
  points_possible: number;
  html_url: string;
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
  const [selectedTerm, setSelectedTerm] = useState<'quarter' | 'semester'>('semester')

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

  // Trigger comparison when page is selected, authentication is available, Notion is connected, or term changes
  useEffect(() => {
    if (selectedPage && firebaseToken && isNotionConnected === true) {
      compareWithNotion();
    }
  }, [selectedPage, firebaseToken, isNotionConnected, selectedTerm]);

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

  // Load selected term from storage on component mount
  useEffect(() => {
    chrome.storage.local.get(['selectedTerm'], (result) => {
      if (result.selectedTerm) {
        setSelectedTerm(result.selectedTerm);
      }
    });
  }, []);

  // Handle term selection change
  const handleTermChange = (term: 'quarter' | 'semester') => {
    setSelectedTerm(term);
    // Save to chrome storage
    chrome.storage.local.set({ selectedTerm: term });
    
    // Clear current unsynced items to show loading state
    setUnsyncedItems([]);
    
    console.log(`Term system changed to: ${term}`);
  };

  // New function to compare Canvas assignments with Notion
  const compareWithNotion = async (): Promise<number> => {
    if (!selectedPage || !firebaseToken) {
      console.log('Cannot compare: missing page or auth token');
      return 0;
    }
    
    try {
      setIsComparing(true);
      
      // Prepare compare data
      const compareData = {
        pageId: selectedPage.id,
        termSystem: selectedTerm,
      };

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

    try {
      setIsLoading(true);
      setSyncStatus(null);
      setSyncProgress(0);
      
      // Prepare sync data
      const syncData: SyncData = {
        pageId: selectedPage.id,
        termSystem: selectedTerm,
      };

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
        
        // Refresh the unsynced items list
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
  const buttonDisabled = isLoading || !selectedPage || !firebaseToken || isNotionConnected !== true;
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

        {/* Term Selector Section */}
        <TermSelector 
          selectedTerm={selectedTerm}
          onTermChange={handleTermChange}
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