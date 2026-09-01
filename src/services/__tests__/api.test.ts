import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CanvasApi, canvasApi } from '../canvas/api'

describe('Canvas API Service', () => {
  let api: CanvasApi

  beforeEach(() => {
    vi.clearAllMocks()
    api = new CanvasApi()
    // Reset fetch mock
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Environment Setup', () => {
    it('should create CanvasApi instance successfully', () => {
      expect(api).toBeInstanceOf(CanvasApi)
      expect(canvasApi).toBeInstanceOf(CanvasApi)
    })
  })

  describe('parseNextLink', () => {
    it('should return null when linkHeader is null', () => {
      // Access private method through type assertion
      const result = (api as any).parseNextLink(null)
      expect(result).toBeNull()
    })

    it('should return null when linkHeader is empty', () => {
      const result = (api as any).parseNextLink('')
      expect(result).toBeNull()
    })

    it('should parse next link correctly from Link header', () => {
      const linkHeader = '<https://canvas.ucsc.edu/api/v1/courses?page=2>; rel="next", <https://canvas.ucsc.edu/api/v1/courses?page=5>; rel="last"'
      const result = (api as any).parseNextLink(linkHeader)
      expect(result).toBe('https://canvas.ucsc.edu/api/v1/courses?page=2')
    })

    it('should return null when no next link is found', () => {
      const linkHeader = '<https://canvas.ucsc.edu/api/v1/courses?page=1>; rel="prev", <https://canvas.ucsc.edu/api/v1/courses?page=5>; rel="last"'
      const result = (api as any).parseNextLink(linkHeader)
      expect(result).toBeNull()
    })

    it('should handle malformed link headers gracefully', () => {
      const linkHeader = 'invalid-link-header'
      const result = (api as any).parseNextLink(linkHeader)
      expect(result).toBeNull()
    })
  })

  describe('listCandidateCourses', () => {
    beforeEach(() => {
      // getCanvasBaseUrl() reads chrome.storage.local.get(['canvasBaseUrl'], cb);
      // the shared setup mock never invokes cb, so prime it here.
      ;(global.chrome.storage.local.get as any).mockImplementation(
        (_keys: any, cb: (r: any) => void) => cb({ canvasBaseUrl: 'https://canvas.ucsc.edu/api/v1' })
      )
      // Mock validateCanvasApi to return true
      vi.spyOn(api as any, 'validateCanvasApi').mockResolvedValue(true)
    })

    const okPage = (body: any[], next: string | null = null) => ({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(body),
      headers: { get: vi.fn().mockReturnValue(next ? `<${next}>; rel="next"` : null) },
    })

    it('fetches active and completed courses and maps CandidateCourse fields', async () => {
      const active = [{
        id: 1, name: 'Algorithms', course_code: 'CSE101', workflow_state: 'available',
        term: { id: 10, name: 'Fall 2026', start_at: '2026-09-20T00:00:00Z' },
      }]
      const completed = [{
        id: 2, name: 'Old Bio', course_code: 'BIO1', workflow_state: 'completed',
        term: { id: 9, name: 'Spring 2026', start_at: '2026-03-20T00:00:00Z' },
      }]
      global.fetch = vi.fn()
        .mockResolvedValueOnce(okPage(active))
        .mockResolvedValueOnce(okPage(completed))

      const result = await api.listCandidateCourses()

      expect(global.fetch).toHaveBeenCalledWith(
        'https://canvas.ucsc.edu/api/v1/courses?enrollment_type=student&enrollment_state=active&include[]=term&per_page=100'
      )
      expect(global.fetch).toHaveBeenCalledWith(
        'https://canvas.ucsc.edu/api/v1/courses?enrollment_type=student&enrollment_state=completed&include[]=term&per_page=100'
      )
      expect(result).toEqual([
        { id: 1, name: 'Algorithms', code: 'CSE101',
          term: { id: 10, name: 'Fall 2026', startAt: '2026-09-20T00:00:00Z' },
          enrollmentState: 'active' },
        { id: 2, name: 'Old Bio', code: 'BIO1',
          term: { id: 9, name: 'Spring 2026', startAt: '2026-03-20T00:00:00Z' },
          enrollmentState: 'completed' },
      ])
    })

    it('paginates via the Link header', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce(okPage(
          [{ id: 1, name: 'A', course_code: 'A1', workflow_state: 'available', term: null }],
          'https://canvas.ucsc.edu/api/v1/courses?page=2'))
        .mockResolvedValueOnce(okPage(
          [{ id: 2, name: 'B', course_code: 'B1', workflow_state: 'available', term: null }]))
        .mockResolvedValueOnce(okPage([])) // completed query, page 1

      const result = await api.listCandidateCourses()

      expect(result.map(c => c.id)).toEqual([1, 2])
      expect(result[0].term).toEqual({ id: null, name: null, startAt: null })
    })

    it('dedupes by id, preferring the active enrollment', async () => {
      const dup = { id: 5, name: 'Dup', course_code: 'D1', workflow_state: 'available', term: null }
      global.fetch = vi.fn()
        .mockResolvedValueOnce(okPage([dup]))
        .mockResolvedValueOnce(okPage([{ ...dup, workflow_state: 'completed' }]))

      const result = await api.listCandidateCourses()

      expect(result).toHaveLength(1)
      expect(result[0].enrollmentState).toBe('active')
    })

    it('drops courses whose workflow_state is neither available nor completed', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce(okPage([
          { id: 1, name: 'Live', course_code: 'L1', workflow_state: 'available', term: null },
          { id: 2, name: 'Deleted', course_code: 'X1', workflow_state: 'deleted', term: null },
        ]))
        .mockResolvedValueOnce(okPage([]))

      const result = await api.listCandidateCourses()

      expect(result.map(c => c.id)).toEqual([1])
    })

    it('throws an auth error on 401', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' })
      await expect(api.listCandidateCourses())
        .rejects.toThrow('Canvas authentication required. Please log into Canvas first.')
    })

    it('defaults missing course_code to an empty string', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce(okPage([{ id: 1, name: 'NoCode', workflow_state: 'available', term: null }]))
        .mockResolvedValueOnce(okPage([]))
      const result = await api.listCandidateCourses()
      expect(result[0].code).toBe('')
    })
  })

  describe('getAllAssignments', () => {
    const mockCourses = [
      { id: 1, name: 'Course 1', code: 'C1', workflow_state: 'available' },
      { id: 2, name: 'Course 2', code: 'C2', workflow_state: 'available' }
    ]

    beforeEach(() => {
      ;(global.chrome.storage.local.get as any).mockImplementation(
        (_keys: any, cb: (r: any) => void) => cb({ canvasBaseUrl: 'https://canvas.ucsc.edu/api/v1' })
      )
    })

    it('should fetch assignments for all courses successfully', async () => {
      const mockAssignments1 = [
        {
          id: 1,
          name: 'Assignment 1',
          description: '<p>Test description</p>',
          due_at: '2024-12-31T23:59:59Z',
          points_possible: 100,
          html_url: 'https://canvas.ucsc.edu/courses/1/assignments/1'
        }
      ]

      const mockAssignments2 = [
        {
          id: 2,
          name: 'Assignment 2',
          description: null,
          due_at: null,
          points_possible: 50,
          html_url: 'https://canvas.ucsc.edu/courses/2/assignments/2'
        }
      ]

      const mockResponse1 = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockAssignments1)
      }

      const mockResponse2 = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockAssignments2)
      }

      global.fetch = vi.fn()
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2)

      const result = await api.getAllAssignments(mockCourses)

      expect(global.fetch).toHaveBeenCalledTimes(2)
      expect(global.fetch).toHaveBeenCalledWith('https://canvas.ucsc.edu/api/v1/courses/1/assignments?per_page=100')
      expect(global.fetch).toHaveBeenCalledWith('https://canvas.ucsc.edu/api/v1/courses/2/assignments?per_page=100')
      
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        id: 1,
        name: 'Assignment 1',
        description: 'Test description',
        due_at: '2024-12-31T23:59:59Z',
        points_possible: 100,
        courseId: 1,
        courseName: 'Course 1',
        html_url: 'https://canvas.ucsc.edu/courses/1/assignments/1'
      })
      expect(result[1]).toEqual({
        id: 2,
        name: 'Assignment 2',
        description: null,
        due_at: null,
        points_possible: 50,
        courseId: 2,
        courseName: 'Course 2',
        html_url: 'https://canvas.ucsc.edu/courses/2/assignments/2'
      })
    })

    it('should handle fetch errors gracefully and continue with other courses', async () => {
      const mockAssignments = [
        {
          id: 1,
          name: 'Assignment 1',
          description: 'Test',
          due_at: null,
          points_possible: 100,
          html_url: 'https://canvas.ucsc.edu/test'
        }
      ]

      const mockResponseSuccess = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockAssignments)
      }

      const mockResponseError = {
        ok: false,
        status: 404
      }

      global.fetch = vi.fn()
        .mockResolvedValueOnce(mockResponseError)
        .mockResolvedValueOnce(mockResponseSuccess)

      const result = await api.getAllAssignments(mockCourses)

      expect(result).toHaveLength(1)
      expect(result[0].courseId).toBe(2)
    })

    it('should handle network errors gracefully', async () => {
      global.fetch = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue([])
        })

      const result = await api.getAllAssignments(mockCourses)

      expect(result).toHaveLength(0)
    })

    it('should return empty array when no courses provided', async () => {
      const result = await api.getAllAssignments([])
      expect(result).toHaveLength(0)
      expect(global.fetch).not.toHaveBeenCalled()
    })
  })

  describe('stripHtmlTags', () => {
    it('should return null when input is null', () => {
      const result = (api as any).stripHtmlTags(null)
      expect(result).toBeNull()
    })

    it('should strip HTML tags correctly', () => {
      const html = '<p>This is a <strong>test</strong> with <em>HTML</em> tags.</p>'
      const result = (api as any).stripHtmlTags(html)
      expect(result).toBe('This is a test with HTML tags.')
    })

    it('should handle HTML entities correctly', () => {
      const html = 'Test&nbsp;with&amp;entities&lt;like&gt;this&quot;and&#39;that'
      const result = (api as any).stripHtmlTags(html)
      expect(result).toBe('Test with&entities<like>this"and\'that')
    })

    it('should trim whitespace', () => {
      const html = '  <p>  Test with whitespace  </p>  '
      const result = (api as any).stripHtmlTags(html)
      expect(result).toBe('Test with whitespace')
    })

    it('should handle empty string', () => {
      const result = (api as any).stripHtmlTags('')
      expect(result).toBeNull()
    })

    it('should handle text without HTML tags', () => {
      const text = 'Plain text without tags'
      const result = (api as any).stripHtmlTags(text)
      expect(result).toBe('Plain text without tags')
    })

    it('should handle complex HTML with nested tags', () => {
      const html = '<div><p>Nested <span>HTML <strong>tags</strong></span> here</p></div>'
      const result = (api as any).stripHtmlTags(html)
      expect(result).toBe('Nested HTML tags here')
    })

    it('should handle self-closing tags', () => {
      const html = 'Line 1<br/>Line 2<hr/>Line 3'
      const result = (api as any).stripHtmlTags(html)
      expect(result).toBe('Line 1Line 2Line 3')
    })
  })

  describe('Singleton Export', () => {
    it('should export a singleton instance', () => {
      expect(canvasApi).toBeDefined()
      expect(canvasApi).toBeInstanceOf(CanvasApi)
    })

    it('should maintain same instance across multiple references', () => {
      // Test that the singleton instance is consistent
      const api1 = canvasApi
      const api2 = canvasApi
      expect(api1).toBe(api2)
      expect(api1).toBeInstanceOf(CanvasApi)
    })
  })
}) 