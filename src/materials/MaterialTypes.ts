export type MaterialId = string;

export type MaterialRarity =
  "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";

export type MaterialResearchTier =
  | "metallurgical"
  | "crystalline"
  | "alchemical"
  | "volatile"
  | "arcane"
  | "radiological";

export type MaterialProcessingStationType =
  | "combiner"
  | "forge"
  | "crystallizer"
  | "distiller"
  | "stabilizer"
  | "infuser"
  | "assembler";

export type MaterialParentIds = readonly MaterialId[];

export type MaterialDefinition = Readonly<{
  id: MaterialId;
  name: string;
  generation: number;
  parents: MaterialParentIds;
  rarity: MaterialRarity;
  stability: number;
  hardness: number;
  density: number;
  heat: number;
  conductivity: number;
  toxicity: number;
  radioactivity: number;
  magic: number;
  organic: number;
  metal: number;
  crystal: number;
  gas: number;
  liquid: number;
  tags: readonly string[];
  requiredResearchTier?: MaterialResearchTier;
  stationType?: MaterialProcessingStationType;
  discoveredAt?: number;
  description?: string;
}>;

export type BaseElementMaterial = MaterialDefinition &
  Readonly<{
    symbol: string;
    atomicNumber: number;
  }>;

export type MaterialStatKey =
  | "stability"
  | "hardness"
  | "density"
  | "heat"
  | "conductivity"
  | "toxicity"
  | "radioactivity"
  | "magic"
  | "organic"
  | "metal"
  | "crystal"
  | "gas"
  | "liquid";

export const MATERIAL_STAT_KEYS = [
  "stability",
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

export type MaterialStats = Pick<MaterialDefinition, MaterialStatKey>;

export type MaterialUnstableReactionOutcomeKind =
  | "failed_consumed"
  | "weak_byproduct"
  | "player_damage"
  | "small_explosion"
  | "toxic_cloud";

export type MaterialUnstableReactionOutcome = Readonly<{
  kind: MaterialUnstableReactionOutcomeKind;
  warningText: string;
  consumesIngredients: boolean;
  terrainEffect: "ui_only";
  playerDamage?: number;
  explosionRadius?: number;
  toxicCloudSeconds?: number;
  byproductName?: string;
}>;

export type MaterialCombinationSuccess = Readonly<{
  ok: true;
  material: MaterialDefinition;
  recipeKey: string;
  discovered: boolean;
}>;

export type MaterialCombinationFailureReason =
  | "missing_parent"
  | "invalid_parent"
  | "max_generation_exceeded"
  | "research_locked"
  | "unstable_reaction";

export type MaterialCombinationFailure = Readonly<{
  ok: false;
  reason: MaterialCombinationFailureReason;
  message: string;
  recipeKey?: string;
  requiredResearchTier?: MaterialResearchTier;
  unstableOutcome?: MaterialUnstableReactionOutcome;
}>;

export type MaterialCombinationResult =
  MaterialCombinationSuccess | MaterialCombinationFailure;
