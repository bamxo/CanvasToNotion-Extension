import { getAuth } from '../services/chrome-auth.service';
import { configService } from '../services/config';

// Use Chrome Identity API instead of Firebase Auth
const auth = getAuth();

// Function to check for authentication via cookie
async function checkAuthCookie() {
  // Only run in production mode (not in development)
  if (import.meta.env.MODE === 'production') {
    console.log('Checking for authentication cookie in production mode...');
    try {
      const cookieUrl = await configService.getCookieUrl();
      const cookie = await chrome.cookies.get({
        name: 'authToken',
        url: cookieUrl
      });
      
      if (cookie && cookie.value) {
        console.log('Found authentication cookie with length:', cookie.value.length);
        
        // Use the cookie value as the auth token, ensuring it's properly formatted
        let token = cookie.value;
        
        // Check if the token needs decoding (if it's URL encoded)
        if (token.includes('%')) {
          try {
            token = decodeURIComponent(token);
            console.log('Decoded URL-encoded token');
          } catch (decodeError) {
            console.error('Error decoding token:', decodeError);
            // Continue with the original token
          }
        }
        
        // Remove any quotes if they were added during cookie storage
        token = token.replace(/^["'](.*)["']$/, '$1');
        
        console.log('Token prepared for authentication, first/last 10 chars:', 
          token.substring(0, 10) + '...' + token.substring(token.length - 10));
        
        // Store the token securely
        await chrome.storage.local.set({ 
          authToken: token,
          tokenTimestamp: Date.now()
        });
        
        // Try to get user info from the token
        try {
          // Decode JWT token to get user info (assuming it's a JWT)
          const tokenParts = token.split('.');
          if (tokenParts.length === 3) {
            try {
              const payload = JSON.parse(atob(tokenParts[1]));
              
              // Extract user information from token payload
              const userInfo = {
                displayName: payload.name || payload.display_name || 'Canvas User',
                email: payload.email || configService.getDefaultEmail(),
                photoURL: payload.picture || payload.avatar_url || undefined,
                uid: payload.sub || payload.user_id || 'direct-token-auth'
              };
              
              console.log('Extracted user info from token:', userInfo);
              
              // Store user info and set authentication state
              await chrome.storage.local.set({
                authToken: token,
                tokenTimestamp: Date.now(),
                // Set these values to trigger the app to think we're authenticated
                canvasToken: 'direct-token-auth',
                userEmail: userInfo.email,
                userId: userInfo.uid,
                // Store proper user info for profile display
                userInfo: userInfo
              });
              
              console.log('Stored user profile information:', userInfo);
              
              // Notify the popup about successful authentication
              chrome.runtime.sendMessage({ type: 'LOGIN_SUCCESS' });
              console.log('Stored token directly for API use with user profile info');
              return true;
            } catch (decodeError) {
              console.error('Error extracting user info from token:', decodeError);
              
              // Fallback to generic user info
              const userInfo = {
                displayName: 'Canvas User',
                email: configService.getDefaultEmail(),
                photoURL: undefined
              };
              
              // Store token with generic user info
              await chrome.storage.local.set({
                authToken: token,
                tokenTimestamp: Date.now(),
                canvasToken: 'direct-token-auth',
                userEmail: userInfo.email,
                userId: 'direct-token-auth',
                userInfo: userInfo
              });
              
              // Notify the popup about successful authentication
              chrome.runtime.sendMessage({ type: 'LOGIN_SUCCESS' });
              console.log('Stored token directly for API use with generic user info');
              return true;
            }
          }
        } catch (error) {
          console.error('Error processing authentication token:', error);
        }
      } else {
        console.log('No authentication cookie found');
        
        // Check if user is currently signed in
        const user = auth.currentUser;
        const { userId } = await chrome.storage.local.get(['userId']);
        
        if (user || userId) {
          console.log('User is signed in but cookie is missing, signing out...');
          // Sign out from auth
          await auth.signOut();
          
          // Clear storage
          await chrome.storage.local.remove([
            'authToken',
            'tokenTimestamp',
            'userEmail',
            'userId',
            'canvasToken',
            'userInfo'
          ]);
          
          // Notify popup
          chrome.runtime.sendMessage({ type: 'LOGOUT_SUCCESS' });
          console.log('Successfully logged out user due to missing auth cookie');
        }
      }
    } catch (error) {
      console.error('Error checking authentication cookie:', error);
    }
  } else {
    console.log('Development mode: skipping cookie authentication check');
  }
}

// Check authentication when background script loads
checkAuthCookie();

// Check for authentication via user data fetch
chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {
    // Only handle CHECK_AUTH messages in this listener
    if (message.type !== 'CHECK_AUTH') {
      // Return false to let other listeners handle this message
      return false;
    }
    
    console.log('Processing CHECK_AUTH request...');
    
    // Handle async operations
    (async () => {
      try {
        // In production, check for cookie authentication
        if (import.meta.env.MODE === 'production') {
          await checkAuthCookie();
        }
        
        // Check storage for existing authentication
        const { authToken, userId, userEmail } = await chrome.storage.local.get([
          'authToken', 'userId', 'userEmail'
        ]);
        
        const isAuthenticated = !!(authToken || userId);
        console.log('Auth check result:', { isAuthenticated, hasToken: !!authToken, hasUserId: !!userId });
        
        sendResponse({ isAuthenticated });
      } catch (error) {
        console.error('Error in CHECK_AUTH:', error);
        sendResponse({ isAuthenticated: false });
      }
    })();
    
    return true; // Keep message channel open for async response
  }
);

// Listen for external messages from the web app
chrome.runtime.onMessageExternal.addListener(
  async (message, sender, sendResponse) => {
    console.log('Received external message:', {
      type: message.type,
      sender: sender.origin,
      hasToken: !!message.token
    });
    
    if (message.type === 'AUTH_TOKEN') {
      try {
        const { token } = message;
        console.log('Processing AUTH_TOKEN message...');
        
        // Store the token securely
        console.log('Storing token in chrome.storage.local...');
        await chrome.storage.local.set({ 
          authToken: token,
          tokenTimestamp: Date.now()
        });
        console.log('Token stored successfully');

        // Get user info from the token if possible
        try {
          const tokenParts = token.split('.');
          if (tokenParts.length === 3) {
            const payload = JSON.parse(atob(tokenParts[1]));
            const userInfo = {
              displayName: payload.name || 'Canvas User',
              email: payload.email || configService.getDefaultEmail(),
              uid: payload.sub || payload.user_id || 'external-token-auth'
            };
            
            // Store user info
            console.log('Storing user info in chrome.storage.local...');
            await chrome.storage.local.set({
              userEmail: userInfo.email,
              userId: userInfo.uid,
              canvasToken: userInfo.uid,
              userInfo: userInfo
            });
            console.log('User info stored successfully');
          }
        } catch (error) {
          console.warn('Could not extract user info from token, using defaults:', error);
          await chrome.storage.local.set({
            userEmail: configService.getDefaultEmail(),
            userId: 'external-token-auth',
            canvasToken: 'external-token-auth'
          });
        }

        // Notify the popup about successful authentication
        console.log('Sending LOGIN_SUCCESS message to popup...');
        chrome.runtime.sendMessage({ type: 'LOGIN_SUCCESS' }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error sending LOGIN_SUCCESS message:', chrome.runtime.lastError);
          } else {
            console.log('LOGIN_SUCCESS message sent successfully');
          }
        });

        sendResponse({ success: true });
      } catch (error) {
        console.error('Error processing AUTH_TOKEN:', error);
        sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
      }
      return true; // Keep message channel open for async response
    }
  }
);

// Set up token refresh listener - compatible with Chrome Identity API
setInterval(async () => {
  try {
    const { authToken, tokenTimestamp } = await chrome.storage.local.get(['authToken', 'tokenTimestamp']);
    
    if (authToken && tokenTimestamp) {
      const tokenAge = Date.now() - tokenTimestamp;
      // Refresh token if it's older than 50 minutes (3000000 ms)
      if (tokenAge > 3000000) {
        console.log('Token is old, attempting refresh...');
        
        // Try to refresh using Chrome Identity API
        try {
          const result = await chrome.identity.getAuthToken({ interactive: false });
          if (result.token) {
            await chrome.storage.local.set({
              authToken: result.token,
              tokenTimestamp: Date.now()
            });
            console.log('Token refreshed successfully');
          }
        } catch (error) {
          console.warn('Token refresh failed:', error);
        }
      }
    }
  } catch (error) {
    console.error('Error in token refresh:', error);
  }
}, 60000); // Check every minute

console.log('Background auth script initialized with Chrome Identity API'); 