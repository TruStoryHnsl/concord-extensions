/**
 * Player-facing rules text for Checkers (American / English Draughts).
 *
 * Rendered by the in-game Rules panel (see ui/rules-panel.ts).
 */

import { RulesDoc } from "../../games/rules-doc-types"

export const RULES: RulesDoc = {
  title: "Checkers",
  sections: [
    {
      heading: "Goal",
      body:
        "Capture every opposing piece, or leave the opponent with no legal move on their turn. A draw is declared when 40 turns pass with no capture and no king promotion.",
    },
    {
      heading: "Setup",
      body:
        "Each side starts with twelve men on the dark squares of the three back ranks (white at the bottom, black at the top). Men move only on dark squares and only diagonally. White moves first.",
    },
    {
      heading: "Movement",
      body:
        "A man moves one diagonal square forward to an empty dark square. A king moves one diagonal square forward or backward. Men become kings when they reach the opponent's back rank — they are crowned and the turn ends, even if more captures might have been possible.",
    },
    {
      heading: "Forced captures",
      body:
        "If you can capture, you MUST capture. A capture jumps an enemy piece on a diagonal-adjacent square, landing on the empty square beyond it. If the landing square offers another capture, the same piece keeps jumping in a single multi-jump chain — the chain is one move. You may choose freely between multiple available capture starts (the longest-jump rule is not enforced in American checkers).",
    },
    {
      heading: "Winning",
      body:
        "The first side to leave the opponent with no legal moves wins. A side with no pieces left has no legal moves, so capturing every enemy piece always wins.",
    },
    {
      heading: "Bot tiers",
      body:
        "Beginner searches 2 plies on material only. Casual evaluates mobility at 4 plies. Advanced applies a back-rank bonus at 6 plies. Expert searches deeper. Pick a tier when you start a bot game.",
    },
  ],
}
