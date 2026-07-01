import type { MaterialConfig } from "./MaterialConfig.ts";
import { stableHashChoice } from "./MaterialHash.ts";
import {
  materialTraitTags,
  type MaterialReaction,
  type MaterialReactionTag,
} from "./MaterialReactions.ts";
import type { MaterialDefinition } from "./MaterialTypes.ts";

const PREFIXES = [
  "Aether",
  "Astral",
  "Cinder",
  "Echo",
  "Ferric",
  "Lumen",
  "Mythic",
  "Prismatic",
  "Rune",
  "Umbral",
  "Verdant",
  "Vitrified",
  "Voltaic",
] as const;

const TAG_SUFFIXES = {
  air: ["Vapor", "Drift", "Aerosol"],
  alloy: ["Alloy", "Composite", "Blend"],
  arcane: ["Arcanum", "Runestone", "Spellglass"],
  clay: ["Clay", "Mudstone", "Loam"],
  conductive: ["Conductor", "Filament", "Circuit"],
  crystal: ["Crystal", "Shard", "Prism"],
  dark: ["Nocturne", "Shadowglass", "Umbrite"],
  earth: ["Stone", "Loam", "Terra"],
  electric: ["Conductor", "Spark", "Volta"],
  explosive: ["Catalyst", "Charge", "Blast Compound"],
  fire: ["Ember", "Cinder", "Pyrite"],
  forged: ["Forging", "Ingot", "Steel"],
  fuel: ["Fuel", "Resin", "Kindling"],
  gas: ["Vapor", "Mist", "Gas"],
  light: ["Gleam", "Sunshard", "Lumen"],
  liquid: ["Gel", "Elixir", "Fluid"],
  magic: ["Arcanum", "Spellglass", "Aether"],
  metal: ["Alloy", "Ingot", "Steel"],
  organic: ["Resin", "Biomass", "Fiber"],
  poison: ["Venom", "Toxin", "Poison Compound"],
  radioactive: ["Isotope", "Radiant Alloy", "Core"],
  toxic: ["Toxin", "Poison Compound", "Caustic"],
  unstable: ["Catalyst", "Flux", "Unstable Matrix"],
  void: ["Nullglass", "Void Alloy", "Abyssal Matter"],
  water: ["Clay", "Flowgel", "Brine"],
} as const satisfies Record<MaterialReactionTag, readonly string[]>;

const TAG_PRIORITY: readonly MaterialReactionTag[] = [
  "void",
  "radioactive",
  "explosive",
  "magic",
  "arcane",
  "fire",
  "crystal",
  "metal",
  "toxic",
  "poison",
  "organic",
  "electric",
  "water",
  "earth",
  "gas",
  "liquid",
  "light",
  "dark",
  "air",
  "forged",
  "alloy",
  "clay",
  "fuel",
  "conductive",
  "unstable",
];

function materialRootName(material: MaterialDefinition): string {
  const root = material.name.replaceAll(/[^a-z0-9\s-]/gi, "").split(/\s+/)[0];

  return root && root.length > 0 ? root : "Aether";
}

function dominantTag(
  materialA: MaterialDefinition,
  materialB: MaterialDefinition,
): MaterialReactionTag {
  const tags = new Set([
    ...materialTraitTags(materialA),
    ...materialTraitTags(materialB),
  ]);

  return TAG_PRIORITY.find((tag) => tags.has(tag)) ?? "magic";
}

export function generatedMaterialName(
  materialA: MaterialDefinition,
  materialB: MaterialDefinition,
  recipeKey: string,
  config: Pick<MaterialConfig, "seed">,
  reaction: Pick<MaterialReaction, "name"> | null = null,
): string {
  if (reaction) {
    return reaction.name;
  }

  const primaryTag = dominantTag(materialA, materialB);
  const prefix = stableHashChoice(
    `${config.seed}|${recipeKey}|prefix`,
    PREFIXES,
  );
  const suffix = stableHashChoice(
    `${config.seed}|${recipeKey}|suffix|${primaryTag}`,
    TAG_SUFFIXES[primaryTag],
  );
  const rootA = materialRootName(materialA);
  const rootB = materialRootName(materialB);
  const root =
    rootA.toLowerCase() === rootB.toLowerCase() ? rootA : `${rootA}-${rootB}`;

  return `${prefix} ${root} ${suffix}`;
}

export function generatedMaterialDescription(
  materialA: MaterialDefinition,
  materialB: MaterialDefinition,
  reaction: Pick<MaterialReaction, "name" | "tags"> | null = null,
): string {
  if (reaction) {
    return `${reaction.name} is a ${reaction.tags.join(
      "/",
    )} procedural material discovered from ${materialA.name} and ${
      materialB.name
    }.`;
  }

  return `A discovered procedural material produced from ${materialA.name} and ${materialB.name}.`;
}
