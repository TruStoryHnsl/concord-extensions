/**
 * Player-facing rules text for War.
 */

import { RulesDoc } from '../rules-doc-types'

export const RULES: RulesDoc = {
  title: 'War',
  sections: [
    {
      heading: 'Goal',
      body:
        "Capture every card from your opponent's stack. The first player to lose all their cards loses the game. War has no decisions — every outcome is determined by the shuffle, so the renderer just auto-flips for you.",
    },
    {
      heading: 'Setup',
      body:
        "The deck is shuffled and split evenly between the two players. Each player keeps their pile face-down in front of them and may not look at the cards until they are flipped.",
    },
    {
      heading: 'Flipping',
      body:
        "Both players flip the top card of their stack into the center at the same time. The higher rank wins both cards, which go to the bottom of the winner's stack. Aces are high.",
    },
    {
      heading: 'War (ties)',
      body:
        "On a tied flip, both players play three face-down cards followed by one face-up war card. The higher war card wins all 10 cards. If the war cards also tie, the war recurses — three more face-down cards plus another war card — until one player wins.",
    },
    {
      heading: 'Running out',
      body:
        "If a player can't supply enough cards to complete a war, they lose immediately with whatever they had committed forfeited to the other player.",
    },
  ],
}
