import { useState, useEffect } from 'react'
import './App.css'
import LoginRedirect from './popup/components/LoginRedirect'
import Dashboard from './popup/components/Dashboard'
import PageSelector from './popup/components/PageSelector'
import CanvasRequired from './popup/components/CanvasRequired'
import { getCurrentCanvasInfo, CanvasInfo } from './services/canvas/detection'

interface NotionPage {
  id: string;
  title: string;
  icon?: string;
  type?: string;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [isCanvasPage, setIsCanvasPage] = useState(false)
  const [_, setCanvasInfo] = useState<CanvasInfo | null>(null)
  const [selectedPage, setSelectedPage] = useState<NotionPage | null>(null)
  const [showPageSelector, setShowPageSelector] = useState(false)

  useEffect(() => {
    // Create a connection to the background script in production
    let port: chrome.runtime.Port | null = null;
    
    if (import.meta.env.MODE === 'production') {
      port = chrome.runtime.connect({ name: 'popup' });
      
      port.onMessage.addListener((message) => {
        console.log('Received message from background script:', message);
        if (message.type === 'COOKIE_AUTH_SUCCESS') {
          console.log('Authenticated via cookie through port connection');
          setIsAuthenticated(true);
          setCheckingAuth(false);
        }
      });
    }

    // Check if current page is Canvas using improved detection
    const checkCanvasPage = async () => {
      try {
        const canvasInfo = await getCurrentCanvasInfo();
        console.log('Canvas detection result:', canvasInfo);
        setIsCanvasPage(canvasInfo.isCanvas);
        setCanvasInfo(canvasInfo);
        
        // Store Canvas info if detected
        if (canvasInfo.isCanvas) {
          chrome.storage.local.set({ 
            canvasInfo: canvasInfo,
            canvasBaseUrl: canvasInfo.apiUrl 
          });
        }
      } catch (error) {
        console.error('Error detecting Canvas page:', error);
        setIsCanvasPage(false);
        setCanvasInfo(null);
      }
    };
    
    checkCanvasPage();

    // In production, check for cookie authentication first
    if (import.meta.env.MODE === 'production') {
      console.log('Production mode detected, checking for cookie auth...');
      chrome.runtime.sendMessage({ type: 'CHECK_AUTH' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error checking auth:', chrome.runtime.lastError);
        } else if (response && response.isAuthenticated) {
          console.log('Authenticated via cookie');
          setIsAuthenticated(true);
          setCheckingAuth(false);
          return;
        }
        
        // Continue with normal auth check if cookie auth failed
        checkInitialAuthState();
      });
    } else {
      // In development, just check storage
      checkInitialAuthState();
    }

    // Listen for storage changes
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      console.log('Storage changes:', changes);
      if (changes.canvasToken) {
        setIsAuthenticated(!!changes.canvasToken.newValue);
      }
      if (changes.selectedNotionPage) {
        setSelectedPage(changes.selectedNotionPage.newValue || null);
      }
      if (changes.showPageSelector) {
        setShowPageSelector(!!changes.showPageSelector.newValue);
      }
    };

    // Listen for auth state changes via messages
    const messageListener = (message: any) => {
      console.log('Received message in App:', message);
      if (message.type === 'LOGIN_SUCCESS') {
        console.log('Setting authenticated to true');
        setIsAuthenticated(true);
      } else if (message.type === 'LOGOUT_SUCCESS' || message.type === 'LOGOUT') {
        console.log('Logout message received, resetting state...');
        setIsAuthenticated(false);
        setSelectedPage(null);
        setShowPageSelector(false);
      }
    };

    // Add listeners
    console.log('Setting up listeners...');
    chrome.storage.onChanged.addListener(handleStorageChange);
    chrome.runtime.onMessage.addListener(messageListener);

    // Cleanup listeners on unmount
    return () => {
      console.log('Cleaning up listeners...');
      chrome.storage.onChanged.removeListener(handleStorageChange);
      chrome.runtime.onMessage.removeListener(messageListener);
      
      // Disconnect port if it exists
      if (port) {
        port.disconnect();
      }
    };
  }, []);

  // Helper function to check initial auth state from storage
  const checkInitialAuthState = () => {
    chrome.storage.local.get(['canvasToken', 'selectedNotionPage', 'showPageSelector'], (result) => {
      console.log('Initial state from storage:', result);
      setIsAuthenticated(!!result.canvasToken);
      setSelectedPage(result.selectedNotionPage || null);
      setShowPageSelector(!!result.showPageSelector);
      setCheckingAuth(false);
    });
  };

  const handlePageSelect = (page: NotionPage) => {
    console.log('Page selected in App:', page);
    setSelectedPage(page);
    setShowPageSelector(false);
    // Store the selected page and hide page selector
    chrome.storage.local.set({ 
      selectedNotionPage: page, 
      showPageSelector: false 
    });
  };

  const handleCanvasRetry = async () => {
    try {
      const canvasInfo = await getCurrentCanvasInfo();
      console.log('Canvas retry result:', canvasInfo);
      setIsCanvasPage(canvasInfo.isCanvas);
      setCanvasInfo(canvasInfo);
      
      if (canvasInfo.isCanvas) {
        chrome.storage.local.set({ 
          canvasInfo: canvasInfo,
          canvasBaseUrl: canvasInfo.apiUrl 
        });
      }
    } catch (error) {
      console.error('Error retrying Canvas detection:', error);
      setIsCanvasPage(false);
      setCanvasInfo(null);
    }
  };

  if (checkingAuth) {
    return <div>Loading...</div>
  }

  const containerClasses = [
    'extension-container',
    isAuthenticated ? 'authenticated' : '',
  ].filter(Boolean).join(' ');

  // Determine container height based on state
  const containerStyle = {
    height: isAuthenticated ? 'auto' : !isCanvasPage ? '420px' : '388px',
    minHeight: isAuthenticated ? '388px' : undefined,
    // Let the popup size itself to its content (Chrome caps popups at 600px).
    overflow: isAuthenticated ? 'visible' : 'hidden',
    transition: 'height 0.3s ease'
  };

  console.log('Container style:', containerStyle);
  console.log('Is Canvas page (render):', isCanvasPage);
  console.log('App render state:', { 
    isAuthenticated, 
    selectedPage: selectedPage ? { id: selectedPage.id, title: selectedPage.title } : null, 
    showPageSelector 
  });

  return (
    <div className={containerClasses} style={containerStyle}>
      <div className="card">
        {!isAuthenticated ? (
          <LoginRedirect />
        ) : !isCanvasPage ? (
          <CanvasRequired onRetry={handleCanvasRetry} />
        ) : showPageSelector || !selectedPage ? (
          <PageSelector onPageSelect={handlePageSelect} />
        ) : (
          <Dashboard selectedPage={selectedPage} />
        )}
      </div>
    </div>
  )
}

export default App