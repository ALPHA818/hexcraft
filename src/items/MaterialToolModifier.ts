import type { MaterialDefinition } from "../materials/MaterialTypes.ts";
import type { EquippedTool } from "./ToolTypes.ts";

export type BaseToolForModification = Readonly<{
  displayName: string;
  shortName: string;
  maxDurability: number;
  tool: EquippedTool;
}>;

export type MaterialToolModifier = Readonly<{
  durabilityMultiplier: number;
  speedMultiplier: number;
  preferredBlockBonus: number;
  instabilityRisk: number;
}>;

export type ModifiedToolStats = Readonly<{
  displayName: string;
  shortName: string;
  maxDurability: number;
  tool: EquippedTool;
  modifier: MaterialToolModifier;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number, places = 3): number {
  const factor = 10 ** places;

  return Math.round(value * factor) / factor;
}

function toolLabel(baseTool: BaseToolForModification): string {
  const label = baseTool.shortName || baseTool.displayName;

  return label.replace(/^Wooden\s+/i, "").trim();
}

export function materialToolModifier(
  material: MaterialDefinition,
): MaterialToolModifier {
  const instabilityRisk = clamp(
    (100 - material.stability) * 0.006 +
      material.radioactivity * 0.003 +
      material.toxicity * 0.002 +
      Math.max(0, material.heat - 82) * 0.002,
    0,
    0.85,
  );
  const durabilityMultiplier = clamp(
    0.75 +
      material.hardness * 0.012 +
      material.metal * 0.008 +
      material.crystal * 0.004 +
      material.density * 0.003 -
      instabilityRisk * 0.9 -
      material.gas * 0.002,
    0.25,
    3.5,
  );
  const speedMultiplier = clamp(
    1 +
      material.conductivity * 0.004 +
      material.magic * 0.003 +
      material.crystal * 0.002 +
      material.metal * 0.003 +
      material.heat * 0.001 -
      instabilityRisk * 0.3,
    0.55,
    2.5,
  );
  const preferredBlockBonus = clamp(
    material.hardness * 0.004 +
      material.metal * 0.003 +
      material.crystal * 0.003 +
      material.magic * 0.002,
    0,
    1.5,
  );

  return {
    durabilityMultiplier: round(durabilityMultiplier),
    speedMultiplier: round(speedMultiplier),
    preferredBlockBonus: round(preferredBlockBonus),
    instabilityRisk: round(instabilityRisk),
  };
}

export function modifiedToolStatsForMaterial(
  baseTool: BaseToolForModification,
  material: MaterialDefinition,
): ModifiedToolStats {
  const modifier = materialToolModifier(material);
  const label = toolLabel(baseTool);
  const maxDurability = Math.max(
    1,
    Math.round(baseTool.maxDurability * modifier.durabilityMultiplier),
  );

  return {
    displayName: `${material.name} ${label}`,
    shortName: label,
    maxDurability,
    tool: {
      ...baseTool.tool,
      speedMultiplier: round(
        baseTool.tool.speedMultiplier * modifier.speedMultiplier,
      ),
      preferredBlockBonus: modifier.preferredBlockBonus,
      instabilityRisk: modifier.instabilityRisk,
      materialId: material.id,
    },
    modifier,
  };
}
