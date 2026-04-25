/**
 * Player-facing rules text for Texas Hold'em.
 *
 * Rendered by the in-game Rules panel (see ui-rules-panel.ts). Source of
 * truth for the textual rules of the game.
 */

import { RulesDoc } from '../rules-doc-types'

export const RULES: RulesDoc = {
  title: "Texas Hold'em",
  sections: [
    {
      heading: 'Goal',
      body:
        "Win chips by either having the best 5-card hand at showdown or convincing every other player to fold. Make your best 5-card hand from any combination of your two private hole cards and the five shared community cards.",
    },
    {
      heading: 'Round structure',
      body:
        "Each hand starts with the small blind and big blind posted to seed the pot. Two hole cards are dealt face-down to every player. Five community cards are then revealed in three stages — flop (3 cards), turn (1 card), river (1 card) — with a betting round in between each.",
    },
    {
      heading: 'Betting actions',
      body:
        "On your turn you may fold (forfeit your hand), check (pass with no bet to match), call (match the current bet), or raise (increase the bet by at least the minimum raise). Going all-in is implicit when your remaining stack is smaller than the call or raise amount.",
    },
    {
      heading: 'Showdown',
      body:
        "If two or more players reach the river without folding, hands are revealed. The best 5-card poker hand wins the pot — ties split it. If everyone else folds before the river, the last player standing takes the pot without showing.",
    },
    {
      heading: 'Playing against bots',
      body:
        "This Card Suite seat-fills empty seats with bots. Bots play tight pre-flop and react to pot odds post-flop, so call their raises with caution and don't expect them to bluff often.",
    },
  ],
}
