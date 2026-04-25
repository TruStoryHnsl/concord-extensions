/**
 * Player-facing rules text for Speed (a.k.a. Spit).
 *
 * Rendered by the in-game Rules panel (see ui-rules-panel.ts).
 */

import { RulesDoc } from '../rules-doc-types'

export const RULES: RulesDoc = {
  title: 'Speed',
  sections: [
    {
      heading: 'Goal',
      body:
        "Be the first player to empty BOTH your working hand and your draw pile. Speed is real-time — there are no turns, both players play simultaneously.",
    },
    {
      heading: 'Setup',
      body:
        "Each player starts with a 5-card working hand (face-up to themselves), a 15-card draw pile (face-down), and a 6-card side stack. Two center discard piles are seeded with one card each from the players' side stacks.",
    },
    {
      heading: 'Legal plays',
      body:
        "Play a card from your working hand onto either center pile if its rank is exactly one above OR one below the top card on that pile. Ranks wrap: an Ace is adjacent to both King and 2 in either direction.",
    },
    {
      heading: 'Refilling',
      body:
        "After a play your hand refills automatically from your draw pile back up to 5 cards (until your draw pile is empty). The smaller your draw pile gets, the closer you are to winning.",
    },
    {
      heading: 'Stuck',
      body:
        "If neither player has a legal move, both flip the top card of their side stack onto the matching center pile. This breaks the deadlock and play resumes immediately.",
    },
    {
      heading: 'Playing against the bot',
      body:
        "The opponent in this Card Suite is an AI bot that scans its hand for legal plays each tick. It will not hesitate, so move fast.",
    },
  ],
}
