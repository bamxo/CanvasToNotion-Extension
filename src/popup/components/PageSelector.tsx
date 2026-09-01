import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { getAuth, AuthUser } from '../../services/chrome-auth.service';
import styles from './PageSelector.module.css';
import AppBar from './AppBar';
import NotionDisconnected from './NotionDisconnected';
import DefaultPageView from './DefaultPageView';
import { ENDPOINTS } from '../../services/api.config';

interface NotionPage {
  id: string;
  title: string;
  icon?: string;
  type?: string;
}

interface PageSelectorProps {
  onPageSelect: (page: NotionPage) => void;
}

// Cache for storing pages data
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes in milliseconds
const pagesCache = {
  data: null as NotionPage[] | null,
  timestamp: 0,
  isValid: function() {
    return this.data && (Date.now() - this.timestamp < CACHE_EXPIRY);
  }
};

// Particle component
const Particle = ({ delay }: { delay: number }) => {
  const style = {
    left: `${Math.random() * 100}%`,
    animation: `${styles.floatParticle} 6s ease-in infinite`,
    animationDelay: `${delay}s`
  };

  return <div className={styles.particle} style={style} />;
};

const PageSelector: React.FC<PageSelectorProps> = ({ onPageSelect }) => {
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [isLoading, setIsLoading] = useState(true); // Start with loading state
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [autoRetryCount, setAutoRetryCount] = useState(0);
  const [isNotionConnected, setIsNotionConnected] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [firebaseToken, setFirebaseToken] = useState<string | null>(null);
  const maxAutoRetries = 3;
  const autoRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  console.log("Component render state:", { isLoading, isNotionConnected, userEmail });

  // Set up auth state listener to get user email and firebase token
  useEffect(() => {
    console.log("Setting up auth state listener");
    const auth = getAuth();
    
    const unsubscribe = auth.onIdTokenChanged((user: AuthUser | null) => {
      console.log('Auth state changed:', user?.email);
      if (user?.email) {
        setUserEmail(user.email);
        // Fetch user token for API calls
        user.getIdToken().then((token: string) => {
          console.log('Token retrieved for API calls');
          setFirebaseToken(token);
          // Store token for component compatibility
          chrome.storage.local.set({ firebaseToken: token });
        }).catch((error: Error) => {
          console.error('Error getting user token:', error);
        });
      } else {
        // If we don't have a user from auth state, try to get from storage
        chrome.storage.local.get(['userEmail', 'firebaseToken', 'authToken'], (result) => {
          if (result.userEmail) {
            console.log('Retrieved email from storage:', result.userEmail);
            setUserEmail(result.userEmail);
          }
          
          const storedToken = result.firebaseToken || result.authToken;
          if (storedToken) {
            console.log('Retrieved auth token from storage');
            setFirebaseToken(storedToken);
          }
          
          if (!result.userEmail || !storedToken) {
            console.log('Missing authentication data in storage');
            setError('User not authenticated. Please sign in first.');
            setIsLoading(false);
          }
        });
      }
    });
    
    // Cleanup auth listener
    return () => unsubscribe();
  }, []);

  // Trigger connection check when auth info becomes available
  useEffect(() => {
    if (userEmail && firebaseToken) {
      console.log(`Authentication info available, checking connection...`);
      fetchPages(true);
    }
  }, [userEmail, firebaseToken]);

  const checkNotionConnection = async () => {
    try {
      if (!firebaseToken) {
        console.log('Waiting for firebase token...');
        return false;
      }

      console.log('Checking Notion connection');
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
      return isConnected;
    } catch (err) {
      console.error('Error checking Notion connection:', err);
      setIsNotionConnected(false);
      return false;
    }
  };

  // Separate function to fetch pages, without connection check
  const loadPages = async (forceRefresh = false) => {
    // Return cached data if valid and not forcing refresh
    if (!forceRefresh && pagesCache.isValid()) {
      setPages(pagesCache.data as NotionPage[]);
      setIsLoading(false);
      return;
    }
    
    // Cancel previous request if it exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();
    
    try {
      setIsLoading(true);
      setError(null);
      
      if (!firebaseToken) {
        throw new Error('Firebase token not found');
      }

      const pagesEndpoint = await ENDPOINTS.PAGES();
      const response = await axios.get(pagesEndpoint, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${firebaseToken}`
        },
        signal: abortControllerRef.current.signal,
        timeout: 5000 // Add timeout to prevent hanging requests
      });

      // Update cache
      pagesCache.data = response.data.pages;
      pagesCache.timestamp = Date.now();
      
      setPages(response.data.pages);
      setAutoRetryCount(0); // Reset retry count on success
    } catch (err: any) {
      // Don't show error if request was aborted intentionally
      if (axios.isCancel(err)) {
        console.log('Request canceled:', err.message);
        return;
      }
      
      console.error('Error fetching pages:', err);
      setError('Failed to load pages. Please try again later.');
      
      // Schedule auto retry if we haven't exceeded max attempts
      if (autoRetryCount < maxAutoRetries) {
        const retryDelay = Math.min(500 * (autoRetryCount + 1), 2000); // Exponential backoff with cap
        console.log(`Auto-retrying in ${retryDelay}ms (attempt ${autoRetryCount + 1}/${maxAutoRetries})`);
        
        if (autoRetryTimeoutRef.current) {
          clearTimeout(autoRetryTimeoutRef.current);
        }
        
        autoRetryTimeoutRef.current = setTimeout(() => {
          setAutoRetryCount(prev => prev + 1);
          setRefreshKey(prevKey => prevKey + 1);
        }, retryDelay);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Main function that handles both connection check and page fetching
  const fetchPages = async (forceRefresh = false) => {
    try {
      setIsLoading(true);
      console.log("Fetching pages - checking connection first...");
      const connected = await checkNotionConnection();
      console.log("Connection check result:", connected);
      
      if (connected) {
        console.log("Connected to Notion, loading pages...");
        await loadPages(forceRefresh);
      } else {
        console.log("Not connected to Notion, stopping page load");
        setIsLoading(false);
      }
    } catch (err) {
      console.error("Error in fetchPages:", err);
      setIsLoading(false);
    }
  };

  // Initialize on mount - this ensures we check connection on startup
  useEffect(() => {
    console.log("PageSelector mounted - waiting for user email before checking connection");
    // We'll trigger fetchPages when userEmail becomes available
    
    return () => {
      if (autoRetryTimeoutRef.current) {
        clearTimeout(autoRetryTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []); // Empty dependency array ensures this only runs once on mount

  // Handle refreshKey changes separately from initial mount
  useEffect(() => {
    if (refreshKey > 0) { // Skip on initial mount (refreshKey = 0)
      console.log(`RefreshKey changed: ${refreshKey} - retrying connection check`);
      fetchPages(true);
    }
  }, [refreshKey]);

  const handleRetry = (isAutoRetry = false) => {
    console.log(`${isAutoRetry ? 'Auto' : 'Manual'} retry: checking connection and fetching pages`);
    
    // For manual retries, we want to reset everything
    if (!isAutoRetry) {
      setAutoRetryCount(0);
      setError(null);
      setIsNotionConnected(null);
      setPages([]);
    }
    
    // Force refresh
    setRefreshKey(prevKey => prevKey + 1);
  };

  const handlePageSelect = (page: NotionPage) => {
    onPageSelect(page);
  };

  // Generate array of particles - only create particles when component mounts
  const particles = useRef(
    Array.from({ length: 20 }, (_, i) => (
      <Particle key={i} delay={i * 0.3} />
    ))
  ).current;

  // For debugging
  useEffect(() => {
    console.log("Current state:", { 
      isLoading, 
      isNotionConnected,
      userEmail,
      pagesCount: pages.length,
      error
    });
  }, [isLoading, isNotionConnected, userEmail, pages, error]);

  // When we're waiting for authentication or still loading
  if (isLoading && (userEmail === null || isNotionConnected === null)) {
    return (
      <div className={styles.container}>
        <AppBar />
        {particles}
        <div className={styles.content}>
          <div className={styles.loadingContainer}>
            <div className={styles.loadingSpinner}></div>
            <p className={styles.loadingText}>
              {!userEmail ? 'Checking authentication...' : 'Checking Notion connection...'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Continue with flow even if user is not authenticated
  if (!userEmail && !isLoading) {
    return (
      <div className={styles.container}>
        <AppBar />
        {particles}
        <div className={styles.content}>
          <DefaultPageView 
            pages={pages}
            isLoading={isLoading}
            onPageSelect={handlePageSelect}
          />
        </div>
      </div>
    );
  }

  // When we know Notion is not connected
  if (isNotionConnected === false) {
    return (
      <div className={styles.container}>
        <AppBar />
        {particles}
        <div className={styles.content}>
          <NotionDisconnected onRetry={handleRetry} />
        </div>
      </div>
    );
  }

  // When there's an error loading pages (but we're connected)
  if (error) {
    return (
      <div className={styles.container}>
        <AppBar />
        {particles}
        <div className={styles.content}>
          <div className={styles.errorContainer}>
            <p className={styles.errorText}>{error}</p>
            <p className={styles.retryText}>
              {autoRetryCount < maxAutoRetries 
                ? `Retrying automatically... (${autoRetryCount + 1}/${maxAutoRetries})` 
                : "Automatic retries exhausted."}
            </p>
            <button 
              className={styles.retryButton}
              onClick={() => handleRetry(false)}
            >
              Retry Now
            </button>
          </div>
        </div>
      </div>
    );
  }

  // When we're connected but still loading pages
  if (isLoading && isNotionConnected === true) {
    return (
      <div className={styles.container}>
        <AppBar />
        {particles}
        <div className={styles.content}>
          <div className={styles.loadingContainer}>
            <div className={styles.loadingSpinner}></div>
            <p className={styles.loadingText}>Loading your Notion pages...</p>
          </div>
        </div>
      </div>
    );
  }

  // Default view: Connected with pages loaded
  return (
    <div className={styles.container}>
      <AppBar />
      {particles}
      
      <div className={styles.content}>
        <DefaultPageView 
          pages={pages}
          isLoading={isLoading}
          onPageSelect={handlePageSelect}
        />
      </div>
    </div>
  );
};

export default PageSelector; 