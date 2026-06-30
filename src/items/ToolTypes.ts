import type { PreferredTool } from "../world/blocks.ts";

export type ToolKind = Extract<
  PreferredTool,
  "hand" | "shovel" | "pickaxe" | "axe" | "shears"
>;

export type ToolItemKind = Exclude<ToolKind, "hand">;

export type EquippedTool = Readonly<{
  kind: ToolKind;
  speedMultiplier: number;
}>;

export const HAND_TOOL: EquippedTool = {
  kind: "hand",
  speedMultiplier: 1,
};

export function toolKindMatchesPreferredTool(
  tool: Pick<EquippedTool, "kind">,
  preferredTool: PreferredTool,
): boolean {
  return tool.kind === preferredTool;
}
