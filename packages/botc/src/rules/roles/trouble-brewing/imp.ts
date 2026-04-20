/**
 * Trouble Brewing — Imp (Demon).
 *
 * Night (not first night): chooses a player to kill. If the Imp kills itself,
 * a Minion becomes the new Imp (v1 skips the transformation — we only emit
 * the kill effect; the starpass handler is a v1.1 item).
 *
 * The target selection is driven by RNG in bot-administered Chat mode; in
 * Party/Hybrid the human player picks. The engine exposes the selection as
 * a parameter on the `night` call via `self.statuses` containing a
 * `target:<id>` marker the engine injects before invoking the handler.
 */

import { Effect } from '../../effects'
import { RNG } from '../../rng'
import { GameState, PlayerState } from '../../types'
import { RoleDef } from './role-def'

export const IMP_ID = 'imp' as const

const TARGET_STATUS_PREFIX = 'target:'

function readTarget(self: PlayerState): string | null {
  for (const s of self.statuses) {
    if (s.startsWith(TARGET_STATUS_PREFIX)) return s.slice(TARGET_STATUS_PREFIX.length)
  }
  return null
}

export const imp: RoleDef = {
  id: IMP_ID,
  team: 'demon',
  alignment: 'evil',

  firstNight(): Effect[] {
    // First night the Imp does NOT kill (per Trouble Brewing rules); it learns
    // Minions and gets bluffs via separate handlers in scripts.ts.
    return []
  },

  night(state: GameState, self: PlayerState, rng: RNG): Effect[] {
    if (!self.alive) return []
    let targetId = readTarget(self)
    if (!targetId) {
      // Bot-administered: auto-pick an alive non-demon target. In pass-through
      // tests the caller should stamp a `target:<id>` status before calling.
      const pool = state.players.filter((p) => p.alive && p.team !== 'demon')
      if (pool.length === 0) return []
      targetId = rng.pick(pool).id
    }

    return [{ kind: 'kill', target: targetId, source: 'demon' }]
  },

  onNominated(): Effect[] {
    return []
  },

  onDeath(): Effect[] {
    return []
  },
}

export { TARGET_STATUS_PREFIX }
