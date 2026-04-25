/**
 * Shared helpers for wiring bot drivers into chess/checkers UIs.
 *
 * In single-user / dev / self-hosted-with-one-user sessions a bot is seated
 * opposite the human. After every human move, the renderer checks if the
 * side-to-move belongs to a bot and, if so, schedules a delayed bot move.
 *
 * 600ms is enough to look like a deliberate move, not a glitch. Without it
 * the board jumps from your move straight to your next turn and feels
 * broken.
 *
 * Mirrors packages/card-suite/src/games/bot-driver.ts.
 */

export const BOT_TURN_DELAY_MS = 600

/** Players whose id starts with `@bot` are AI bots seated by the runtime. */
export function isBotId(id: string): boolean {
  return id.startsWith("@bot")
}

/**
 * Small container for setTimeout handles owned by a renderer. Callers
 * register handles via `schedule()` and tear them all down via
 * `cancelAll()` in their destroy path.
 */
export class PendingTimers {
  private readonly handles = new Set<ReturnType<typeof setTimeout>>()

  schedule(fn: () => void, delayMs: number): () => void {
    const handle = setTimeout(() => {
      this.handles.delete(handle)
      try {
        fn()
      } catch {
        // Errors in scheduled callbacks must not bubble out; renderers
        // surface their own error UI.
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

  size(): number {
    return this.handles.size
  }
}
