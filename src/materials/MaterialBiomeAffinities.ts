import type { TerrainBiome } from "../geometry/terrainChunk.ts";
import {
  DEFAULT_MATERIAL_CONFIG,
  normalizeMaterialConfig,
  type MaterialConfig,
} from "./MaterialConfig.ts";
import { stableHashFloat } from "./MaterialHash.ts";

export type MaterialAffinitySource = TerrainBiome | "cave" | "mountain";

export type MaterialAffinityRule = Readonly<{
  source: MaterialAffinitySource;
  materialId: string;
  tags: readonly string[];
  weight: number;
}>;

export type MaterialTraceDiscovery = Readonly<{
  source: MaterialAffinitySource;
  materialId: string;
  tags: readonly string[];
}>;

export type MaterialTraceDiscoveryInput = Readonly<{
  sources: MaterialAffinitySource | readonly MaterialAffinitySource[];
  eventKey: string;
  worldSeed: number;
  config?: Partial<
    Pick<MaterialConfig, "materialTraceDiscoveryChance" | "seed">
  >;
}>;

const MATERIAL_AFFINITIES_BY_SOURCE = {
  grassland: [
    affinity("grassland", "element:nitrogen", ["soil", "organic"], 2),
    affinity("grassland", "element:oxygen", ["air", "organic"], 2),
    affinity("grassland", "element:carbon", ["organic"], 1),
    affinity("grassland", "element:phosphorus", ["nutrient", "organic"], 1),
  ],
  forest: [
    affinity("forest", "element:carbon", ["organic", "wood"], 5),
    affinity("forest", "element:oxygen", ["organic", "air"], 3),
    affinity("forest", "element:nitrogen", ["organic", "soil"], 2),
    affinity("forest", "element:phosphorus", ["organic", "nutrient"], 1),
    affinity("forest", "element:sulfur", ["organic", "toxic"], 0.5),
  ],
  desert: [
    affinity("desert", "element:silicon", ["silica", "sand"], 6),
    affinity("desert", "element:sulfur", ["mineral", "hot"], 3),
    affinity("desert", "element:sodium", ["salt", "mineral"], 1),
  ],
  tundra: [
    affinity("tundra", "element:oxygen", ["ice", "air", "frost"], 4),
    affinity("tundra", "element:hydrogen", ["ice", "frost"], 3),
    affinity("tundra", "element:nitrogen", ["air"], 2),
    affinity("tundra", "element:silicon", ["frozen-mineral"], 1),
  ],
  alpine: [
    affinity("alpine", "element:oxygen", ["frost", "ice"], 3),
    affinity("alpine", "element:hydrogen", ["frost", "ice"], 2),
    affinity("alpine", "element:silicon", ["crystal", "stone"], 3),
    affinity("alpine", "element:iron", ["metal", "stone"], 2),
    affinity("alpine", "element:aluminium", ["metal", "stone"], 1),
    affinity("alpine", "element:titanium", ["metal", "mountain"], 1),
  ],
  snow: [
    affinity("snow", "element:oxygen", ["ice", "air", "frost"], 5),
    affinity("snow", "element:hydrogen", ["ice", "frost"], 4),
    affinity("snow", "element:nitrogen", ["air"], 2),
    affinity("snow", "element:silicon", ["frozen-mineral"], 1),
  ],
  beach: [
    affinity("beach", "element:silicon", ["silica", "sand"], 3),
    affinity("beach", "element:sodium", ["salt"], 2),
    affinity("beach", "element:chlorine", ["salt"], 2),
  ],
  swamp: [
    affinity("swamp", "element:carbon", ["organic", "peat"], 4),
    affinity("swamp", "element:oxygen", ["organic", "water"], 2),
    affinity("swamp", "element:sulfur", ["toxic", "mineral"], 3),
    affinity("swamp", "element:nitrogen", ["organic"], 2),
    affinity("swamp", "element:phosphorus", ["organic", "nutrient"], 1),
    affinity("swamp", "element:arsenic", ["toxic", "rare"], 0.5),
  ],
  badlands: [
    affinity("badlands", "element:iron", ["metal", "oxidized"], 3),
    affinity("badlands", "element:copper", ["metal", "oxidized"], 2),
    affinity("badlands", "element:titanium", ["metal", "rare"], 1),
    affinity("badlands", "element:sulfur", ["mineral", "hot"], 2),
    affinity("badlands", "element:silicon", ["silica", "stone"], 2),
  ],
  cave: [
    affinity("cave", "element:silicon", ["crystal", "mineral"], 4),
    affinity("cave", "element:uranium", ["radioactive", "rare"], 1),
    affinity("cave", "element:radium", ["radioactive", "rare"], 0.5),
    affinity("cave", "element:thorium", ["radioactive", "rare"], 0.5),
  ],
  mountain: [
    affinity("mountain", "element:iron", ["metal", "mountain"], 4),
    affinity("mountain", "element:copper", ["metal", "mountain"], 3),
    affinity("mountain", "element:titanium", ["metal", "mountain"], 2),
    affinity("mountain", "element:silicon", ["crystal", "stone"], 1),
  ],
} as const satisfies Record<
  MaterialAffinitySource,
  readonly MaterialAffinityRule[]
>;

function affinity(
  source: MaterialAffinitySource,
  materialId: string,
  tags: readonly string[],
  weight: number,
): MaterialAffinityRule {
  return {
    source,
    materialId,
    tags,
    weight,
  };
}

function normalizeSources(
  sources: MaterialAffinitySource | readonly MaterialAffinitySource[],
): readonly MaterialAffinitySource[] {
  const sourceList = Array.isArray(sources) ? sources : [sources];
  const uniqueSources = new Set<MaterialAffinitySource>();

  for (const source of sourceList) {
    uniqueSources.add(source);
  }

  return [...uniqueSources].sort();
}

function normalizedTraceChance(
  config: MaterialTraceDiscoveryInput["config"],
): number {
  return normalizeMaterialConfig({
    ...DEFAULT_MATERIAL_CONFIG,
    ...config,
  }).materialTraceDiscoveryChance;
}

function weightedAffinityChoice(
  affinities: readonly MaterialAffinityRule[],
  hashKey: string,
): MaterialAffinityRule {
  const totalWeight = affinities.reduce(
    (total, affinityRule) => total + Math.max(0, affinityRule.weight),
    0,
  );
  let threshold = stableHashFloat(hashKey, 0, totalWeight);

  for (const affinityRule of affinities) {
    threshold -= Math.max(0, affinityRule.weight);
    if (threshold <= 0) {
      return affinityRule;
    }
  }

  return affinities[affinities.length - 1]!;
}

export function materialAffinitiesForSource(
  source: MaterialAffinitySource,
): readonly MaterialAffinityRule[] {
  return MATERIAL_AFFINITIES_BY_SOURCE[source];
}

export function materialAffinitiesForBiome(
  biome: TerrainBiome,
): readonly MaterialAffinityRule[] {
  return materialAffinitiesForSource(biome);
}

export function materialAffinitiesForSources(
  sources: MaterialAffinitySource | readonly MaterialAffinitySource[],
): readonly MaterialAffinityRule[] {
  return normalizeSources(sources).flatMap((source) =>
    materialAffinitiesForSource(source),
  );
}

export function materialTraceDiscoveryForEvent(
  input: MaterialTraceDiscoveryInput,
): MaterialTraceDiscovery | null {
  const sources = normalizeSources(input.sources);
  const affinities = materialAffinitiesForSources(sources);
  const chance = normalizedTraceChance(input.config);

  if (affinities.length === 0 || chance <= 0) {
    return null;
  }

  const sourceKey = sources.join("+");
  const seed =
    Number.isFinite(input.worldSeed) && Number.isFinite(input.config?.seed)
      ? `${input.worldSeed}:${input.config?.seed}`
      : String(input.worldSeed);
  const roll = stableHashFloat(
    `${seed}|material-trace|${sourceKey}|${input.eventKey}|roll`,
    0,
    1,
  );

  if (roll >= chance) {
    return null;
  }

  const selected = weightedAffinityChoice(
    affinities,
    `${seed}|material-trace|${sourceKey}|${input.eventKey}|choice`,
  );

  return {
    source: selected.source,
    materialId: selected.materialId,
    tags: selected.tags,
  };
}
