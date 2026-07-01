import type { MaterialConfig } from "./MaterialConfig.ts";
import { stableHashChoice, stableHashFloat } from "./MaterialHash.ts";
import type {
  MaterialDefinition,
  MaterialProcessingStationType,
  MaterialRarity,
  MaterialResearchTier,
  MaterialStatKey,
  MaterialStats,
  MaterialUnstableReactionOutcome,
  MaterialUnstableReactionOutcomeKind,
} from "./MaterialTypes.ts";

export const MATERIAL_REACTION_TAGS = [
  "fire",
  "water",
  "earth",
  "air",
  "metal",
  "organic",
  "crystal",
  "magic",
  "toxic",
  "radioactive",
  "gas",
  "liquid",
  "void",
  "light",
  "dark",
  "electric",
  "explosive",
  "unstable",
  "forged",
  "alloy",
  "poison",
  "clay",
  "arcane",
  "fuel",
  "conductive",
] as const;

export type MaterialReactionTag = (typeof MATERIAL_REACTION_TAGS)[number];

export type MaterialStatModifiers = Partial<Record<MaterialStatKey, number>>;

type MaterialStatThresholds = Partial<
  Record<MaterialStatKey, Readonly<{ min?: number; max?: number }>>
>;

type MaterialReactionRule = Readonly<{
  id: string;
  priority: number;
  requiredTags?: readonly MaterialReactionTag[];
  statThresholds?: MaterialStatThresholds;
  names: readonly string[];
  tags: readonly MaterialReactionTag[];
  statModifiers: MaterialStatModifiers;
  requiredResearchTier?: MaterialResearchTier;
  rarityBonus?: number;
}>;

export type MaterialReaction = Readonly<{
  id: string;
  priority: number;
  name: string;
  tags: readonly MaterialReactionTag[];
  statModifiers: MaterialStatModifiers;
  requiredResearchTier?: MaterialResearchTier;
  rarityBonus: number;
}>;

const REACTION_TAG_SET = new Set<string>(MATERIAL_REACTION_TAGS);

const TAG_ALIASES = {
  actinide: ["radioactive", "metal"],
  arcane: ["magic", "arcane"],
  crystalline: ["crystal"],
  fluidic: ["liquid", "water"],
  halogen: ["toxic"],
  lanthanide: ["metal"],
  "liquid-prone": ["liquid"],
  metallic: ["metal", "conductive"],
  metalloid: ["earth", "crystal"],
  "noble-gas": ["gas", "air"],
  nonmetal: ["organic"],
  "organic-core": ["organic"],
  radioactive: ["radioactive", "unstable"],
  volatile: ["gas", "air"],
} as const satisfies Record<string, readonly MaterialReactionTag[]>;

const ELEMENT_TRAIT_ALIASES = {
  carbon: ["earth", "organic", "fuel"],
  hydrogen: ["gas", "air", "fuel"],
  iron: ["metal", "conductive"],
  nitrogen: ["gas", "air"],
  oxygen: ["gas", "air"],
  phosphorus: ["fire", "fuel"],
  silicon: ["earth", "crystal"],
  sulfur: ["fire", "toxic", "fuel"],
  uranium: ["radioactive", "metal", "unstable"],
} as const satisfies Record<string, readonly MaterialReactionTag[]>;

const REACTION_RULES: readonly MaterialReactionRule[] = [
  {
    id: "gas-fire-explosive",
    priority: 130,
    requiredTags: ["gas", "fire"],
    names: ["Explosive Compound", "Blast Vapor", "Ignition Gas"],
    tags: ["gas", "fire", "explosive", "fuel", "unstable"],
    statModifiers: {
      gas: 18,
      heat: 26,
      stability: -30,
      toxicity: 8,
    },
    requiredResearchTier: "volatile",
    rarityBonus: 10,
  },
  {
    id: "toxic-organic-poison",
    priority: 126,
    requiredTags: ["toxic", "organic"],
    names: ["Poison Compound", "Venom Resin", "Toxic Biomass"],
    tags: ["toxic", "organic", "poison"],
    statModifiers: {
      organic: 16,
      stability: -8,
      toxicity: 32,
    },
    requiredResearchTier: "alchemical",
    rarityBonus: 8,
  },
  {
    id: "radioactive-metal-unstable-alloy",
    priority: 124,
    requiredTags: ["radioactive", "metal"],
    names: ["Unstable Alloy", "Radiumsteel", "Irradiated Alloy"],
    tags: ["radioactive", "metal", "unstable", "alloy"],
    statModifiers: {
      conductivity: 8,
      density: 12,
      hardness: 8,
      metal: 14,
      radioactivity: 30,
      stability: -25,
    },
    requiredResearchTier: "radiological",
    rarityBonus: 18,
  },
  {
    id: "metal-void-voidforged-alloy",
    priority: 122,
    requiredTags: ["metal", "void"],
    names: ["Voidforged Alloy", "Nullsteel", "Darkforged Alloy"],
    tags: ["metal", "void", "forged", "alloy", "dark"],
    statModifiers: {
      density: 15,
      hardness: 12,
      magic: 12,
      metal: 16,
      stability: -10,
    },
    requiredResearchTier: "arcane",
    rarityBonus: 18,
  },
  {
    id: "crystal-magic-arcanite",
    priority: 120,
    requiredTags: ["crystal", "magic"],
    names: ["Arcanite Crystal", "Enchanted Crystal", "Spellglass"],
    tags: ["crystal", "magic", "arcane"],
    statModifiers: {
      conductivity: 8,
      crystal: 22,
      magic: 28,
      stability: 4,
    },
    requiredResearchTier: "arcane",
    rarityBonus: 20,
  },
  {
    id: "fire-metal-embersteel",
    priority: 118,
    requiredTags: ["fire", "metal"],
    names: ["Embersteel", "Ashforged Alloy", "Cinder Iron"],
    tags: ["fire", "metal", "forged", "alloy", "conductive"],
    statModifiers: {
      conductivity: 10,
      density: 10,
      hardness: 14,
      heat: 20,
      metal: 18,
      stability: 5,
    },
    requiredResearchTier: "metallurgical",
    rarityBonus: 12,
  },
  {
    id: "fire-crystal-sunshard",
    priority: 116,
    requiredTags: ["fire", "crystal"],
    names: ["Sunshard", "Dawn Crystal", "Solar Prism"],
    tags: ["fire", "crystal", "light"],
    statModifiers: {
      crystal: 20,
      heat: 22,
      magic: 8,
      stability: 2,
    },
    requiredResearchTier: "crystalline",
    rarityBonus: 14,
  },
  {
    id: "water-earth-clay",
    priority: 114,
    requiredTags: ["water", "earth"],
    names: ["Clay", "River Clay", "Mudstone"],
    tags: ["water", "earth", "clay", "liquid"],
    statModifiers: {
      density: 8,
      hardness: -7,
      liquid: 18,
      stability: 8,
    },
    rarityBonus: 2,
  },
  {
    id: "electric-metal-conductor",
    priority: 92,
    requiredTags: ["electric", "metal"],
    names: ["Voltaic Alloy", "Sparksteel", "Charged Conductor"],
    tags: ["electric", "metal", "conductive", "alloy"],
    statModifiers: {
      conductivity: 24,
      heat: 4,
      metal: 10,
    },
    requiredResearchTier: "metallurgical",
    rarityBonus: 8,
  },
  {
    id: "magic-metal-arcane-alloy",
    priority: 88,
    requiredTags: ["magic", "metal"],
    names: ["Arcane Alloy", "Mageforged Metal", "Runesteel"],
    tags: ["magic", "metal", "arcane", "forged", "alloy"],
    statModifiers: {
      conductivity: 8,
      magic: 18,
      metal: 10,
    },
    requiredResearchTier: "arcane",
    rarityBonus: 12,
  },
  {
    id: "organic-earth-loam",
    priority: 76,
    requiredTags: ["organic", "earth"],
    names: ["Living Loam", "Rootbound Soil", "Verdant Compound"],
    tags: ["organic", "earth"],
    statModifiers: {
      organic: 18,
      stability: 8,
    },
    rarityBonus: 4,
  },
  {
    id: "liquid-magic-elixir",
    priority: 72,
    requiredTags: ["liquid", "magic"],
    names: ["Arcane Elixir", "Moonflow", "Spellwater"],
    tags: ["liquid", "magic", "arcane"],
    statModifiers: {
      liquid: 18,
      magic: 18,
      stability: -4,
    },
    requiredResearchTier: "arcane",
    rarityBonus: 12,
  },
  {
    id: "generic-metal-alloy",
    priority: 34,
    statThresholds: {
      metal: { min: 55 },
    },
    names: ["Composite Alloy", "Refined Metal", "Forged Blend"],
    tags: ["metal", "alloy", "conductive"],
    statModifiers: {
      conductivity: 6,
      density: 5,
      hardness: 5,
      metal: 8,
    },
    requiredResearchTier: "metallurgical",
    rarityBonus: 2,
  },
  {
    id: "generic-crystal",
    priority: 32,
    statThresholds: {
      crystal: { min: 55 },
    },
    names: ["Prismatic Crystal", "Facet Compound", "Vitreous Matrix"],
    tags: ["crystal"],
    statModifiers: {
      crystal: 8,
      hardness: 4,
    },
    requiredResearchTier: "crystalline",
    rarityBonus: 3,
  },
  {
    id: "generic-volatile",
    priority: 30,
    statThresholds: {
      gas: { min: 55 },
    },
    names: ["Volatile Vapor", "Aerial Compound", "Driftgas"],
    tags: ["gas", "air"],
    statModifiers: {
      density: -8,
      gas: 10,
    },
    requiredResearchTier: "volatile",
    rarityBonus: 1,
  },
  {
    id: "generic-liquid",
    priority: 28,
    statThresholds: {
      liquid: { min: 55 },
    },
    names: ["Fluid Matrix", "Liquid Compound", "Flowgel"],
    tags: ["liquid", "water"],
    statModifiers: {
      density: -2,
      liquid: 10,
    },
    requiredResearchTier: "alchemical",
    rarityBonus: 1,
  },
];

const TAG_STAT_MODIFIERS: ReadonlyMap<
  MaterialReactionTag,
  MaterialStatModifiers
> = new Map([
  [
    "metal",
    {
      conductivity: 8,
      density: 7,
      hardness: 7,
      metal: 10,
    },
  ],
  [
    "fire",
    {
      heat: 16,
      stability: -2,
    },
  ],
  [
    "toxic",
    {
      stability: -4,
      toxicity: 16,
    },
  ],
  [
    "poison",
    {
      stability: -5,
      toxicity: 20,
    },
  ],
  [
    "radioactive",
    {
      magic: 4,
      radioactivity: 22,
      stability: -18,
    },
  ],
  [
    "magic",
    {
      magic: 18,
    },
  ],
  [
    "arcane",
    {
      magic: 14,
      stability: 3,
    },
  ],
  [
    "organic",
    {
      organic: 16,
    },
  ],
  [
    "crystal",
    {
      crystal: 16,
      hardness: 6,
    },
  ],
  [
    "gas",
    {
      density: -12,
      gas: 18,
    },
  ],
  [
    "air",
    {
      density: -8,
      gas: 8,
    },
  ],
  [
    "liquid",
    {
      density: -3,
      liquid: 18,
    },
  ],
  [
    "water",
    {
      heat: -5,
      liquid: 12,
      stability: 4,
    },
  ],
  [
    "earth",
    {
      density: 12,
      hardness: 8,
      stability: 6,
    },
  ],
  [
    "electric",
    {
      conductivity: 16,
      heat: 4,
    },
  ],
  [
    "conductive",
    {
      conductivity: 12,
    },
  ],
  [
    "explosive",
    {
      heat: 12,
      stability: -24,
    },
  ],
  [
    "unstable",
    {
      stability: -16,
    },
  ],
  [
    "forged",
    {
      hardness: 8,
      stability: 4,
    },
  ],
  [
    "alloy",
    {
      conductivity: 5,
      density: 5,
      metal: 8,
    },
  ],
  [
    "clay",
    {
      density: 5,
      liquid: 8,
      stability: 6,
    },
  ],
  [
    "fuel",
    {
      heat: 10,
      stability: -6,
    },
  ],
  [
    "void",
    {
      magic: 14,
      stability: -8,
    },
  ],
  [
    "dark",
    {
      magic: 5,
    },
  ],
  [
    "light",
    {
      magic: 5,
      stability: 2,
    },
  ],
]);

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replaceAll(/\s+/g, "-");
}

function addReactionTag(tags: Set<MaterialReactionTag>, tag: string): void {
  const normalizedTag = normalizeTag(tag);

  if (REACTION_TAG_SET.has(normalizedTag)) {
    tags.add(normalizedTag as MaterialReactionTag);
  }

  const aliases = TAG_ALIASES[normalizedTag as keyof typeof TAG_ALIASES];

  if (aliases) {
    for (const alias of aliases) {
      tags.add(alias);
    }
  }

  const elementAliases =
    ELEMENT_TRAIT_ALIASES[normalizedTag as keyof typeof ELEMENT_TRAIT_ALIASES];

  if (elementAliases) {
    for (const alias of elementAliases) {
      tags.add(alias);
    }
  }
}

export function materialTraitTags(
  material: MaterialDefinition,
): readonly MaterialReactionTag[] {
  const tags = new Set<MaterialReactionTag>();

  for (const tag of material.tags) {
    addReactionTag(tags, tag);
  }

  addReactionTag(tags, material.name);

  if (material.metal >= 45) {
    tags.add("metal");
    tags.add("conductive");
  }
  if (material.conductivity >= 60) {
    tags.add("electric");
    tags.add("conductive");
  }
  if (material.hardness >= 58 || material.density >= 58) {
    tags.add("earth");
  }
  if (material.heat >= 65) {
    tags.add("fire");
  }
  if (material.organic >= 45) {
    tags.add("organic");
  }
  if (material.crystal >= 48) {
    tags.add("crystal");
  }
  if (material.magic >= 55) {
    tags.add("magic");
    tags.add("arcane");
  }
  if (material.toxicity >= 50) {
    tags.add("toxic");
    tags.add("poison");
  }
  if (material.radioactivity >= 45) {
    tags.add("radioactive");
    tags.add("unstable");
  }
  if (material.gas >= 55) {
    tags.add("gas");
    tags.add("air");
  }
  if (material.liquid >= 55) {
    tags.add("liquid");
    tags.add("water");
  }
  if (material.stability <= 30) {
    tags.add("unstable");
  }

  return [...tags].sort();
}

function parentTagSets(
  parents: readonly MaterialDefinition[],
): readonly ReadonlySet<MaterialReactionTag>[] {
  return parents.map((parent) => new Set(materialTraitTags(parent)));
}

function statThresholdsMatch(
  stats: MaterialStats,
  thresholds: MaterialStatThresholds | undefined,
): boolean {
  if (!thresholds) {
    return true;
  }

  return Object.entries(thresholds).every(([key, threshold]) => {
    const stat = stats[key as MaterialStatKey];

    return (
      (threshold.min === undefined || stat >= threshold.min) &&
      (threshold.max === undefined || stat <= threshold.max)
    );
  });
}

function ruleMatches(
  rule: MaterialReactionRule,
  parentTags: ReadonlySet<MaterialReactionTag>,
  parentTagsByMaterial: readonly ReadonlySet<MaterialReactionTag>[],
  stats: MaterialStats,
): boolean {
  const requiredTags = rule.requiredTags;

  if (!statThresholdsMatch(stats, rule.statThresholds)) {
    return false;
  }

  if (!requiredTags) {
    return true;
  }

  if (!requiredTags.every((tag) => parentTags.has(tag))) {
    return false;
  }

  return parentTagsByMaterial.every((tags) =>
    requiredTags.some((requiredTag) => tags.has(requiredTag)),
  );
}

export function resolveMaterialReaction(
  materialA: MaterialDefinition,
  materialB: MaterialDefinition,
  preliminaryStats: MaterialStats,
  recipeKey: string,
  config: Pick<MaterialConfig, "seed">,
): MaterialReaction | null {
  const parentTagsByMaterial = parentTagSets([materialA, materialB]);
  const parentTags = new Set(parentTagsByMaterial.flatMap((tags) => [...tags]));
  const rule = [...REACTION_RULES]
    .filter((candidate) =>
      ruleMatches(
        candidate,
        parentTags,
        parentTagsByMaterial,
        preliminaryStats,
      ),
    )
    .sort((a, b) => b.priority - a.priority)[0];

  if (!rule) {
    return null;
  }

  return {
    id: rule.id,
    priority: rule.priority,
    name:
      rule.priority >= 100
        ? rule.names[0]!
        : stableHashChoice(
            `${config.seed}|${recipeKey}|${rule.id}|name`,
            rule.names,
          ),
    tags: rule.tags,
    statModifiers: rule.statModifiers,
    requiredResearchTier: rule.requiredResearchTier,
    rarityBonus: rule.rarityBonus ?? 0,
  };
}

export function statModifiersForTags(
  tags: Iterable<string>,
): MaterialStatModifiers {
  const modifiers: MaterialStatModifiers = {};

  for (const tag of tags) {
    const normalizedTag = normalizeTag(tag);

    if (!REACTION_TAG_SET.has(normalizedTag)) {
      continue;
    }

    const tagModifiers = TAG_STAT_MODIFIERS.get(
      normalizedTag as MaterialReactionTag,
    );

    if (!tagModifiers) {
      continue;
    }

    for (const [key, amount] of Object.entries(tagModifiers)) {
      const stat = key as MaterialStatKey;
      modifiers[stat] = (modifiers[stat] ?? 0) + amount;
    }
  }

  return modifiers;
}

export function canonicalMaterialIds(
  materialAId: string,
  materialBId: string,
  config: Pick<MaterialConfig, "orderMatters">,
): readonly [string, string] {
  if (config.orderMatters || materialAId <= materialBId) {
    return [materialAId, materialBId];
  }

  return [materialBId, materialAId];
}

export function recipeKeyForMaterialIds(
  materialAId: string,
  materialBId: string,
  config: Pick<MaterialConfig, "deterministicVersion" | "orderMatters">,
  stationType: MaterialProcessingStationType = "combiner",
): string {
  const [first, second] = canonicalMaterialIds(
    materialAId,
    materialBId,
    config,
  );

  return `${config.deterministicVersion}|station:${stationType}|${first}+${second}`;
}

export function legacyRecipeKeyForMaterialIds(
  materialAId: string,
  materialBId: string,
  config: Pick<MaterialConfig, "deterministicVersion" | "orderMatters">,
): string {
  const [first, second] = canonicalMaterialIds(
    materialAId,
    materialBId,
    config,
  );

  return `${config.deterministicVersion}|${first}+${second}`;
}

export function rarityForStats(
  stats: Pick<MaterialStats, "magic" | "radioactivity" | "crystal" | "metal">,
  recipeKey: string,
  config: Pick<MaterialConfig, "seed">,
  reaction: Pick<MaterialReaction, "rarityBonus"> | null = null,
  generation = 0,
): MaterialRarity {
  const score =
    stats.magic * 0.3 +
    stats.radioactivity * 0.24 +
    stats.crystal * 0.22 +
    stats.metal * 0.12 +
    Math.max(0, generation) * 7.5 +
    (reaction?.rarityBonus ?? 0) +
    stableHashFloat(`${config.seed}|${recipeKey}|rarity`, 0, 20);

  if (score >= 105) {
    return "mythic";
  }
  if (score >= 86) {
    return "legendary";
  }
  if (score >= 68) {
    return "epic";
  }
  if (score >= 50) {
    return "rare";
  }
  if (score >= 32) {
    return "uncommon";
  }
  return "common";
}

export function tagsForMaterial(
  stats: MaterialStats,
  parents: readonly MaterialDefinition[],
  reaction: Pick<MaterialReaction, "tags"> | null = null,
): readonly string[] {
  const tags = new Set<string>();

  for (const parent of parents) {
    for (const tag of parent.tags) {
      tags.add(tag);
    }
    for (const tag of materialTraitTags(parent)) {
      tags.add(tag);
    }
  }

  if (reaction) {
    for (const tag of reaction.tags) {
      tags.add(tag);
    }
  }

  if (stats.metal >= 55) {
    tags.add("metal");
    tags.add("metallic");
    tags.add("conductive");
  }
  if (stats.crystal >= 55) {
    tags.add("crystal");
    tags.add("crystalline");
  }
  if (stats.gas >= 55) {
    tags.add("gas");
    tags.add("air");
    tags.add("volatile");
  }
  if (stats.liquid >= 55) {
    tags.add("liquid");
    tags.add("water");
    tags.add("fluidic");
  }
  if (stats.organic >= 55) tags.add("organic");
  if (stats.magic >= 55) {
    tags.add("magic");
    tags.add("arcane");
  }
  if (stats.radioactivity >= 55) {
    tags.add("radioactive");
    tags.add("unstable");
  }
  if (stats.toxicity >= 55) {
    tags.add("toxic");
    tags.add("poison");
  }
  if (stats.heat >= 65) tags.add("fire");
  if (stats.conductivity >= 60) {
    tags.add("electric");
    tags.add("conductive");
  }
  if (stats.hardness >= 60 || stats.density >= 60) tags.add("earth");
  if (stats.stability <= 30) tags.add("unstable");

  return [...tags].sort();
}

type UnstableOutcomeTemplate = Readonly<{
  kind: MaterialUnstableReactionOutcomeKind;
  warningText: string;
  playerDamage?: number;
  explosionRadius?: number;
  toxicCloudSeconds?: number;
  byproductName?: string;
}>;

const UNSTABLE_OUTCOME_TEMPLATES: readonly UnstableOutcomeTemplate[] = [
  {
    kind: "failed_consumed",
    warningText: "The reaction destabilized. Ingredients were consumed.",
  },
  {
    kind: "weak_byproduct",
    warningText: "The reaction collapsed into a weaker byproduct.",
    byproductName: "Unstable Slag",
  },
  {
    kind: "player_damage",
    warningText: "The reaction flashed dangerously and damaged the player.",
    playerDamage: 8,
  },
  {
    kind: "small_explosion",
    warningText: "The reaction popped with a small contained blast.",
    explosionRadius: 2,
  },
  {
    kind: "toxic_cloud",
    warningText: "The reaction vented a toxic cloud placeholder.",
    toxicCloudSeconds: 6,
  },
];

function hasAnyTag(
  tags: readonly string[],
  candidates: readonly string[],
): boolean {
  return candidates.some((candidate) => tags.includes(candidate));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function unstableReactionFailureChance(
  stats: MaterialStats,
  tags: readonly string[],
  config: Pick<MaterialConfig, "unstableCombinationsCanFail" | "statMax">,
): number {
  if (!config.unstableCombinationsCanFail) {
    return 0;
  }

  const statMax = Math.max(1, config.statMax);
  const normalizedTags = tags.map((tag) => tag.toLowerCase());
  const unstableTagPressure = hasAnyTag(normalizedTags, [
    "unstable",
    "explosive",
    "radioactive",
    "toxic",
    "poison",
    "volatile",
  ])
    ? 0.28
    : 0;
  const lowStabilityPressure = clamp01((50 - stats.stability) / 50) * 0.46;
  const volatilePressure =
    clamp01((stats.heat - 68) / Math.max(1, statMax - 68)) * 0.14 +
    clamp01((stats.gas - 58) / Math.max(1, statMax - 58)) * 0.12 +
    clamp01((stats.toxicity - 50) / Math.max(1, statMax - 50)) * 0.14 +
    clamp01((stats.radioactivity - 45) / Math.max(1, statMax - 45)) * 0.18;

  return Math.min(
    0.85,
    unstableTagPressure + lowStabilityPressure + volatilePressure,
  );
}

function outcomeTemplatesForTags(
  tags: readonly string[],
): readonly UnstableOutcomeTemplate[] {
  const normalizedTags = tags.map((tag) => tag.toLowerCase());

  if (hasAnyTag(normalizedTags, ["toxic", "poison"])) {
    return [
      UNSTABLE_OUTCOME_TEMPLATES[4]!,
      UNSTABLE_OUTCOME_TEMPLATES[0]!,
      UNSTABLE_OUTCOME_TEMPLATES[1]!,
      UNSTABLE_OUTCOME_TEMPLATES[2]!,
    ];
  }
  if (hasAnyTag(normalizedTags, ["explosive", "gas", "fire"])) {
    return [
      UNSTABLE_OUTCOME_TEMPLATES[3]!,
      UNSTABLE_OUTCOME_TEMPLATES[0]!,
      UNSTABLE_OUTCOME_TEMPLATES[2]!,
      UNSTABLE_OUTCOME_TEMPLATES[1]!,
    ];
  }
  if (hasAnyTag(normalizedTags, ["radioactive"])) {
    return [
      UNSTABLE_OUTCOME_TEMPLATES[2]!,
      UNSTABLE_OUTCOME_TEMPLATES[0]!,
      UNSTABLE_OUTCOME_TEMPLATES[4]!,
      UNSTABLE_OUTCOME_TEMPLATES[1]!,
    ];
  }

  return UNSTABLE_OUTCOME_TEMPLATES;
}

export function unstableReactionOutcome(
  recipeKey: string,
  stats: MaterialStats,
  tags: readonly string[],
  config: Pick<
    MaterialConfig,
    "seed" | "unstableCombinationsCanFail" | "statMax"
  >,
): MaterialUnstableReactionOutcome | null {
  const chance = unstableReactionFailureChance(stats, tags, config);

  if (chance <= 0) {
    return null;
  }

  const roll = stableHashFloat(`${config.seed}|${recipeKey}|reaction`, 0, 1);

  if (roll >= chance) {
    return null;
  }

  const templates = outcomeTemplatesForTags(tags);
  const template =
    templates[
      Math.floor(
        stableHashFloat(`${config.seed}|${recipeKey}|reaction-outcome`, 0, 1) *
          templates.length,
      ) % templates.length
    ]!;

  return {
    ...template,
    consumesIngredients: true,
    terrainEffect: "ui_only",
  };
}

export function unstableReactionFails(
  recipeKey: string,
  stats: MaterialStats,
  config: Pick<
    MaterialConfig,
    "seed" | "unstableCombinationsCanFail" | "statMax"
  >,
): boolean {
  return (
    unstableReactionOutcome(recipeKey, stats, ["unstable"], config) !== null
  );
}
