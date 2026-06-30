export type GameMode = "creative" | "survival";

export function isCreativeMode(mode: GameMode): boolean {
  return mode === "creative";
}
