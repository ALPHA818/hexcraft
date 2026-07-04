import type {
  MaterialCombinationFailure,
  MaterialDefinition,
  MaterialResearchTier,
  MaterialStats,
} from "./MaterialTypes.ts";

export type { MaterialResearchTier } from "./MaterialTypes.ts";

export const MATERIAL_RESEARCH_TIERS = [
  "primitive",
  "chemical",
  "metallurgical",
  "crystalline",
  "arcane",
  "radioactive",
  "void",
  "celestial",
] as const satisfies readonly MaterialResearchTier[];

export const MATERIAL_RESEARCH_TIER_LABELS = {
  primitive: "Primitive Research",
  chemical: "Chemical Research",
  metallurgical: "Metallurgical Research",
  crystalline: "Crystalline Research",
  arcane: "Arcane Research",
  radioactive: "Radioactive Research",
  void: "Void Research",
  celestial: "Celestial Research",
} as const satisfies Record<MaterialResearchTier, string>;

export const MATERIAL_RESEARCH_TIER_DISPLAY_NAMES = {
  primitive: "Primitive",
  chemical: "Chemical",
  metallurgical: "Metallurgical",
  crystalline: "Crystalline",
  arcane: "Arcane",
  radioactive: "Radioactive",
  void: "Void",
  celestial: "Celestial",
} as const satisfies Record<MaterialResearchTier, string>;

export type MaterialResearchMode = "creative" | "survival";

export type SerializedMaterialResearch = Readonly<{
  unlockedTiers: readonly MaterialResearchTier[];
}>;

export type MaterialResearchState = SerializedMaterialResearch;

export type MaterialResearchContext = Readonly<{
  mode?: MaterialResearchMode;
  research?: SerializedMaterialResearch | null;
}>;

export type ResearchTierSource = Readonly<{
  requiredResearchTier?: MaterialResearchTier;
}>;

const MATERIAL_RESEARCH_TIER_SET = new Set<string>(MATERIAL_RESEARCH_TIERS);

const LEGACY_RESEARCH_TIER_ALIASES = {
  alchemical: "chemical",
  volatile: "primitive",
  radiological: "radioactive",
} as const satisfies Record<string, MaterialResearchTier>;

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replaceAll(/\s+/g, "-");
}

function hasTag(
  tags: readonly string[],
  candidates: readonly string[],
): boolean {
  const normalizedTags = new Set(tags.map(normalizeTag));

  return candidates.some((candidate) => normalizedTags.has(candidate));
}

export function normalizeMaterialResearchTier(
  value: unknown,
): MaterialResearchTier | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  if (MATERIAL_RESEARCH_TIER_SET.has(value)) {
    return value as MaterialResearchTier;
  }

  return Object.prototype.hasOwnProperty.call(
    LEGACY_RESEARCH_TIER_ALIASES,
    value,
  )
    ? LEGACY_RESEARCH_TIER_ALIASES[
        value as keyof typeof LEGACY_RESEARCH_TIER_ALIASES
      ]
    : undefined;
}

export function createMaterialResearchState(
  unlockedTiers: Iterable<MaterialResearchTier> = [],
): MaterialResearchState {
  return {
    unlockedTiers: [...new Set(unlockedTiers)].sort(),
  };
}

export function defaultMaterialResearchState(): MaterialResearchState {
  return createMaterialResearchState();
}

export function normalizeMaterialResearchState(
  value: unknown,
): MaterialResearchState {
  if (!value || typeof value !== "object") {
    return defaultMaterialResearchState();
  }

  const record = value as Record<string, unknown>;
  const unlockedTiers = Array.isArray(record.unlockedTiers)
    ? record.unlockedTiers
        .map(normalizeMaterialResearchTier)
        .filter((tier): tier is MaterialResearchTier => tier !== undefined)
    : [];

  return createMaterialResearchState(unlockedTiers);
}

export function unlockMaterialResearchTier(
  state: SerializedMaterialResearch | null | undefined,
  tier: MaterialResearchTier,
): MaterialResearchState {
  return createMaterialResearchState([
    ...normalizeMaterialResearchState(state).unlockedTiers,
    tier,
  ]);
}

export function unlockAllMaterialResearchTiers(): MaterialResearchState {
  return createMaterialResearchState(MATERIAL_RESEARCH_TIERS);
}

export function isMaterialResearchTierUnlocked(
  tier: MaterialResearchTier,
  context: MaterialResearchContext = {},
): boolean {
  if (context.mode !== "survival") {
    return true;
  }

  return normalizeMaterialResearchState(
    context.research,
  ).unlockedTiers.includes(tier);
}

export function materialResearchRequirementMessage(
  tier: MaterialResearchTier,
): string {
  return `Requires ${MATERIAL_RESEARCH_TIER_LABELS[tier]}`;
}

export function lockedMaterialResearchTier(
  requiredResearchTier: MaterialResearchTier | undefined,
  context: MaterialResearchContext = {},
): MaterialResearchTier | null {
  if (!requiredResearchTier) {
    return null;
  }

  return isMaterialResearchTierUnlocked(requiredResearchTier, context)
    ? null
    : requiredResearchTier;
}

export function researchLockedCombinationFailure(
  tier: MaterialResearchTier,
  recipeKey?: string,
): MaterialCombinationFailure {
  return {
    ok: false,
    reason: "research_locked",
    message: materialResearchRequirementMessage(tier),
    recipeKey,
    requiredResearchTier: tier,
  };
}

export function lockedParentMaterialResearchTier(
  materials: readonly ResearchTierSource[],
  context: MaterialResearchContext = {},
): MaterialResearchTier | null {
  for (const material of materials) {
    const locked = lockedMaterialResearchTier(
      material.requiredResearchTier,
      context,
    );

    if (locked) {
      return locked;
    }
  }

  return null;
}

export function requiredResearchTierForGeneratedMaterial(
  stats: MaterialStats,
  tags: readonly string[],
  reaction: ResearchTierSource | null = null,
): MaterialResearchTier | undefined {
  if (
    stats.radioactivity >= 78 ||
    hasTag(tags, ["radioactive", "radiological", "reactor", "uranium"])
  ) {
    return "radioactive";
  }
  if (hasTag(tags, ["celestial", "star", "light"]) && stats.magic >= 72) {
    return "celestial";
  }
  if (hasTag(tags, ["void", "eldritch"])) {
    return "void";
  }
  if (stats.magic >= 78 || hasTag(tags, ["arcane"])) {
    return "arcane";
  }

  if (reaction?.requiredResearchTier) {
    return reaction.requiredResearchTier;
  }

  if (
    stats.radioactivity >= 55 ||
    hasTag(tags, ["radioactive", "radiological", "unstable"])
  ) {
    return "radioactive";
  }
  if (stats.magic >= 58 || hasTag(tags, ["magic", "arcane"])) {
    return "arcane";
  }
  if (
    stats.metal >= 55 ||
    hasTag(tags, ["metal", "metallic", "alloy", "forged"])
  ) {
    return "metallurgical";
  }
  if (stats.crystal >= 58 || hasTag(tags, ["crystal", "crystalline"])) {
    return "crystalline";
  }
  if (stats.toxicity >= 55 || hasTag(tags, ["toxic", "poison", "chemical"])) {
    return "chemical";
  }
  if (
    stats.gas >= 65 ||
    stats.heat >= 76 ||
    hasTag(tags, ["gas", "volatile", "explosive"])
  ) {
    return "primitive";
  }

  return undefined;
}

export function requiredResearchTierForMaterial(
  material: Pick<
    MaterialDefinition,
    "requiredResearchTier" | keyof MaterialStats | "tags"
  >,
): MaterialResearchTier | undefined {
  return (
    material.requiredResearchTier ??
    requiredResearchTierForGeneratedMaterial(material, material.tags)
  );
}
