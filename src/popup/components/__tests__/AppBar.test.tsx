import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as apiConfig from '../../../services/api.config';

// Keep the plan lookup off the network. Individual tests override the resolved
// value; by default it rejects so the status line stays on "Signed In".
const fetchEntitlements = vi.fn().mockRejectedValue(new Error('no entitlements'));
vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../../services/entitlements.service', () => ({
  fetchEntitlements: (...a: unknown[]) => fetchEntitlements(...a),
}));

// Mock Firebase auth using factory functions
vi.mock('firebase/auth', () => {
  const mockAuth = {
    signOut: vi.fn(),
  };
  
  const mockOnAuthStateChanged = vi.fn();
  
  return {
    getAuth: vi.fn(() => mockAuth),
    onAuthStateChanged: mockOnAuthStateChanged,
  };
});

// Mock assets
vi.mock('../../../assets/default.svg', () => ({
  default: 'mocked-default-profile.svg',
}));

vi.mock('../../../assets/setting.svg', () => ({
  default: 'mocked-setting-icon.svg',
}));

vi.mock('../../../assets/logout.svg', () => ({
  default: 'mocked-logout-icon.svg',
}));

// Mock CSS modules
vi.mock('../AppBar.module.css', () => ({
  default: {
    appBar: 'appBar',
    userInfo: 'userInfo',
    profileImage: 'profileImage',
    userText: 'userText',
    userName: 'userName',
    userStatus: 'userStatus',
    userStatusTier: 'userStatusTier',
    userStatusDot: 'userStatusDot',
    actions: 'actions',
    iconButton: 'iconButton',
  },
}));

// Import AppBar after mocks
import AppBar from '../AppBar';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

// Get the mocked functions
const mockGetAuth = vi.mocked(getAuth);
const mockOnAuthStateChanged = vi.mocked(onAuthStateChanged);

const mockUser = {
  email: 'test@example.com',
};

describe('AppBar Component', () => {
  let mockChromeStorage: any;
  let mockChromeRuntime: any;
  let mockChromeTabs: any;
  let mockAuth: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    fetchEntitlements.mockRejectedValue(new Error('no entitlements'));

    // Setup mock auth object
    mockAuth = {
      signOut: vi.fn(),
    };
    
    // Make getAuth return our mock auth
    mockGetAuth.mockReturnValue(mockAuth);
    
    // Mock Chrome storage
    mockChromeStorage = {
      local: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
      },
    };

    // Mock Chrome runtime
    mockChromeRuntime = {
      onMessageExternal: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    };

    // Mock Chrome tabs
    mockChromeTabs = {
      create: vi.fn(),
    };

    // Setup global chrome mock
    global.chrome = {
      storage: mockChromeStorage,
      runtime: mockChromeRuntime,
      tabs: mockChromeTabs,
    } as any;

    // Mock window.location.reload
    Object.defineProperty(window, 'location', {
      value: {
        reload: vi.fn(),
      },
      writable: true,
    });

    // Mock window.close
    global.window.close = vi.fn();

    // Mock console methods
    global.console.log = vi.fn();
    global.console.error = vi.fn();
  });

  describe('Authentication States', () => {
    it('should render guest state when user is not authenticated', async () => {
      // Setup: No authenticated user
      mockOnAuthStateChanged.mockImplementation((_auth: any, callback: any) => {
        callback(null); // No user
        return vi.fn(); // unsubscribe function
      });

      mockChromeStorage.local.get.mockImplementation((_keys: any, callback: any) => {
        callback({}); // No stored email
      });

      render(<AppBar />);

      await waitFor(() => {
        expect(screen.getByText('Guest')).toBeInTheDocument();
        expect(screen.getByText('Not Signed In')).toBeInTheDocument();
      });

      const profileImage = screen.getByAltText('Guest Profile');
      expect(profileImage).toBeInTheDocument();
      expect(profileImage).toHaveAttribute('src', 'mocked-default-profile.svg');
    });

    it('should render authenticated state when user is signed in', async () => {
      // Setup: Authenticated user
      mockOnAuthStateChanged.mockImplementation((_auth: any, callback: any) => {
        callback(mockUser);
        return vi.fn(); // unsubscribe function
      });

      render(<AppBar />);

      await waitFor(() => {
        expect(screen.getByText('test')).toBeInTheDocument(); // Username from email
        expect(screen.getByText('Signed In')).toBeInTheDocument();
      });

      const profileImage = screen.getByAltText('User Profile');
      expect(profileImage).toBeInTheDocument();
      expect(profileImage).toHaveAttribute('src', 'mocked-default-profile.svg');
    });

    it('should use stored email when auth state has no user but storage has email', async () => {
      // Setup: No auth user but stored email
      mockOnAuthStateChanged.mockImplementation((_auth: any, callback: any) => {
        callback(null);
        return vi.fn();
      });

      mockChromeStorage.local.get.mockImplementation((_keys: any, callback: any) => {
        callback({ userEmail: 'stored@example.com' });
      });

      render(<AppBar />);

      await waitFor(() => {
        expect(screen.getByText('stored')).toBeInTheDocument();
        expect(screen.getByText('Signed In')).toBeInTheDocument();
      });
    });

    it('should store email in chrome storage when user is authenticated', async () => {
      mockChromeStorage.local.set.mockResolvedValue(undefined);
      
      mockOnAuthStateChanged.mockImplementation((_auth: any, callback: any) => {
        callback(mockUser);
        return vi.fn();
      });

      render(<AppBar />);

      await waitFor(() => {
        expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
          userEmail: 'test@example.com',
        });
      });
    });

    it('should handle user with display name and photo URL', async () => {
      const userWithInfo = {
        email: 'user@example.com',
        displayName: 'Test User',
        photoURL: 'https://example.com/photo.jpg'
      };
      
      mockOnAuthStateChanged.mockImplementation((_auth: any, callback: any) => {
        callback(userWithInfo);
        return vi.fn();
      });

      render(<AppBar />);

      await waitFor(() => {
        expect(screen.getByText('Test User')).toBeInTheDocument();
        expect(screen.getByText('Signed In')).toBeInTheDocument();
      });

      const profileImage = screen.getByAltText('User Profile');
      expect(profileImage).toHaveAttribute('src', 'https://example.com/photo.jpg');
      
      // Verify userInfo is stored
      expect(mockChromeStorage.local.set).toHaveBeenCalledWith(expect.objectContaining({
        userInfo: {
          displayName: 'Test User',
          email: 'user@example.com',
          photoURL: 'https://example.com/photo.jpg'
        }
      }));
    });

    it('should use stored userInfo when available', async () => {
      mockOnAuthStateChanged.mockImplementation((_auth: any, callback: any) => {
        callback(null);
        return vi.fn();
      });

      mockChromeStorage.local.get.mockImplementation((_keys: any, callback: any) => {
        callback({ 
          userEmail: 'stored@example.com',
          userInfo: {
            displayName: 'Stored User',
            email: 'stored@example.com',
            photoURL: 'https://example.com/stored.jpg'
          }
        });
      });

      render(<AppBar />);

      await waitFor(() => {
        expect(screen.getByText('Stored User')).toBeInTheDocument();
        const profileImage = screen.getByAltText('User Profile');
        expect(profileImage).toHaveAttribute('src', 'https://example.com/stored.jpg');
      });
    });

    it('should handle photoUrl property for backward compatibility', async () => {
      mockOnAuthStateChanged.mockImplementation((_auth: any, callback: any) => {
        callback(null);
        return vi.fn();
      });

      mockChromeStorage.local.get.mockImplementation((_keys: any, callback: any) => {
        callback({ 
          userEmail: 'legacy@example.com',
          userInfo: {
            displayName: 'Legacy User',
            email: 'legacy@example.com',
            photoUrl: 'https://example.com/legacy.jpg' // Using the older property name
          }
        });
      });

      render(<AppBar />);

      await waitFor(() => {
        expect(screen.getByText('Legacy User')).toBeInTheDocument();
        const profileImage = screen.getByAltText('User Profile');
        expect(profileImage).toHaveAttribute('src', 'https://example.com/legacy.jpg');
      });
    });

    it('should handle image loading error gracefully', async () => {
      mockOnAuthStateChanged.mockImplementation((_auth: any, callback: any) => {
        callback({
          email: 'test@example.com',
          photoURL: 'https://invalid-url.com/broken.jpg'
        });
        return vi.fn();
      });

      render(<AppBar />);

      const profileImage = await screen.findByAltText('User Profile');
      
      // Simulate image loading error
      fireEvent.error(profileImage);
      
      // Should fallback to default image
      expect(profileImage).toHaveAttribute('src', 'mocked-default-profile.svg');
    });
  });

  describe('Plan status line', () => {
    beforeEach(() => {
      // Authenticated via stored email + token, so the tier lookup can run.
      mockOnAuthStateChanged.mockImplementation((_auth: any, callback: any) => {
        callback(null);
        return vi.fn();
      });
      mockChromeStorage.local.get.mockImplementation((_keys: any, callback: any) => {
        callback({ userEmail: 'member@example.com', firebaseToken: 'tok-123' });
      });
    });

    it.each([
      ['free', 'Free Plan'],
      ['pro', 'Pro Plan'],
      ['lifetime', 'Lifetime Member'],
      ['legacy', 'Legacy Member'],
    ])('shows "%s" tier as "%s"', async (tier, label) => {
      fetchEntitlements.mockResolvedValue({
        tier,
        classSyncLimit: tier === 'free' ? 5 : null,
        classSyncUsed: 0,
        syncedCourseIds: [],
      });

      render(<AppBar />);

      expect(await screen.findByText(label)).toBeInTheDocument();
      expect(fetchEntitlements).toHaveBeenCalledWith('tok-123');
    });

    it('falls back to "Signed In" when the tier lookup fails', async () => {
      fetchEntitlements.mockRejectedValue(new Error('offline'));

      render(<AppBar />);

      expect(await screen.findByText('Signed In')).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    beforeEach(() => {
      // Default setup for authenticated user
      mockOnAuthStateChanged.mockImplementation((_auth: any, callback: any) => {
        callback(mockUser);
        return vi.fn();
      });
    });

    it('should handle settings button click', async () => {
      // Mock development environment
      vi.spyOn(apiConfig, 'isDevelopment', 'get').mockReturnValue(true);
      
      render(<AppBar />);

      const settingsButton = screen.getByAltText('Settings').closest('button');
      expect(settingsButton).toBeInTheDocument();

      fireEvent.click(settingsButton!);

      expect(mockChromeTabs.create).toHaveBeenCalledWith({
        url: 'http://localhost:5173/settings',
      });
      expect(window.close).toHaveBeenCalled();
    });

    it('should handle settings button click in production', async () => {
      // Mock production environment
      vi.spyOn(apiConfig, 'isDevelopment', 'get').mockReturnValue(false);
      
      render(<AppBar />);

      const settingsButton = screen.getByAltText('Settings').closest('button');
      fireEvent.click(settingsButton!);

      expect(mockChromeTabs.create).toHaveBeenCalledWith({
        url: 'https://canvastonotion.io/settings',
      });
    });

    it('should handle settings button click error gracefully', async () => {
      mockChromeTabs.create.mockImplementation(() => {
        throw new Error('Tab creation failed');
      });

      render(<AppBar />);

      const settingsButton = screen.getByAltText('Settings').closest('button');
      fireEvent.click(settingsButton!);

      expect(console.error).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle logout button click successfully', async () => {
      mockAuth.signOut.mockResolvedValue(undefined);
      mockChromeStorage.local.remove.mockResolvedValue(undefined);

      render(<AppBar />);

      const logoutButton = screen.getByAltText('Logout').closest('button');
      expect(logoutButton).toBeInTheDocument();

      fireEvent.click(logoutButton!);

      await waitFor(() => {
        expect(mockAuth.signOut).toHaveBeenCalled();
        expect(mockChromeStorage.local.remove).toHaveBeenCalledWith([
          'isGuestMode',
          'canvasToken',
          'selectedPage',
          'userEmail',
          'firebaseToken',
          'tokenTimestamp',
          'userId',
          'userInfo',
        ]);
        expect(window.location.reload).toHaveBeenCalled();
      });
    });

    it('should handle logout error gracefully', async () => {
      const logoutError = new Error('Logout failed');
      mockAuth.signOut.mockRejectedValue(logoutError);

      render(<AppBar />);

      const logoutButton = screen.getByAltText('Logout').closest('button');
      fireEvent.click(logoutButton!);

      await waitFor(() => {
        expect(console.error).toHaveBeenCalledWith('Error during logout:', logoutError);
      });
    });
  });

  describe('External Message Handling', () => {
    let messageHandler: any;

    beforeEach(() => {
      mockOnAuthStateChanged.mockImplementation((_auth: any, callback: any) => {
        callback(mockUser);
        return vi.fn();
      });

      mockChromeRuntime.onMessageExternal.addListener.mockImplementation((handler: any) => {
        messageHandler = handler;
      });
    });

    it('should setup external message listener', () => {
      render(<AppBar />);

      expect(mockChromeRuntime.onMessageExternal.addListener).toHaveBeenCalled();
    });

    it('should handle external logout message', async () => {
      mockAuth.signOut.mockResolvedValue(undefined);
      mockChromeStorage.local.remove.mockResolvedValue(undefined);

      render(<AppBar />);

      const sendResponse = vi.fn();
      const message = { type: 'LOGOUT' };

      // Simulate external message
      const result = messageHandler(message, {}, sendResponse);

      expect(result).toBe(true); // Should keep message channel open
      
      await waitFor(() => {
        expect(sendResponse).toHaveBeenCalledWith({ success: true });
        expect(mockAuth.signOut).toHaveBeenCalled();
      });
    });

    it('should handle external UPDATE_USER_INFO message', async () => {
      render(<AppBar />);

      const sendResponse = vi.fn();
      const updatedUserInfo = {
        displayName: 'Updated User',
        email: 'updated@example.com',
        photoURL: 'https://example.com/updated.jpg'
      };
      
      const message = { 
        type: 'UPDATE_USER_INFO',
        data: updatedUserInfo
      };

      // Simulate external message
      const result = messageHandler(message, {}, sendResponse);

      expect(result).toBe(true); // Should keep message channel open
      
      await waitFor(() => {
        expect(sendResponse).toHaveBeenCalledWith({ success: true });
        expect(mockChromeStorage.local.set).toHaveBeenCalledWith({ 
          userInfo: updatedUserInfo 
        });
      });
      
      // Trigger a re-render to see if the UI updates
      render(<AppBar />);
      
      await waitFor(() => {
        expect(screen.getByText('Updated User')).toBeInTheDocument();
      });
    });

    it('should ignore non-recognized external messages', () => {
      render(<AppBar />);

      const sendResponse = vi.fn();
      const message = { type: 'OTHER_MESSAGE' };

      messageHandler(message, {}, sendResponse);

      expect(sendResponse).not.toHaveBeenCalled();
      expect(mockAuth.signOut).not.toHaveBeenCalled();
    });

    it('should log external messages', () => {
      render(<AppBar />);

      const message = { type: 'LOGOUT' };
      messageHandler(message, {}, vi.fn());

      expect(console.log).toHaveBeenCalledWith('Received external message:', message);
      expect(console.log).toHaveBeenCalledWith('Received logout message from web app');
    });
  });

  describe('Component Cleanup', () => {
    it('should cleanup listeners on unmount', () => {
      const unsubscribe = vi.fn();
      mockOnAuthStateChanged.mockImplementation((_auth: any, callback: any) => {
        callback(mockUser);
        return unsubscribe;
      });

      const { unmount } = render(<AppBar />);

      unmount();

      expect(unsubscribe).toHaveBeenCalled();
      expect(mockChromeRuntime.onMessageExternal.removeListener).toHaveBeenCalled();
    });
  });

  describe('UI Elements', () => {
    beforeEach(() => {
      mockOnAuthStateChanged.mockImplementation((_auth: any, callback: any) => {
        callback(mockUser);
        return vi.fn();
      });
    });

    it('should render all required UI elements', async () => {
      render(<AppBar />);

      await waitFor(() => {
        // Check profile image
        expect(screen.getByAltText('User Profile')).toBeInTheDocument();
        
        // Check user info
        expect(screen.getByText('test')).toBeInTheDocument();
        expect(screen.getByText('Signed In')).toBeInTheDocument();
        
        // Check action buttons
        expect(screen.getByAltText('Settings')).toBeInTheDocument();
        expect(screen.getByAltText('Logout')).toBeInTheDocument();
      });
    });

    it('should have correct button structure', async () => {
      render(<AppBar />);

      const settingsButton = screen.getByAltText('Settings').closest('button');
      const logoutButton = screen.getByAltText('Logout').closest('button');

      expect(settingsButton).toHaveClass('iconButton');
      expect(logoutButton).toHaveClass('iconButton');
    });
  });

  describe('Edge Cases', () => {
    it('should handle user with no email', async () => {
      const userWithoutEmail = {};
      mockOnAuthStateChanged.mockImplementation((_auth: any, callback: any) => {
        callback(userWithoutEmail);
        return vi.fn();
      });

      mockChromeStorage.local.get.mockImplementation((_keys: any, callback: any) => {
        callback({});
      });

      render(<AppBar />);

      await waitFor(() => {
        expect(screen.getByText('Guest')).toBeInTheDocument();
        expect(screen.getByText('Not Signed In')).toBeInTheDocument();
      });
    });

    it('should handle complex email addresses', async () => {
      const complexUser = { email: 'test.user+tag@example.co.uk' };
      mockOnAuthStateChanged.mockImplementation((_auth: any, callback: any) => {
        callback(complexUser);
        return vi.fn();
      });

      render(<AppBar />);

      await waitFor(() => {
        expect(screen.getByText('test.user+tag')).toBeInTheDocument();
      });
    });

    it('should handle chrome storage errors gracefully', async () => {
      mockOnAuthStateChanged.mockImplementation((_auth: any, callback: any) => {
        callback(null);
        return vi.fn();
      });

      mockChromeStorage.local.get.mockImplementation((_keys: any, _callback: any) => {
        // Simulate storage error by not calling callback
      });

      render(<AppBar />);

      // Component should still render without crashing
      expect(screen.getByAltText('Guest Profile')).toBeInTheDocument();
    });
  });
}); 