/**
 * Player-facing rules text for Werewolf. Rendered by the persistent Rules
 * panel (see ui/rules-panel.ts).
 */

export interface RulesSection {
  readonly heading: string
  readonly body: string
}

export interface RulesDoc {
  readonly title: string
  readonly sections: readonly RulesSection[]
}

export function totalBodyLength(doc: RulesDoc): number {
  return doc.sections.reduce((acc, s) => acc + s.body.length, 0)
}

export const RULES: RulesDoc = {
  title: 'Werewolf',
  sections: [
    {
      heading: 'Goal',
      body:
        "Two teams compete in secret. The Village wins when every Werewolf is dead. The Werewolves win when their numbers equal or exceed the surviving Villagers — at that point the wolves can never be voted down again.",
    },
    {
      heading: 'Win conditions',
      body:
        "Village victory: zero werewolves left alive at the end of any phase. Werewolves victory: alive-werewolves count is greater than or equal to alive-village count at the end of any phase. The game continues otherwise — alternating night and day until one side hits its win condition.",
    },
    {
      heading: 'Day phase',
      body:
        "All living players debate openly. Anyone may nominate any other living player for lynching. The table votes yes or no on each nomination. A nomination needs at least ceil(alive / 2) yes votes to be eligible; if it ties with a previously eligible nomination, both are cleared. At most one player is lynched per day. The lynched player reveals their role and dies.",
    },
    {
      heading: 'Night phase — order of resolution',
      body:
        "The night resolves in a strict order so role interactions are deterministic: 1) Werewolves wake and collectively mark one player for death. 2) The Doctor wakes and protects one player; if that player was the wolves' target, no death occurs. 3) The Witch wakes; she may use her one-shot heal potion to cancel a kill, and/or her one-shot kill potion to murder anyone she chooses. 4) The Seer wakes and learns the team of one chosen player. The Werewolves do not act on the very first night — that night is reserved for info roles.",
    },
    {
      heading: 'Roles',
      body:
        "Villager: no special power; debates and votes by day. Werewolf: at night, votes with the rest of the pack to choose tonight's victim. Seer: every night, picks one player and learns whether they are Village or Werewolves. Doctor: every night, picks one player to protect from a Werewolf kill; cannot protect the same player two nights in a row. Witch: holds two single-use potions for the entire game (one heal, one kill); both are used at night, and the Witch must commit before knowing the next day's vote outcome.",
    },
    {
      heading: 'Playing against bots',
      body:
        "When the table is short of human players, the suite seats AI bots that act with simple deterministic policies: villager bots vote with the loudest seer claim, werewolf bots target the lowest-id non-werewolf alive, the doctor bot avoids repeating its previous protect, and the witch bot holds her potions until the game is in serious danger. Bots are not strategic adversaries — they keep the game running so a human host can rehearse moderation flow.",
    },
  ],
}
