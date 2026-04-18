/**
 * Seat-to-color pairing for chess/checkers.
 *
 * First two participants (in join order) claim white/black (in that order).
 * Subsequent joiners become observers unless a color seat is vacated.
 */

import type { Color } from "../engine/types"

export type Seat = "host" | "participant" | "observer" | "spectator"

export interface Participant {
  id: string
  seat: Seat
}

export interface ColorAssignment {
  white: string | null
  black: string | null
  observers: string[]
}

/** Assign colors by join order. `host` plays a color too unless they chose observer. */
export function assignColors(participants: Participant[]): ColorAssignment {
  const white = participants.find((p) => p.seat !== "observer" && p.seat !== "spectator")?.id ?? null
  const rest = participants.filter((p) => p.id !== white && p.seat !== "observer" && p.seat !== "spectator")
  const black = rest[0]?.id ?? null
  const observers = participants.filter((p) => p.id !== white && p.id !== black).map((p) => p.id)
  return { white, black, observers }
}

/** Invert an assignment: "who plays this color?" */
export function colorOf(assignment: ColorAssignment, participantId: string): Color | null {
  if (assignment.white === participantId) return "white"
  if (assignment.black === participantId) return "black"
  return null
}
