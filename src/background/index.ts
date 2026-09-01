// src/background/index.ts
console.log('Background script initializing...');

import { canvasApi } from '../services/canvas/api';
import './auth';  // Import auth module to initialize token handling
import { getApiBaseUrl, ENDPOINTS } from '../services/api.config';

console.log('Background script initialized, auth module imported');

// Configuration for chunking and rate limiting
const SYNC_CONFIG = {
  CHUNK_SIZE: 15, // Number of assignments per chunk
  MIN_DELAY_MS: 350, // Minimum delay between requests (Notion: 3 req/sec = 333ms)
  MAX_RETRIES: 2, // Maximum retries per chunk on failure
};

// Keep service worker alive
chrome.runtime.onStartup.addListener(() => {
  console.log("Extension started up, service worker activated");
});

// Periodic ping to keep service worker alive
setInterval(() => {
  console.log("Service worker heartbeat");
}, 25000); // Every 25 seconds

// Helper function to get Firebase token
async function getFirebaseToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['firebaseToken', 'authToken'], (result) => {
      const token = result.firebaseToken || result.authToken;
      if (!token) {
        console.error('Firebase token not found in storage');
        reject(new Error('Firebase token not found in storage'));
      } else {
        resolve(token);
      }
    });
  });
}

// Helper function to delay execution
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to chunk an array
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

// Progress callback type for sync operations
type ProgressCallback = (progress: number, message: string) => void;

// Function to sync data with Notion using v2 chunked approach
async function syncWithNotionV2(
  courses: any[], 
  assignments: any[], 
  pageId: string,
  onProgress?: ProgressCallback
): Promise<{ success: boolean; totalCreated: number; totalSkipped: number; errors: string[] }> {
  console.log('Starting sync v2 with Notion for', courses.length, 'courses and', assignments.length, 'assignments');
  
  const firebaseToken = await getFirebaseToken();
  const syncEndpoint = await ENDPOINTS.SYNC_V2();
  
  // Simplify data
  const simplifiedCourses = courses.map(course => ({
    id: course.id,
    name: course.name
  }));
  
  const simplifiedAssignments = assignments.map(assignment => ({
    id: assignment.id,
    name: assignment.name,
    courseId: assignment.courseId,
    due_at: assignment.due_at,
    points_possible: assignment.points_possible,
    html_url: assignment.html_url
  }));
  
  // Chunk the assignments
  const assignmentChunks = chunkArray(simplifiedAssignments, SYNC_CONFIG.CHUNK_SIZE);
  const totalChunks = assignmentChunks.length || 1; // At least 1 chunk for course creation
  
  console.log(`Split ${simplifiedAssignments.length} assignments into ${totalChunks} chunks`);
  
  let totalCreated = 0;
  let totalSkipped = 0;
  const errors: string[] = [];
  
  // Send initial progress to show sync has started
  if (onProgress) {
    onProgress(5, 'Starting sync...');
  }
  
  // Process each chunk
  for (let i = 0; i < totalChunks; i++) {
    const chunk = assignmentChunks[i] || [];
    const isInitialChunk = i === 0;
    
    // Calculate progress: start at 10%, end at 95% (leaving room for completion)
    // This ensures we always show a meaningful percentage during sync
    const progressPercent = Math.round(10 + ((i + 1) / totalChunks) * 85);
    const progressMessage = `Processing chunk ${i + 1}/${totalChunks}`;
    console.log(`Progress: ${progressPercent}% - ${progressMessage}`);
    
    if (onProgress) {
      onProgress(progressPercent, progressMessage);
    }
    
    // Retry logic for each chunk
    let retries = 0;
    let chunkSuccess = false;
    
    while (!chunkSuccess && retries <= SYNC_CONFIG.MAX_RETRIES) {
      try {
        const payload = {
          pageId,
          courses: simplifiedCourses,
          assignments: chunk,
          chunkIndex: i,
          totalChunks,
          isInitialChunk
        };
        
        console.log(`Sending chunk ${i + 1}/${totalChunks} (attempt ${retries + 1})`);
        
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
          throw new Error(`Server returned non-JSON response: ${textResponse.substring(0, 100)}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Chunk sync failed');
        }
        
        // Accumulate results
        totalCreated += data.results?.assignmentsCreated || 0;
        totalSkipped += data.results?.assignmentsSkipped || 0;
        if (data.results?.errors) {
          errors.push(...data.results.errors);
        }
        
        console.log(`Chunk ${i + 1} completed: ${data.results?.assignmentsCreated || 0} created, ${data.results?.assignmentsSkipped || 0} skipped`);
        chunkSuccess = true;
        
      } catch (error: any) {
        retries++;
        console.error(`Error processing chunk ${i + 1} (attempt ${retries}):`, error);
        
        if (retries > SYNC_CONFIG.MAX_RETRIES) {
          errors.push(`Failed to process chunk ${i + 1}: ${error.message}`);
        } else {
          // Wait before retrying
          await delay(SYNC_CONFIG.MIN_DELAY_MS * 2);
        }
      }
    }
    
    // Rate limiting: wait between chunks to respect Notion's 3 req/sec limit
    if (i < totalChunks - 1) {
      await delay(SYNC_CONFIG.MIN_DELAY_MS);
    }
  }
  
  // Final progress update
  if (onProgress) {
    onProgress(100, 'Sync completed');
  }
  
  console.log(`Sync v2 completed: ${totalCreated} created, ${totalSkipped} skipped, ${errors.length} errors`);
  
  return {
    success: errors.length === 0 || totalCreated > 0,
    totalCreated,
    totalSkipped,
    errors
  };
}

// Legacy sync function (kept for backwards compatibility with production polling)
async function syncWithNotion(courses: any[], assignments: any[], message: any) {
  try {
    console.log('Starting legacy sync with Notion for', courses.length, 'courses and', assignments.length, 'assignments');
    
    // Extract only the necessary data to reduce payload size
    const simplifiedCourses = courses.map(course => ({
      id: course.id,
      name: course.name
    }));
    
    const simplifiedAssignments = assignments.map(assignment => ({
      id: assignment.id,
      name: assignment.name,
      courseId: assignment.courseId,
      due_at: assignment.due_at,
      points_possible: assignment.points_possible,
      html_url: assignment.html_url
    }));
    
    // First, check if the server is reachable
    try {
      const apiBaseUrl = await getApiBaseUrl();
      await fetch(apiBaseUrl, { method: 'HEAD' });
    } catch (e) {
      const apiBaseUrl = await getApiBaseUrl();
      console.warn(`Server might not be running at ${apiBaseUrl}`);
    }
    
    const firebaseToken = await getFirebaseToken();
    
    const payload = {
      pageId: message.type === 'SYNC_TO_NOTION' ? message.data.pageId : null,
      courses: simplifiedCourses,
      assignments: simplifiedAssignments
    };
    
    // Validate payload before sending
    if (!payload.pageId) {
      console.warn('Missing pageId, but continuing with sync attempt');
    }
    
    console.log('Sending sync payload:', payload);
    
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
    
    // Log response status for debugging
    console.log(`Sync API response status: ${response.status} ${response.statusText}`);
    
    // Check if response is actually JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      // If not JSON, get the text and log it for debugging
      const textResponse = await response.text();
      console.error('Server returned non-JSON response:', textResponse);
      throw new Error(`Server returned non-JSON response with status ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Sync failed');
    }
    
    console.log('Successfully synced with Notion:', data);
    return data;
  } catch (error) {
    console.error('Error syncing with Notion:', error);
    throw error;
  }
}

// Function to compare data with Notion through our backend
async function compareWithNotion(courses: any[], assignments: any[], pageId: string, _message: any) {
  try {
    console.log('Starting compare with Notion for', courses.length, 'courses and', assignments.length, 'assignments');
    
    // Extract only the necessary data to reduce payload size
    const simplifiedCourses = courses.map(course => ({
      id: course.id,
      name: course.name
    }));
    
    const simplifiedAssignments = assignments.map(assignment => ({
      id: assignment.id,
      name: assignment.name,
      courseId: assignment.courseId,
      due_at: assignment.due_at,
      points_possible: assignment.points_possible,
      html_url: assignment.html_url
    }));
    
    // First, check if the server is reachable
    try {
      const apiBaseUrl = await getApiBaseUrl();
      await fetch(apiBaseUrl, { method: 'HEAD' });
    } catch (e) {
      const apiBaseUrl = await getApiBaseUrl();
      console.warn(`Server might not be running at ${apiBaseUrl}`);
    }
    
    // Get the Firebase token from storage with better error handling
    const firebaseToken = await new Promise<string>((resolve, reject) => {
      chrome.storage.local.get(['firebaseToken', 'authToken'], (result) => {
        const token = result.firebaseToken || result.authToken;
        if (!token) {
          console.error('Firebase token not found in storage');
          reject(new Error('Firebase token not found in storage'));
        } else {
          console.log('Firebase token retrieved successfully');
          resolve(token);
        }
      });
    });
    
    const payload = {
      pageId: pageId || null, // Explicitly include the pageId for the backend to know which Notion page to compare
      courses: simplifiedCourses,
      assignments: simplifiedAssignments
    };
    
    // Validate payload before sending
    if (!payload.pageId) {
      console.warn('Missing pageId, but continuing with compare attempt');
    }
    
    console.log('Sending compare payload:', payload);
    
    const compareEndpoint = await ENDPOINTS.COMPARE();
    const response = await fetch(compareEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${firebaseToken}`
      },
      body: JSON.stringify(payload)
    });
    
    // Log response status for debugging
    console.log(`Compare API response status: ${response.status} ${response.statusText}`);
    
    // Check if response is actually JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      // If not JSON, get the text and log it for debugging
      const textResponse = await response.text();
      console.error('Server returned non-JSON response:', textResponse);
      throw new Error(`Server returned non-JSON response with status ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Compare failed');
    }
    
    console.log('Successfully compared with Notion:', data);
    return data;
  } catch (error) {
    console.error('Error comparing with Notion:', error);
    throw error;
  }
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Skip messages that aren't for this handler
  if (!['SYNC_TO_NOTION', 'SYNC_TO_NOTION_V2', 'COMPARE'].includes(message.type)) {
    return false; // Let other listeners handle it
  }
  
  (async () => {
    try {
      if (message.type === 'SYNC_TO_NOTION_V2') {
        console.log('Received SYNC_TO_NOTION_V2 message:', message);
        
        // Helper to send progress updates
        const sendProgress = (progress: number, progressMessage: string) => {
          chrome.runtime.sendMessage({
            type: 'SYNC_PROGRESS',
            progress,
            message: progressMessage
          }).catch(() => {
            // Ignore errors if popup isn't listening
          });
        };
        
        // Send initial progress - fetching data
        sendProgress(2, 'Fetching Canvas courses...');
        
        // Fetch all necessary data from Canvas
        const courses = await canvasApi.getRecentCourses();
        console.log('Fetched courses:', courses.length);
        
        sendProgress(5, 'Fetching Canvas assignments...');
        
        const assignments = await canvasApi.getAllAssignments(courses);
        console.log('Fetched assignments:', assignments.length);
        
        const pageId = message.data?.pageId;
        if (!pageId) {
          sendResponse({ success: false, error: 'Missing pageId' });
          return;
        }
        
        sendProgress(8, 'Preparing to sync...');
        
        // Use the new chunked sync v2 approach
        try {
          // Progress callback to send updates to the popup
          const progressCallback = (progress: number, progressMessage: string) => {
            sendProgress(progress, progressMessage);
          };
          
          const syncResult = await syncWithNotionV2(courses, assignments, pageId, progressCallback);
          
          sendResponse({
            success: syncResult.success,
            data: {
              courses,
              assignments,
              syncResult: {
                totalCreated: syncResult.totalCreated,
                totalSkipped: syncResult.totalSkipped,
                errors: syncResult.errors
              }
            }
          });
        } catch (error: any) {
          console.error('Sync v2 encountered an issue:', error);
          sendResponse({
            success: false,
            error: error.message || 'Sync failed'
          });
        }
      } else if (message.type === 'SYNC_TO_NOTION') {
        // Legacy sync handler (for production polling approach)
        console.log('Received SYNC_TO_NOTION message:', message);
        
        const courses = await canvasApi.getRecentCourses();
        console.log('Fetched courses:', courses);
        
        const assignments = await canvasApi.getAllAssignments(courses);
        console.log('Fetched assignments:', assignments);
        
        try {
          const syncResult = await syncWithNotion(courses, assignments, message);
          
          sendResponse({ 
            success: true, 
            data: { 
              courses, 
              assignments,
              syncResult
            } 
          });
        } catch (error: any) {
          console.error('Sync encountered an issue:', error);
          const syncError = error instanceof Error ? error : new Error(String(error));
          const isActualError = syncError.message.includes('failed') || 
                              syncError.message.includes('error');
          
          sendResponse({ 
            success: !isActualError,
            data: { courses, assignments },
            syncWarning: isActualError ? undefined : syncError.message,
            syncError: isActualError ? syncError.message : undefined
          });
        }
      } else if (message.type === 'COMPARE') {
        console.log('Received COMPARE message:', message);
        
        const courses = await canvasApi.getRecentCourses();
        console.log('Fetched courses:', courses.length);

        const assignments = await canvasApi.getAllAssignments(courses);
        console.log('Fetched assignments:', assignments.length);

        const pageId = message.data?.pageId || null;

        try {
          const compareResult = await compareWithNotion(courses, assignments, pageId, message);

          sendResponse({
            success: true,
            data: {
              courses,
              assignments,
              compareResult
            }
          });
        } catch (error: any) {
          console.error('Compare encountered an issue:', error);
          const compareError = error instanceof Error ? error : new Error(String(error));
          const isActualError = compareError.message.includes('failed') ||
                                compareError.message.includes('error');

          sendResponse({
            success: !isActualError,
            data: { courses, assignments },
            compareWarning: isActualError ? undefined : compareError.message,
            compareError: isActualError ? compareError.message : undefined
          });
        }
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

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Canvas to Notion extension installed');
});
