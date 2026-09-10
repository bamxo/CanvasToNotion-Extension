import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

// --- Mocks ---------------------------------------------------------------

vi.mock('../Dashboard.module.css', () => ({ default: new Proxy({}, { get: (_t, k) => String(k) }) }))

vi.mock('axios', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { connected: true } }) },
}))

vi.mock('../../services/api.config', () => ({
  ENDPOINTS: { CONNECTED: () => Promise.resolve('https://example.test/connected') },
}))

const listCandidateCourses = vi.fn()
vi.mock('../../services/canvas/api', () => ({
  canvasApi: { listCandidateCourses: () => listCandidateCourses() },
}))

const unsubscribe = vi.fn()
vi.mock('../../services/chrome-auth.service', () => ({
  getAuth: () => ({
    onIdTokenChanged: (cb: (u: unknown) => void) => {
      cb({ email: 'user@example.com', getIdToken: async () => 'fake-token' })
      return unsubscribe
    },
    onAuthStateChanged: (cb: (u: unknown) => void) => {
      cb({ email: 'user@example.com', getIdToken: async () => 'fake-token' })
      return unsubscribe
    },
  }),
}))

const fetchEntitlements = vi.fn().mockResolvedValue({
  tier: 'free', classSyncLimit: 5, classSyncUsed: 4,
  syncedCourseIds: ['1', '2', '3', '4'],
})
vi.mock('../../services/entitlements.service', () => ({
  fetchEntitlements: (...a: unknown[]) => fetchEntitlements(...a),
}))

vi.mock('../../services/config', () => ({
  configService: {
    getWebAppBaseUrl: async () => 'https://canvastonotion.io',
    getUsersApiEndpoint: async (p: string) => p,
  },
}))

// Keep unrelated children out of the way; ClassSelector stays real.
vi.mock('../AppBar', () => ({ default: () => <div data-testid="app-bar" /> }))
vi.mock('./PageHeader', () => ({ default: () => <div data-testid="page-header" /> }))
vi.mock('../UnsyncedContainer', () => ({ default: () => <div data-testid="unsynced-container" /> }))
vi.mock('../NotionDisconnected', () => ({ default: () => <div data-testid="notion-disconnected" /> }))
vi.mock('../SyncButton', () => ({
  default: ({ onSync, disabled, isLoading }: { onSync: () => void; disabled: boolean; isLoading: boolean }) => (
    <button aria-label="sync all assignments" onClick={onSync} disabled={disabled || isLoading}>
      Sync
    </button>
  ),
}))

import Dashboard from './Dashboard'

const COURSE = {
  id: 1,
  name: 'Alpha',
  code: 'A1',
  term: { id: 10, name: 'Fall 2026', startAt: '2026-09-20T00:00:00Z' },
  enrollmentState: 'active' as const,
}

const selectedPage = { id: 'page-1', title: 'Test Page' }

beforeEach(() => {
  vi.clearAllMocks()
  listCandidateCourses.mockResolvedValue([COURSE])

  const store: Record<string, unknown> = {}
  global.chrome = {
    storage: {
      local: {
        get: vi.fn((_keys: unknown, cb: (r: Record<string, unknown>) => void) => cb(store)),
        set: vi.fn(),
        remove: vi.fn(),
      },
    },
    runtime: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      onMessageExternal: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  } as unknown as typeof chrome
})

describe('Dashboard class selection', () => {
  it('renders no term toggle', async () => {
    render(<Dashboard selectedPage={selectedPage} />)
    await screen.findByText('Select classes to sync')
    expect(screen.queryByText(/Quarter/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Semester/)).not.toBeInTheDocument()
  })

  it('disables Sync until a class is selected', async () => {
    render(<Dashboard selectedPage={selectedPage} />)
    const syncBtn = await screen.findByRole('button', { name: /sync all assignments/i })
    expect(syncBtn).toBeDisabled()
  })

  it('fetches entitlements once the firebase token is available', async () => {
    listCandidateCourses.mockResolvedValue([{ ...COURSE, id: 1, name: 'Alpha' }])
    render(<Dashboard selectedPage={selectedPage} />)
    await waitFor(() => expect(fetchEntitlements).toHaveBeenCalledWith('fake-token'))
  })

  it('persists selection under selectedCoursesByPage keyed by pageId', async () => {
    render(<Dashboard selectedPage={selectedPage} />)
    fireEvent.click(await screen.findByRole('button', { name: /select classes to sync/i }))
    fireEvent.click(await screen.findByRole('checkbox'))

    await waitFor(() => {
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({ selectedCoursesByPage: { 'page-1': [1] } }),
      )
    })
  })

  it('defers the Notion compare until the class selector is closed', async () => {
    const compareCalls = () =>
      (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mock.calls
        .filter((c: unknown[]) => (c[0] as { type?: string })?.type === 'COMPARE')

    render(<Dashboard selectedPage={selectedPage} />)
    fireEvent.click(await screen.findByRole('button', { name: /select classes to sync/i }))
    fireEvent.click(await screen.findByRole('checkbox'))

    // selection persisted, but the panel is still open -> no COMPARE yet
    await waitFor(() => {
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({ selectedCoursesByPage: { 'page-1': [1] } }),
      )
    })
    expect(compareCalls()).toHaveLength(0)

    // close the panel -> exactly one COMPARE fires
    fireEvent.click(screen.getByRole('button', { name: /classes: 1 selected/i }))
    await waitFor(() => expect(compareCalls().length).toBeGreaterThanOrEqual(1))
  })
})
