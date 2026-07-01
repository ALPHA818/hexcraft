import type { MaterialConfig } from "./MaterialConfig.ts";
import {
  classifyMaterialCapabilities,
  type MaterialCapabilities,
} from "./MaterialCapabilities.ts";
import type {
  MaterialDefinition,
  MaterialRarity,
  MaterialStatKey,
  MaterialStats,
} from "./MaterialTypes.ts";

export type MaterialBalanceScores = Readonly<{
  valueScore: number;
  dangerScore: number;
  usefulnessScore: number;
}>;

export const MATERIAL_BALANCE_SCORE_LABELS = {
  valueScore: "Value score",
  dangerScore: "Danger score",
  usefulnessScore: "Usefulness score",
} as const satisfies Record<keyof MaterialBalanceScores, string>;

const EXTREME_STAT_KEYS = [
  "hardness",
  "density",
  "heat",
  "conductivity",
  "toxicity",
  "radioactivity",
  "magic",
  "organic",
  "metal",
  "crystal",
  "gas",
  "liquid",
] as const satisfies readonly MaterialStatKey[];

const RARITY_VALUE = {
  common: 8,
  uncommon: 22,
  rare: 42,
  epic: 62,
  legendary: 82,
  mythic: 100,
} as const satisfies Record<MaterialRarity, number>;

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampStat(
  value: number,
  config: Pick<MaterialConfig, "statMin" | "statMax">,
): number {
  return Math.max(config.statMin, Math.min(config.statMax, value));
}

function stat(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function normalizedTags(
  material: Pick<MaterialDefinition, "tags">,
): Set<string> {
  return new Set(material.tags.map((tag) => tag.toLowerCase()));
}

function hasAnyTag(
  tags: ReadonlySet<string>,
  candidates: readonly string[],
): boolean {
  return candidates.some((candidate) => tags.has(candidate));
}

function capabilityPeak(capabilities: MaterialCapabilities): number {
  return Math.max(
    capabilities.weaponGrade,
    capabilities.toolGrade,
    capabilities.armorGrade,
    capabilities.fuelGrade,
    capabilities.magicFocusGrade,
    capabilities.conductorGrade,
    capabilities.explosiveGrade,
    capabilities.reactorGrade,
    capabilities.buildingGrade,
    capabilities.biologicalGrade,
  );
}

export function materialRarityRank(rarity: MaterialRarity): number {
  return ["common", "uncommon", "rare", "epic", "legendary", "mythic"].indexOf(
    rarity,
  );
}

export function materialExtremeStatPressure(stats: MaterialStats): number {
  const extremes = EXTREME_STAT_KEYS.map(
    (key) => Math.abs(stat(stats[key]) - 50) * 2,
  );
  const peak = Math.max(...extremes);
  const average =
    extremes.reduce((total, value) => total + value, 0) / extremes.length;
  const hazardousPeak = Math.max(
    stat(stats.radioactivity),
    stat(stats.toxicity),
    stat(stats.magic) * 0.8,
    stat(stats.heat) * 0.65,
    stat(stats.gas) * 0.55,
  );

  return clampScore(peak * 0.42 + average * 0.34 + hazardousPeak * 0.24);
}

export function balanceGeneratedMaterialStats(
  stats: MaterialStats,
  generation: number,
  config: Pick<MaterialConfig, "statMin" | "statMax">,
  tags: readonly string[] = [],
): MaterialStats {
  const normalized = new Set(tags.map((tag) => tag.toLowerCase()));
  const generationPressure = Math.max(0, generation) * 1.6;
  const extremePressure = materialExtremeStatPressure(stats);
  const hazardousTagPressure = hasAnyTag(normalized, [
    "void",
    "radioactive",
    "radiological",
    "unstable",
    "explosive",
    "toxic",
    "poison",
    "arcane",
  ])
    ? 5
    : 0;
  const stabilityPenalty =
    extremePressure * 0.16 + generationPressure + hazardousTagPressure;

  return {
    ...stats,
    stability: clampStat(stats.stability - stabilityPenalty, config),
  };
}

export function materialDangerScore(
  material: Pick<MaterialDefinition, keyof MaterialStats | "tags">,
): number {
  const tags = normalizedTags(material);
  const instability = 100 - stat(material.stability);
  const tagPressure =
    (hasAnyTag(tags, ["radioactive", "radiological", "uranium"]) ? 14 : 0) +
    (hasAnyTag(tags, ["toxic", "poison"]) ? 12 : 0) +
    (hasAnyTag(tags, ["explosive", "volatile"]) ? 12 : 0) +
    (hasAnyTag(tags, ["void", "dark"]) ? 10 : 0) +
    (hasAnyTag(tags, ["unstable"]) ? 8 : 0) +
    (hasAnyTag(tags, ["fire"]) ? 5 : 0);

  return clampScore(
    material.radioactivity * 0.24 +
      material.toxicity * 0.19 +
      instability * 0.19 +
      material.heat * 0.12 +
      material.gas * 0.1 +
      material.magic * 0.07 +
      material.liquid * 0.04 +
      materialExtremeStatPressure(material) * 0.05 +
      tagPressure,
  );
}

export function materialUsefulnessScore(material: MaterialDefinition): number {
  const capabilities = classifyMaterialCapabilities(material);

  return clampScore(
    capabilityPeak(capabilities) * 0.36 +
      capabilities.toolGrade * 0.16 +
      capabilities.buildingGrade * 0.12 +
      capabilities.conductorGrade * 0.1 +
      capabilities.weaponGrade * 0.08 +
      capabilities.armorGrade * 0.08 +
      material.stability * 0.06 +
      Math.max(material.hardness, material.metal, material.crystal) * 0.04,
  );
}

export function materialValueScore(material: MaterialDefinition): number {
  const usefulness = materialUsefulnessScore(material);
  const danger = materialDangerScore(material);
  const rareStats = Math.max(
    material.magic,
    material.radioactivity,
    material.crystal,
    material.metal,
    material.conductivity,
  );

  return clampScore(
    usefulness * 0.38 +
      RARITY_VALUE[material.rarity] * 0.22 +
      rareStats * 0.16 +
      Math.min(100, material.generation * 8) * 0.12 +
      danger * 0.12,
  );
}

export function materialBalanceScores(
  material: MaterialDefinition,
): MaterialBalanceScores {
  return {
    valueScore: materialValueScore(material),
    dangerScore: materialDangerScore(material),
    usefulnessScore: materialUsefulnessScore(material),
  };
}
