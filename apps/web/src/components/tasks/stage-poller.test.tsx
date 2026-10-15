import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FIRST_DELAY_MS, StagePoller } from "./stage-poller"

const refresh = vi.fn()
const getToken = vi.fn<() => Promise<string | null>>()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ getToken }) }))

const TASK_ID = "aaaaaaaa-2222-4333-8444-555555555555"
const fetchMock = vi.fn<typeof fetch>()

const notModified = () => new Response(null, { status: 304 })
const status = (version: string) =>
  Response.json({ state: "running", stalled: false, version }, { status: 200 })

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state })
  document.dispatchEvent(new Event("visibilitychange"))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal("fetch", fetchMock)
  getToken.mockResolvedValue("session-token")
  setVisibility("visible")
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  fetchMock.mockReset()
  refresh.mockClear()
})

describe("StagePoller (P1-6)", () => {
  it("asks the narrow stage endpoint with the rendered version, not the whole page", async () => {
    fetchMock.mockResolvedValue(notModified())
    render(<StagePoller taskId={TASK_ID} version="10-20-0" />)
    await vi.advanceTimersByTimeAsync(FIRST_DELAY_MS)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toMatch(new RegExp(`/purchase-tasks/${TASK_ID}/stage$`))
    expect(init?.headers).toMatchObject({
      authorization: "Bearer session-token",
      "if-none-match": '"10-20-0"',
    })
    expect(refresh).not.toHaveBeenCalled()
  })

  it("backs off while nothing changes", async () => {
    fetchMock.mockImplementation(async () => notModified())
    render(<StagePoller taskId={TASK_ID} version="10-20-0" />)
    await vi.advanceTimersByTimeAsync(FIRST_DELAY_MS)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Next wait is 1.5x: nothing at +2 s, the second poll by +3 s.
    await vi.advanceTimersByTimeAsync(FIRST_DELAY_MS)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(FIRST_DELAY_MS)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("re-renders the page once the version moves", async () => {
    fetchMock.mockResolvedValue(status("10-21-0"))
    render(<StagePoller taskId={TASK_ID} version="10-20-0" />)
    await vi.advanceTimersByTimeAsync(FIRST_DELAY_MS)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("keeps polling after a failed request", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network")).mockResolvedValue(status("10-21-0"))
    render(<StagePoller taskId={TASK_ID} version="10-20-0" />)
    await vi.advanceTimersByTimeAsync(FIRST_DELAY_MS * 3)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("pauses while the tab is hidden and checks at once when it is shown", async () => {
    fetchMock.mockResolvedValue(notModified())
    render(<StagePoller taskId={TASK_ID} version="10-20-0" />)
    setVisibility("hidden")
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).not.toHaveBeenCalled()

    setVisibility("visible")
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("does not poll without a session", async () => {
    getToken.mockResolvedValue(null)
    render(<StagePoller taskId={TASK_ID} version="10-20-0" />)
    await vi.advanceTimersByTimeAsync(FIRST_DELAY_MS)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("stops when unmounted", async () => {
    fetchMock.mockResolvedValue(notModified())
    const { unmount } = render(<StagePoller taskId={TASK_ID} version="10-20-0" />)
    unmount()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
