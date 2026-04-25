/**
 * Player-facing rules text for Blackjack.
 *
 * Rendered by the in-game Rules panel (see ui-rules-panel.ts). Source of
 * truth for the textual rules of the game.
 */

import { RulesDoc } from '../rules-doc-types'

export const RULES: RulesDoc = {
  title: 'Blackjack',
  sections: [
    {
      heading: 'Goal',
      body:
        "Beat the dealer's hand without going over 21. You win if your final total is closer to 21 than the dealer, the dealer busts, or you draw a natural blackjack against a non-blackjack dealer hand.",
    },
    {
      heading: 'Card values',
      body:
        "Number cards count their face value. Face cards (J, Q, K) count 10. An Ace counts as either 1 or 11 — whichever helps your total most without busting.",
    },
    {
      heading: 'Player actions',
      body:
        "On your turn you may Hit (take another card), Stand (lock in your total), Double (take exactly one more card and double your bet), Split (when your two starting cards have the same rank, play them as two separate hands), or Surrender (forfeit half your bet and exit the hand). Hands that exceed 21 bust and lose immediately.",
    },
    {
      heading: 'Dealer policy',
      body:
        "The dealer plays last and must hit until reaching 17 or higher. The dealer also hits on a soft 17 (17 with an Ace counted as 11). The dealer's choices are forced — there is no judgment call from the dealer side.",
    },
    {
      heading: 'Payouts',
      body:
        "A winning hand pays even money. A natural blackjack (Ace plus a ten-value card on the initial deal) pays 3:2 against a dealer non-blackjack. A tie with the dealer pushes — your stake is returned with no win or loss.",
    },
  ],
}
