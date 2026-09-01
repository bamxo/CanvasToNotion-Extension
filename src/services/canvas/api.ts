export interface CandidateCourse {
  id: number;
  name: string;
  code: string;
  term: { id: number | null; name: string | null; startAt: string | null };
  enrollmentState: 'active' | 'completed';
}

export interface SelectedCourse {
  id: number;
  name: string;
  code: string;
}

interface Assignment {
  id: number;
  name: string;
  description: string | null;
  due_at: string | null;
  points_possible: number;
  courseId: number;
  courseName: string;
  html_url: string;
}

import { CanvasInfo, extractCanvasInfo } from './detection';

export class CanvasApi {
  private cachedBaseUrl: string | null = null;



  /**
   * Gets the Canvas base URL from the current active tab
   */
  private async getCanvasBaseUrl(): Promise<string> {
    // Check if we have a cached URL first
    if (this.cachedBaseUrl) {
      return this.cachedBaseUrl;
    }

    // Try to get from storage first
    const storedUrl = await this.getStoredCanvasUrl();
    if (storedUrl) {
      this.cachedBaseUrl = storedUrl;
      return storedUrl;
    }

    // If not in storage, detect from current tab
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentUrl = tabs[0]?.url;
        if (!currentUrl) {
          reject(new Error('No active tab found'));
          return;
        }

        const canvasInfo = extractCanvasInfo(currentUrl);
        
        if (!canvasInfo || !canvasInfo.isCanvas || !canvasInfo.apiUrl) {
          reject(new Error('Current tab is not a Canvas page'));
          return;
        }

        console.log('Detected Canvas instance:', canvasInfo);
        
        // Cache the URL and store in chrome storage
        this.cachedBaseUrl = canvasInfo.apiUrl;
        chrome.storage.local.set({ 
          canvasBaseUrl: canvasInfo.apiUrl,
          canvasInfo: canvasInfo,
          currentCanvasUrl: currentUrl 
        });
        
        resolve(canvasInfo.apiUrl);
      });
    });
  }

  /**
   * Gets stored Canvas URL from chrome storage
   */
  private async getStoredCanvasUrl(): Promise<string | null> {
    return new Promise((resolve) => {
      chrome.storage.local.get(['canvasBaseUrl'], (result) => {
        resolve(result.canvasBaseUrl || null);
      });
    });
  }

  /**
   * Validates that the Canvas API is accessible
   */
  private async validateCanvasApi(baseUrl: string): Promise<boolean> {
    try {
      const response = await fetch(`${baseUrl}/courses?per_page=1`);
      return response.ok || response.status === 401; // 401 is OK, just means we need auth
    } catch (error) {
      console.error('Canvas API validation failed:', error);
      return false;
    }
  }

  /**
   * Clears cached Canvas URL (useful for switching between different Canvas instances)
   */
  public clearCache(): void {
    this.cachedBaseUrl = null;
    chrome.storage.local.remove(['canvasBaseUrl', 'canvasInfo', 'currentCanvasUrl']);
  }

  private parseNextLink(linkHeader: string | null): string | null {
    if (!linkHeader) return null;

    const links = linkHeader.split(',').map(part => part.trim());
    for (const link of links) {
      const [urlPart, relPart] = link.split(';').map(part => part.trim());
      if (relPart === 'rel="next"') {
        return urlPart.slice(1, -1); // Remove angle brackets around URL
      }
    }
    return null;
  }

  async listCandidateCourses(): Promise<CandidateCourse[]> {
    const baseUrl = await this.getCanvasBaseUrl();

    const isValid = await this.validateCanvasApi(baseUrl);
    if (!isValid) {
      throw new Error('Canvas API is not accessible. Please make sure you are logged into Canvas.');
    }

    const fetchAll = async (
      enrollmentState: 'active' | 'completed'
    ): Promise<any[]> => {
      const out: any[] = [];
      let url: string =
        `${baseUrl}/courses?enrollment_type=student&enrollment_state=${enrollmentState}&include[]=term&per_page=100`;
      while (url) {
        const response = await fetch(url);
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Canvas authentication required. Please log into Canvas first.');
          }
          throw new Error(`Canvas API error: ${response.status} ${response.statusText}`);
        }
        const page = await response.json();
        out.push(...page);
        const linkHeader = response.headers.get('Link');
        url = linkHeader ? this.parseNextLink(linkHeader) || '' : '';
      }
      return out;
    };

    const [activeRaw, completedRaw] = await Promise.all([
      fetchAll('active'),
      fetchAll('completed'),
    ]);

    const ALLOWED_STATES = new Set(['available', 'completed']);
    const byId = new Map<number, CandidateCourse>();

    const ingest = (rows: any[], enrollmentState: 'active' | 'completed') => {
      for (const course of rows) {
        if (!ALLOWED_STATES.has(course.workflow_state)) continue;
        if (byId.has(course.id)) continue; // active ingested first -> active wins
        byId.set(course.id, {
          id: course.id,
          name: course.name,
          code: course.course_code || '',
          term: {
            id: course.term?.id ?? null,
            name: course.term?.name ?? null,
            startAt: course.term?.start_at ?? null,
          },
          enrollmentState,
        });
      }
    };

    ingest(activeRaw, 'active');
    ingest(completedRaw, 'completed');

    return Array.from(byId.values());
  }

  async getAllAssignments(courses: { id: number; name: string }[]): Promise<Assignment[]> {
    try {
      const baseUrl = await this.getCanvasBaseUrl();
      const allAssignments: Assignment[] = [];

      console.log(`Fetching assignments for ${courses.length} courses`);

      for (const course of courses) {
        try {
          const response = await fetch(`${baseUrl}/courses/${course.id}/assignments?per_page=100`);
          if (!response.ok) {
            console.warn(`Failed to fetch assignments for course ${course.id}: ${response.status}`);
            continue;
          }

          const courseAssignments = await response.json();
          console.log(`Fetched ${courseAssignments.length} assignments for course: ${course.name}`);

          // Only add the fields we need
          const formattedAssignments = courseAssignments.map((assignment: any) => ({
            id: assignment.id,
            name: assignment.name,
            description: this.stripHtmlTags(assignment.description),
            due_at: assignment.due_at,
            points_possible: assignment.points_possible,
            courseId: course.id,
            courseName: course.name,
            html_url: assignment.html_url
          }));

          allAssignments.push(...formattedAssignments);
        } catch (err) {
          console.error(`Failed to fetch assignments for course ${course.id}:`, err);
        }
      }

      console.log(`Total assignments fetched: ${allAssignments.length}`);
      return allAssignments;
    } catch (error) {
      console.error('Error fetching Canvas assignments:', error);
      throw error;
    }
  }

  // Helper function to strip HTML tags from text
  private stripHtmlTags(html: string | null): string | null {
    if (!html) return null;
    
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ')  // Replace &nbsp; with spaces
      .replace(/&amp;/g, '&')   // Replace &amp; with &
      .replace(/&lt;/g, '<')    // Replace &lt; with 
      .replace(/&gt;/g, '>')    // Replace &gt; with >
      .replace(/&quot;/g, '"')  // Replace &quot; with "
      .replace(/&#39;/g, "'")   // Replace &#39; with '
      .trim();                  // Trim whitespace
  }
}

// Export a singleton instance
export const canvasApi = new CanvasApi();