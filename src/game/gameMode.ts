export type GameMode = "creative" | "survival";

// Creative is intentionally active while core world systems are being tested.
export const ACTIVE_GAME_MODE: GameMode = "creative";

export function isCreativeMode(mode: GameMode = ACTIVE_GAME_MODE): boolean {
  return mode === "creative";
}
