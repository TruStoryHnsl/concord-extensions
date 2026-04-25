/**
 * Player-facing rules text for Kings & Peasants (Asshole / President /
 * Scum) — 3-7 player variant.
 */

import { RulesDoc } from '../rules-doc-types'

export const RULES: RulesDoc = {
  title: 'Kings & Peasants',
  sections: [
    {
      heading: 'Goal',
      body:
        "Be the first player to play out all your cards. Finish order assigns social ranks for the next round: King, Vice-King, Neutrals, Vice-Peasant, Peasant. Card-passing at the next deal favors the King and punishes the Peasant.",
    },
    {
      heading: 'Card power',
      body:
        "Cards rank from low to high: 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A. The 2 is the highest rank and acts as a bomb that may be played on any combo of the same size to clear the trick.",
    },
    {
      heading: 'Leading and following',
      body:
        "The current leader plays any combo: a singleton, pair, triple, or four-of-a-kind of one rank. Each subsequent player must play a combo of the same size with strictly higher rank — or pass. A 2-bomb of equal size always beats anything.",
    },
    {
      heading: 'Trick clearing',
      body:
        "Once every other player passes, the trick clears and the last player to play leads the next combo (any size). A 2-bomb also clears the trick immediately and lets the same player lead again.",
    },
    {
      heading: 'Round end and card passing',
      body:
        "When all but one player has emptied their hand, the round ends. At the next deal, the King swaps their two worst cards for the Peasant's two best, and the Vice-King swaps one card with the Vice-Peasant in the same direction. Then the Peasant leads.",
    },
    {
      heading: 'Playing against bots',
      body:
        "Empty seats are filled with bots that lead with their lowest cards and play the smallest combo that beats the current top. They pass when they can't beat it. They are intentionally weak — beat them.",
    },
  ],
}
