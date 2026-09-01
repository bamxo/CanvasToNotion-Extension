import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store mock implementations
const mockCanvasApi = {
  getAllAssignments: vi.fn()
};

// Mock the imported modules with correct paths - these need to be at the top level
vi.mock('../../services/canvas/api', () => ({
  canvasApi: mockCanvasApi
}));

vi.mock('../../services/api.config', () => ({
  API_BASE_URL: 'http://localhost:3000',
  ENDPOINTS: {
    SYNC: 'http://localhost:3000/api/notion/sync',
    COMPARE: 'http://localhost:3000/api/notion/compare'
  }
}));

// Mock the auth module
vi.mock('../auth', () => ({}));

describe('Background Index Module', () => {
  let mockSendResponse: any;
  let messageListener: any;
  
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Reset the mock implementations
    mockCanvasApi.getAllAssignments.mockResolvedValue([
      { id: 'a1', name: 'Assignment 1', courseId: '123', due_at: '2023-12-01', points_possible: 100, html_url: 'https://canvas.test/courses/123/assignments/a1' },
      { id: 'a2', name: 'Assignment 2', courseId: '456', due_at: '2023-12-15', points_possible: 50, html_url: 'https://canvas.test/courses/456/assignments/a2' }
    ]);
    
    // Mock sendResponse
    mockSendResponse = vi.fn();
    
    // Mock Chrome API
    global.chrome = {
      runtime: {
        onStartup: { addListener: vi.fn() },
        onInstalled: { addListener: vi.fn() },
        onMessage: { 
          addListener: vi.fn((callback) => {
            messageListener = callback;
          })
        }
      },
      storage: {
        local: {
          get: vi.fn().mockImplementation((_, callback) => {
            callback({ firebaseToken: 'test-token' });
          })
        }
      }
    } as any;
    
    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Mock fetch with proper handling for HEAD requests
    global.fetch = vi.fn().mockImplementation((_, options) => {
      if (options?.method === 'HEAD') {
        return Promise.resolve({
          status: 200,
          statusText: 'OK'
        });
      }
      return Promise.resolve({
        status: 200,
        statusText: 'OK',
        headers: {
          get: vi.fn().mockReturnValue('application/json')
        },
        json: vi.fn().mockResolvedValue({ success: true, data: {} }),
        text: vi.fn().mockResolvedValue('{"success":true}')
      });
    });
    
    // Mock setInterval
    vi.stubGlobal('setInterval', vi.fn());
  });
  
  afterEach(() => {
    vi.resetAllMocks();
  });
  
  it('should verify the testing environment is working', async () => {
    // Import the module to initialize the background script
    await import('../index');
    
    // Verify Chrome APIs are initialized correctly
    expect(chrome.runtime.onStartup.addListener).toHaveBeenCalled();
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
    expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalled();
    
    // Verify setInterval is called for heartbeat
    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 25000);
  });
  
  it('handles unknown message types in onMessage', async () => {
    // Import the module to initialize
    await import('../index');
    
    // Test with an unknown message type
    const result = messageListener({ type: 'UNKNOWN_TYPE' }, {}, mockSendResponse);
    
    // The listener should return true (for async response)
    expect(result).toBe(true);
    
    // Allow async operations to complete
    await vi.waitFor(() => {
      expect(mockSendResponse).toHaveBeenCalled();
    }, { timeout: 1000 });
    
    // Check that an error response was sent for unknown message type
    expect(mockSendResponse).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: 'Unknown action'
    }));
  });
  
  it('handles SYNC_TO_NOTION message correctly', async () => {
    // Import the module to initialize
    await import('../index');
    
    // Test the SYNC_TO_NOTION message
    const result = messageListener(
      { type: 'SYNC_TO_NOTION', data: { pageId: 'test-page-id', courses: [{ id: 123, name: 'Test Course 1', code: 'C1' }] } },
      {},
      mockSendResponse
    );

    // The listener should return true (for async response)
    expect(result).toBe(true);

    // Wait for async operations to complete
    await vi.waitFor(() => {
      expect(mockCanvasApi.getAllAssignments).toHaveBeenCalledWith([{ id: 123, name: 'Test Course 1', code: 'C1' }]);
    }, { timeout: 1000 });

    // Verify fetch was called with the right endpoint (HEAD request first, then POST)
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000', { method: 'HEAD' });
    }, { timeout: 1000 });

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/notion/sync', expect.any(Object));
    }, { timeout: 1000 });
    
    // Verify that sendResponse was eventually called
    await vi.waitFor(() => {
      expect(mockSendResponse).toHaveBeenCalled();
    }, { timeout: 1000 });
  });
  
  it('handles COMPARE message correctly', async () => {
    // Import the module to initialize
    await import('../index');
    
    // Test the COMPARE message
    const result = messageListener(
      { type: 'COMPARE', data: { pageId: 'test-page-id', courses: [{ id: 123, name: 'Test Course 1', code: 'C1' }] } },
      {},
      mockSendResponse
    );

    // The listener should return true (for async response)
    expect(result).toBe(true);

    // Wait for async operations to complete
    await vi.waitFor(() => {
      expect(mockCanvasApi.getAllAssignments).toHaveBeenCalledWith([{ id: 123, name: 'Test Course 1', code: 'C1' }]);
    }, { timeout: 1000 });

    // Verify fetch was called with the right endpoint (HEAD request first, then POST)
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000', { method: 'HEAD' });
    }, { timeout: 1000 });
    
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/notion/compare', expect.any(Object));
    }, { timeout: 1000 });
    
    // Verify that sendResponse was eventually called
    await vi.waitFor(() => {
      expect(mockSendResponse).toHaveBeenCalled();
    }, { timeout: 1000 });
  });
  
  it('rejects SYNC_TO_NOTION_V2 when no courses are selected', async () => {
    await import('../index');
    const result = messageListener(
      { type: 'SYNC_TO_NOTION_V2', data: { pageId: 'p1', courses: [] } },
      {},
      mockSendResponse
    );
    expect(result).toBe(true);
    await vi.waitFor(() => {
      expect(mockSendResponse).toHaveBeenCalledWith({ success: false, error: 'No classes selected' });
    }, { timeout: 1000 });
    expect(mockCanvasApi.getAllAssignments).not.toHaveBeenCalled();
  });

  it('handles missing Firebase token', async () => {
    // Mock storage.get to return no token
    (chrome.storage.local.get as any).mockImplementationOnce((_: string[], callback: (result: Record<string, any>) => void) => {
      callback({}); // Empty result - no token
    });
    
    // Import the module to initialize
    await import('../index');
    
    // Test the SYNC_TO_NOTION message
    const result = messageListener(
      { type: 'SYNC_TO_NOTION', data: { pageId: 'test-page-id', courses: [{ id: 123, name: 'Test Course 1', code: 'C1' }] } },
      {},
      mockSendResponse
    );
    
    // The listener should return true (for async response)
    expect(result).toBe(true);
    
    // Wait for error handling - the specific error message from syncWithNotion
    await vi.waitFor(() => {
      expect(console.error).toHaveBeenCalledWith('Error syncing with Notion:', expect.any(Error));
    }, { timeout: 1000 });
    
    // Verify that sendResponse was eventually called with success=true and syncWarning
    // because "Firebase token not found in storage" doesn't contain "failed" or "error"
    await vi.waitFor(() => {
      expect(mockSendResponse).toHaveBeenCalledWith(expect.objectContaining({ 
        success: true,
        syncWarning: 'Firebase token not found in storage'
      }));
    }, { timeout: 1000 });
  });
  
  it('handles non-JSON responses from the API', async () => {
    // Mock fetch to return a non-JSON response for POST requests
    global.fetch = vi.fn().mockImplementation((_, options) => {
      if (options?.method === 'HEAD') {
        return Promise.resolve({
          status: 200,
          statusText: 'OK'
        });
      }
      return Promise.resolve({
        status: 200,
        statusText: 'OK',
        headers: {
          get: vi.fn().mockReturnValue('text/html')
        },
        text: vi.fn().mockResolvedValue('<html><body>Error</body></html>')
      });
    });
    
    // Import the module to initialize
    await import('../index');
    
    // Test the SYNC_TO_NOTION message
    const result = messageListener(
      { type: 'SYNC_TO_NOTION', data: { pageId: 'test-page-id', courses: [{ id: 123, name: 'Test Course 1', code: 'C1' }] } },
      {},
      mockSendResponse
    );
    
    // The listener should return true (for async response)
    expect(result).toBe(true);
    
    // Wait for error handling - the specific error message from syncWithNotion
    await vi.waitFor(() => {
      expect(console.error).toHaveBeenCalledWith('Error syncing with Notion:', expect.any(Error));
    }, { timeout: 1000 });
    
    // Verify that sendResponse was eventually called
    await vi.waitFor(() => {
      expect(mockSendResponse).toHaveBeenCalled();
    }, { timeout: 1000 });
  });
  
  it('handles unsuccessful API responses', async () => {
    // Mock fetch to return an unsuccessful response
    global.fetch = vi.fn().mockImplementation((_, options) => {
      if (options?.method === 'HEAD') {
        return Promise.resolve({
          status: 200,
          statusText: 'OK'
        });
      }
      return Promise.resolve({
        status: 200,
        statusText: 'OK',
        headers: {
          get: vi.fn().mockReturnValue('application/json')
        },
        json: vi.fn().mockResolvedValue({ success: false, error: 'Sync failed' }),
        text: vi.fn().mockResolvedValue('{"success":false, "error":"Sync failed"}')
      });
    });
    
    // Import the module to initialize
    await import('../index');
    
    // Test the SYNC_TO_NOTION message
    const result = messageListener(
      { type: 'SYNC_TO_NOTION', data: { pageId: 'test-page-id', courses: [{ id: 123, name: 'Test Course 1', code: 'C1' }] } },
      {},
      mockSendResponse
    );
    
    // The listener should return true (for async response)
    expect(result).toBe(true);
    
    // Verify that sendResponse was eventually called
    await vi.waitFor(() => {
      expect(mockSendResponse).toHaveBeenCalled();
    }, { timeout: 1000 });
  });
  
  it('handles server connection errors', async () => {
    // Mock fetch to throw an error for HEAD request (server check)
    global.fetch = vi.fn().mockImplementation((_, options) => {
      if (options?.method === 'HEAD') {
        return Promise.reject(new Error('Server unreachable'));
      }
      // For POST requests, also reject to simulate server down
      return Promise.reject(new Error('Server unreachable'));
    });
    
    // Import the module to initialize
    await import('../index');
    
    // Test the SYNC_TO_NOTION message
    const result = messageListener(
      { type: 'SYNC_TO_NOTION', data: { pageId: 'test-page-id', courses: [{ id: 123, name: 'Test Course 1', code: 'C1' }] } },
      {},
      mockSendResponse
    );
    
    // The listener should return true (for async response)
    expect(result).toBe(true);
    
    // Wait for error handling - the server check warning should be logged
    await vi.waitFor(() => {
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('might not be running'));
    }, { timeout: 1000 });
    
    // Verify that sendResponse was eventually called
    await vi.waitFor(() => {
      expect(mockSendResponse).toHaveBeenCalled();
    }, { timeout: 1000 });
  });
}); 