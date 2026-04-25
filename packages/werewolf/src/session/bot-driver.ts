/**
 * Shared helpers for wiring bot drivers into Werewolf UIs.
 *
 * After every human action the renderer checks whether the next thing to
 * happen is a bot move and, if so, schedules a 600ms-delayed bot move so
 * the table doesn't visibly skip the bot turn.
 *
 * Renderers MUST cancel pending bot timers in `destroy()` to avoid stale
 * moves firing into a torn-down UI.
 */

export const BOT_TURN_DELAY_MS = 600

/** Players whose id starts with "@bot" are AI bots seated by the suite. */
export function isBotId(id: string): boolean {
  return id.startsWith('@bot')
}

export class PendingTimers {
  private readonly handles = new Set<ReturnType<typeof setTimeout>>()

  schedule(fn: () => void, delayMs: number): () => void {
    const handle = setTimeout(() => {
      this.handles.delete(handle)
      try {
        fn()
      } catch {
        /* errors in scheduled callbacks must not bubble — they'd kill the loop */
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
