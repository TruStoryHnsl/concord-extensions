/**
 * Player-facing rules text for Chess.
 *
 * Rendered by the in-game Rules panel (see ui/rules-panel.ts). Source of
 * truth for the textual rules so it co-locates with rule logic.
 */

import { RulesDoc } from "../../games/rules-doc-types"

export const RULES: RulesDoc = {
  title: "Chess",
  sections: [
    {
      heading: "Goal",
      body:
        "Checkmate the opposing king — leave it under attack with no legal way to escape. A draw can also occur via stalemate, threefold repetition, the 50-move rule, or insufficient mating material.",
    },
    {
      heading: "Setup",
      body:
        "White and Black each start with eight pieces on the back rank (rook, knight, bishop, queen, king, bishop, knight, rook) and eight pawns one rank in front. White moves first; afterwards play alternates.",
    },
    {
      heading: "How pieces move",
      body:
        "King: one square any direction. Queen: any number of squares horizontally, vertically, or diagonally. Rook: any number of squares horizontally or vertically. Bishop: any number of squares diagonally. Knight: an L-shape (2+1) and is the only piece that can jump. Pawn: one forward (or two from its starting rank), captures diagonally one forward.",
    },
    {
      heading: "Special rules",
      body:
        "Castling: king + unmoved rook combine into a single move when the squares between are empty and the king does not pass through check. En passant: a pawn that just advanced two squares can be captured by an adjacent enemy pawn as if it had only moved one. Promotion: a pawn reaching the far rank becomes a queen, rook, bishop, or knight (the player chooses).",
    },
    {
      heading: "Check and checkmate",
      body:
        "If your king is attacked you are in check and must respond — block, capture the attacker, or move out of the line of fire. If no legal response exists, it is checkmate and the game ends. Stalemate (no legal move while not in check) is a draw.",
    },
    {
      heading: "Bot tiers",
      body:
        "Beginner searches 2 plies and weighs material only. Casual adds mobility at 4 plies. Advanced + Expert layer king-safety penalties at 6 plies. Pick a tier when you start a bot game.",
    },
  ],
}
