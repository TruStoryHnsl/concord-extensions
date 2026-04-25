/**
 * Shared helpers for wiring bot drivers into per-game UIs.
 *
 * Bots are seated alongside the human in single-user dev / self-hosted-with-
 * one-user sessions. After every human action, the renderer checks if the
 * next-to-act seat is a bot and, if so, schedules a delayed bot move.
 *
 * The 600ms default delay makes bot moves visible — without it the table
 * jumps from your action straight to your next turn and feels broken.
 *
 * Renderers MUST cancel pending bot timers in `destroy()` to avoid stale
 * moves firing into a torn-down UI. The PendingTimers helper below holds
 * a small set of timer ids and exposes `cancelAll()` for the destroy path.
 */

export const BOT_TURN_DELAY_MS = 600

/** Players whose id is in this prefix are AI bots seated by the suite. */
export function isBotId(id: string): boolean {
  return id.startsWith('@bot')
}

/**
 * A small container for setTimeout handles owned by a renderer. Callers
 * register handles via `add()` and tear them all down via `cancelAll()`
 * in their destroy() path.
 */
export class PendingTimers {
  private readonly handles = new Set<ReturnType<typeof setTimeout>>()

  /**
   * Schedule `fn` to run after `delayMs`. Returns a cancel callback that
   * also removes the handle from the set.
   */
  schedule(fn: () => void, delayMs: number): () => void {
    const handle = setTimeout(() => {
      this.handles.delete(handle)
      try {
        fn()
      } catch {
        // Errors in scheduled callbacks must not bubble up — they'd kill the
        // event loop. Renderers surface their own error UI.
      }
    }, delayMs)
    this.handles.add(handle)
    return () => {
      clearTimeout(handle)
      this.handles.delete(handle)
    }
  }

  cancelAll(): void {
    for (const h of this.handles) clearTimeout(h)
    this.handles.clear()
  }

  /** For tests: how many timers are pending. */
  size(): number {
    return this.handles.size
  }
}
