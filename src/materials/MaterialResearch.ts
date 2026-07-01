import type {
  MaterialCombinationFailure,
  MaterialDefinition,
  MaterialResearchTier,
  MaterialStats,
} from "./MaterialTypes.ts";

export type { MaterialResearchTier } from "./MaterialTypes.ts";

export const MATERIAL_RESEARCH_TIERS = [
  "metallurgical",
  "crystalline",
  "alchemical",
  "volatile",
  "arcane",
  "radiological",
] as const satisfies readonly MaterialResearchTier[];

export const MATERIAL_RESEARCH_TIER_LABELS = {
  metallurgical: "Metallurgical Research",
  crystalline: "Crystalline Research",
  alchemical: "Alchemical Research",
  volatile: "Volatile Research",
  arcane: "Arcane Research",
  radiological: "Radiological Research",
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

function isMaterialResearchTier(value: unknown): value is MaterialResearchTier {
  return typeof value === "string" && MATERIAL_RESEARCH_TIER_SET.has(value);
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
    ? record.unlockedTiers.filter(isMaterialResearchTier)
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
    return "radiological";
  }
  if (stats.magic >= 78 || hasTag(tags, ["void", "arcane", "eldritch"])) {
    return "arcane";
  }

  if (reaction?.requiredResearchTier) {
    return reaction.requiredResearchTier;
  }

  if (
    stats.radioactivity >= 55 ||
    hasTag(tags, ["radioactive", "radiological", "unstable"])
  ) {
    return "radiological";
  }
  if (stats.magic >= 58 || hasTag(tags, ["magic", "arcane", "void"])) {
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
  if (stats.toxicity >= 55 || hasTag(tags, ["toxic", "poison", "alchemical"])) {
    return "alchemical";
  }
  if (
    stats.gas >= 65 ||
    stats.heat >= 76 ||
    hasTag(tags, ["gas", "volatile", "explosive"])
  ) {
    return "volatile";
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
