"use client"

import { useAuth } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { useEffect, useEffectEvent } from "react"
import { pollStageStatus } from "@/lib/stage-status"

/** First poll, then each wait grows by `BACKOFF` up to `MAX_DELAY_MS`. A screen takes seconds. */
export const FIRST_DELAY_MS = 2_000
export const MAX_DELAY_MS = 15_000
const BACKOFF = 1.5

interface Props {
  taskId: string
  /** The stage `version` this page was rendered from. */
  version: string
}

/**
 * Watches the screening stage while the worker has it (P1-6). Polls the API's
 * narrow `/stage` endpoint from the browser and calls `router.refresh()` only
 * when the version differs from the one this page rendered, so an unchanged
 * poll is a 304 with no server render. Backs off from 2 s to 15 s, and pauses
 * while the tab is hidden (checking at once when it is shown again).
 *
 * The page mounts it only while the stage is `queued` or `running` and not
 * stalled, so it stops by itself once the refreshed page no longer renders
 * it. A refresh that brings a new `version` restarts the loop from the top.
 * One that doesn't land is retried on the next changed poll.
 */
export function StagePoller({ taskId, version }: Readonly<Props>) {
  const router = useRouter()
  const { getToken } = useAuth()

  // Not reactive: a new token getter or router must not restart the loop and
  // reset its backoff. The task and version are passed in by the Effect, so
  // only a change to one of those restarts it.
  const check = useEffectEvent(async (task: string, rendered: string, signal: AbortSignal) => {
    const token = await getToken()
    // Signed out: nothing to poll. The next navigation goes to sign-in.
    if (!token) return
    const poll = await pollStageStatus(task, rendered, token, signal)
    if (poll.changed) router.refresh()
  })

  useEffect(() => {
    const controller = new AbortController()
    let timer: number | undefined
    let inFlight = false
    let delay = FIRST_DELAY_MS

    const schedule = () => {
      timer = window.setTimeout(() => void tick(), delay)
      delay = Math.min(delay * BACKOFF, MAX_DELAY_MS)
    }

    const tick = async () => {
      timer = undefined
      // Hidden: stop here; `onVisibility` picks the loop back up.
      if (document.visibilityState === "hidden") return
      inFlight = true
      try {
        await check(taskId, version, controller.signal)
      } catch {
        // A failed poll is retried on the backoff; the page itself is unaffected.
      } finally {
        inFlight = false
      }
      if (!controller.signal.aborted) schedule()
    }

    const onVisibility = () => {
      if (document.visibilityState !== "visible" || inFlight || timer !== undefined) return
      delay = FIRST_DELAY_MS
      void tick()
    }

    schedule()
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [taskId, version])

  return null
}
