/**
 * Player-facing rules text for Klondike Solitaire.
 *
 * Rendered by the in-game Rules panel (see ui-rules-panel.ts). Source of
 * truth for the textual rules of the game so it co-locates with the rule
 * logic and doesn't bloat ui.ts.
 */

import { RulesDoc } from '../rules-doc-types'

export const RULES: RulesDoc = {
  title: 'Solitaire (Klondike)',
  sections: [
    {
      heading: 'Goal',
      body:
        "Build the four foundations from Ace to King by suit. The game is won when every card has been moved off the tableau and stock onto the foundation piles.",
    },
    {
      heading: 'Setup',
      body:
        "Seven tableau columns are dealt with one face-up card on top, the rest face-down. The remaining cards form the stock pile (face-down) with its companion waste pile starting empty. The four foundations begin empty.",
    },
    {
      heading: 'Moves',
      body:
        "Move face-up cards between tableau columns in alternating colors and strictly descending rank — a red 7 stacks on a black 8, and so on. Multi-card runs may be moved together if they already form a legal alternating-color, descending sequence. A King (or any legal King-led run) may move into an empty tableau column.",
    },
    {
      heading: 'Stock and waste',
      body:
        "Click the stock pile to draw to the waste. Cards on top of the waste may be played to the tableau or to a foundation. When the stock empties, recycle the waste back into the stock to draw through it again.",
    },
    {
      heading: 'Foundations',
      body:
        "Each foundation builds up from Ace to King in a single suit. Once a card lands on a foundation it normally stays there for the rest of the game.",
    },
  ],
}
