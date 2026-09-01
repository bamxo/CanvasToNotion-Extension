import { canvasApi } from '../services/canvas/api';
import { getApiBaseUrl, ENDPOINTS } from '../services/api.config';

/**
 * Background module that provides core functionality for the Chrome extension
 */

// Keep service worker alive
export function initializeServiceWorker() {
  console.log("Background service worker initialized");
  
  // Set up heartbeat to keep service worker alive
  const heartbeatInterval = setInterval(() => {
    console.log("Service worker heartbeat");
  }, 25000); // Every 25 seconds
  
  return heartbeatInterval;
}

// Get Firebase token from storage
export async function getFirebaseToken(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    chrome.storage.local.get(['firebaseToken', 'authToken'], (result) => {
      const token = result.firebaseToken || result.authToken;
      if (!token) {
        reject(new Error('Firebase token not found in storage'));
      } else {
        resolve(token);
      }
    });
  });
}

// Simplified function to extract course data
export function simplifyCoursesData(courses: any[]) {
  return courses.map(course => ({
    id: course.id,
    name: course.name
  }));
}

// Simplified function to extract assignment data
export function simplifyAssignmentsData(assignments: any[]) {
  return assignments.map(assignment => ({
    id: assignment.id,
    name: assignment.name,
    courseId: assignment.courseId,
    due_at: assignment.due_at,
    points_possible: assignment.points_possible,
    html_url: assignment.html_url
  }));
}

// Check if server is reachable
export async function checkServerStatus(): Promise<boolean> {
  try {
    const apiBaseUrl = await getApiBaseUrl();
    await fetch(apiBaseUrl, { method: 'HEAD' });
    return true;
  } catch (e) {
    const apiBaseUrl = await getApiBaseUrl();
    console.warn(`Server might not be running at ${apiBaseUrl}`);
    return false;
  }
}

// Handle sync to Notion
export async function handleSyncToNotion(message: any) {
  try {
    console.log('Handling sync to Notion', message);
    
    const courses = await canvasApi.getRecentCourses();
    const assignments = await canvasApi.getAllAssignments(courses);
    
    const syncResult = await syncWithNotion(courses, assignments, message);
    
    return { 
      success: true, 
      data: { 
        courses, 
        assignments,
        syncResult
      } 
    };
  } catch (error: any) {
    console.error('Sync encountered an issue:', error);
    const syncError = error instanceof Error ? error : new Error(String(error));
    const isActualError = syncError.message.includes('failed') || 
                       syncError.message.includes('error');
    
    return { 
      success: !isActualError,
      error: isActualError ? syncError.message : undefined,
      warning: !isActualError ? syncError.message : undefined
    };
  }
}

// Sync with Notion
export async function syncWithNotion(courses: any[], assignments: any[], message: any) {
  try {
    const simplifiedCourses = simplifyCoursesData(courses);
    const simplifiedAssignments = simplifyAssignmentsData(assignments);
    
    await checkServerStatus();
    
    const firebaseToken = await getFirebaseToken();
    
    const payload = {
      pageId: message.type === 'SYNC_TO_NOTION' ? message.data?.pageId : null,
      courses: simplifiedCourses,
      assignments: simplifiedAssignments
    };
    
    if (!payload.pageId) {
      console.warn('Missing pageId, but continuing with sync attempt');
    }
    
    const syncEndpoint = await ENDPOINTS.SYNC();
    const response = await fetch(syncEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${firebaseToken}`
      },
      body: JSON.stringify(payload)
    });
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const textResponse = await response.text();
      throw new Error(`Server returned non-JSON response with status ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Sync failed');
    }
    
    return data;
  } catch (error) {
    console.error('Error syncing with Notion:', error);
    throw error;
  }
}

// Parse and validate message
export function parseMessage(message: any) {
  if (!message || !message.type) {
    return { isValid: false, error: 'Invalid message format' };
  }
  
  if (message.type === 'SYNC_TO_NOTION') {
    return { isValid: true, type: 'SYNC_TO_NOTION', data: message.data || {} };
  } else if (message.type === 'COMPARE') {
    return { isValid: true, type: 'COMPARE', data: message.data || {} };
  }
  
  return { isValid: false, error: 'Unknown message type' };
}

// Main message handler
export function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
      try {
        const parsedMessage = parseMessage(message);
        
        if (!parsedMessage.isValid) {
          sendResponse({ success: false, error: parsedMessage.error });
          return;
        }
        
        if (parsedMessage.type === 'SYNC_TO_NOTION') {
          const result = await handleSyncToNotion(message);
          sendResponse(result);
        } else if (parsedMessage.type === 'COMPARE') {
          // Just a placeholder for now
          sendResponse({ success: false, error: 'Compare functionality not implemented yet' });
        } else {
          sendResponse({ success: false, error: 'Unknown action' });
        }
      } catch (error) {
        console.error('Error in background script:', error);
        sendResponse({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    })();

    // Return true to indicate we'll respond asynchronously
    return true;
  });
}
