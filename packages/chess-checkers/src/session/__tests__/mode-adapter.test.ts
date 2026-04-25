import { describe, expect, it } from "vitest"
import { mapSdkModeToUxMode, pickViewVariant, UXMode } from "../mode-adapter"

const ALL_MODES: UXMode[] = ["party", "display", "service"]

describe("mapSdkModeToUxMode", () => {
  it("shared → display", () => {
    expect(mapSdkModeToUxMode("shared", ALL_MODES)).toBe("display")
  })
  it("shared_readonly → display", () => {
    expect(mapSdkModeToUxMode("shared_readonly", ALL_MODES)).toBe("display")
  })
  it("shared_admin_input → party", () => {
    expect(mapSdkModeToUxMode("shared_admin_input", ALL_MODES)).toBe("party")
  })
  it("per_user → service", () => {
    expect(mapSdkModeToUxMode("per_user", ALL_MODES)).toBe("service")
  })
  it("hybrid → first supported (chess-checkers does not declare hybrid)", () => {
    expect(mapSdkModeToUxMode("hybrid", ALL_MODES)).toBe("party")
    expect(mapSdkModeToUxMode("hybrid", ["service", "display"])).toBe("service")
  })
  it("falls back when natural match isn't supported", () => {
    expect(mapSdkModeToUxMode("shared", ["party"])).toBe("party")
    expect(mapSdkModeToUxMode("per_user", ["display"])).toBe("display")
  })
  it("throws when supportedModes is empty", () => {
    expect(() => mapSdkModeToUxMode("shared", [])).toThrow()
  })
})

describe("pickViewVariant", () => {
  it("service → solo regardless of seat", () => {
    expect(pickViewVariant("service", "host")).toBe("solo")
    expect(pickViewVariant("service", "participant")).toBe("solo")
    expect(pickViewVariant("service", "observer")).toBe("solo")
    expect(pickViewVariant("service", "spectator")).toBe("solo")
  })
  it("display → shared-display regardless of seat", () => {
    expect(pickViewVariant("display", "host")).toBe("shared-display")
    expect(pickViewVariant("display", "participant")).toBe("shared-display")
    expect(pickViewVariant("display", "observer")).toBe("shared-display")
  })
  it("party + participant → shared-controller (active)", () => {
    expect(pickViewVariant("party", "participant")).toBe("shared-controller")
  })
  it("party + host/observer/spectator → shared-display (passive)", () => {
    expect(pickViewVariant("party", "host")).toBe("shared-display")
    expect(pickViewVariant("party", "observer")).toBe("shared-display")
    expect(pickViewVariant("party", "spectator")).toBe("shared-display")
  })
})
