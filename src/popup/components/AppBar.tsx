import React, { useState, useEffect } from 'react'
import styles from './AppBar.module.css'
import defaultProfile from '../../assets/default.svg'
import settingIcon from '../../assets/setting.svg'
import logoutIcon from '../../assets/logout.svg'
import { configService } from '../../services/config'
import { getAuth } from '../../services/chrome-auth.service'

interface UserInfo {
  displayName: string;
  email: string;
  photoURL?: string;
  photoUrl?: string;
  extensionId?: string;
}

const AppBar = () => {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  useEffect(() => {
    const auth = getAuth();
    
    // Set up auth state listener
    const unsubscribe = auth.onIdTokenChanged(async (user) => {
      if (user?.email) {
        setUserEmail(user.email);
        setIsAuthenticated(true);
        // Store email in chrome storage when we get it from auth
        await chrome.storage.local.set({ userEmail: user.email });
        
        // Store user info if available
        if (user.displayName || user.photoURL) {
          const userInfoData: UserInfo = {
            displayName: user.displayName || user.email.split('@')[0],
            email: user.email,
            photoURL: user.photoURL || undefined
          };
          setUserInfo(userInfoData);
          await chrome.storage.local.set({ userInfo: userInfoData });
        }
      } else {
        // If we don't have a user email from auth state, try to get it from storage
        chrome.storage.local.get(['userEmail', 'userInfo'], (result) => {
          if (result.userEmail) {
            setUserEmail(result.userEmail);
            setIsAuthenticated(true);
            
            if (result.userInfo) {
              setUserInfo(result.userInfo);
            }
          } else {
            setUserEmail(null);
            setIsAuthenticated(false);
            setUserInfo(null);
          }
        });
      }
    });

    // Listen for external messages from the web app
    const handleExternalMessage = (message: any, _: any, sendResponse: any) => {
      console.log('Received external message:', message);
      if (message.type === 'LOGOUT') {
        console.log('Received logout message from web app');
        handleLogout();
        sendResponse({ success: true });
      } else if (message.type === 'UPDATE_USER_INFO' && message.data) {
        setUserInfo(message.data);
        chrome.storage.local.set({ userInfo: message.data });
        sendResponse({ success: true });
      }
      return true; // Keep the message channel open for async response
    };

    chrome.runtime.onMessageExternal.addListener(handleExternalMessage);

    // Cleanup listeners
    return () => {
      unsubscribe();
      chrome.runtime.onMessageExternal.removeListener(handleExternalMessage);
    };
  }, []);

  const handleLogout = async () => {
    console.log('Attempting to logout...');
    try {
      const auth = getAuth();
      await auth.signOut();
      
      // Call the logout API endpoints
      try {
        const logoutUrl = await configService.getLogoutApiUrl();
        await fetch(logoutUrl, {
          method: 'POST',
          credentials: 'include'
        });
        
        // Call the additional cookie state clear endpoint in production
        if (!configService.isDevelopment()) {
          const clearAuthUrl = await configService.getClearAuthUrl();
          await fetch(clearAuthUrl, {
            method: 'POST',
            credentials: 'include'
          });
        }
        
        console.log('Logout API calls completed');
      } catch (apiError) {
        console.error('Error calling logout API:', apiError);
        // Continue with logout process even if API calls fail
      }
      
      // Clear storage
      await chrome.storage.local.remove([
        'isGuestMode',
        'canvasToken',
        'selectedPage',
        'userEmail',
        'authToken',
        'firebaseToken',
        'tokenTimestamp',
        'userId',
        'userInfo'
      ]);
      
      console.log('Logout completed successfully');
      // Force reload the popup window
      window.location.reload();
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  const handleSettings = async () => {
    try {
      // Determine the settings URL based on environment
      const webAppBaseUrl = await configService.getWebAppBaseUrl();
        
      // Open the settings page in a new tab
      chrome.tabs.create({ url: `${webAppBaseUrl}/settings` })
      window.close() // Close the popup after redirecting
    } catch (err) {
      console.error(err)
    }
  };

  // Get the profile image URL - check both photoURL and photoUrl for compatibility
  const getProfileImage = () => {
    if (userInfo?.photoURL) {
      return userInfo.photoURL;
    } else if (userInfo?.photoUrl) {
      return userInfo.photoUrl;
    }
    return defaultProfile;
  };

  return (
    <div className={styles.appBar}>
      <div className={styles.userInfo}>
        <img 
          src={getProfileImage()} 
          alt={isAuthenticated ? "User Profile" : "Guest Profile"} 
          className={styles.profileImage}
          onError={(e) => {
            // Fallback to default profile if image fails to load
            (e.target as HTMLImageElement).src = defaultProfile;
          }}
        />
        <div className={styles.userText}>
          <div className={styles.userName}>
            {userInfo?.displayName || (isAuthenticated ? userEmail?.split('@')[0] : 'Guest')}
          </div>
          <div className={styles.userStatus}>
            {isAuthenticated ? 'Signed In' : 'Not Signed In'}
          </div>
        </div>
      </div>
      <div className={styles.actions}>
        <button className={styles.iconButton} onClick={handleSettings}>
          <img src={settingIcon} alt="Settings" />
        </button>
        <button className={styles.iconButton} onClick={handleLogout}>
          <img src={logoutIcon} alt="Logout" />
        </button>
      </div>
    </div>
  )
}

export default AppBar 