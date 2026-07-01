import {
  DEFAULT_MATERIAL_CONFIG,
  normalizeMaterialConfig,
  type MaterialConfig,
} from "./MaterialConfig.ts";
import { balanceGeneratedMaterialStats } from "./MaterialBalance.ts";
import { stableHashString } from "./MaterialHash.ts";
import {
  canonicalMaterialIds,
  rarityForStats,
  recipeKeyForMaterialIds,
  resolveMaterialReaction,
  tagsForMaterial,
  unstableReactionOutcome,
} from "./MaterialReactions.ts";
import { combineMaterialStats } from "./MaterialStats.ts";
import {
  generatedMaterialDescription,
  generatedMaterialName,
} from "./MaterialNaming.ts";
import {
  lockedMaterialResearchTier,
  lockedParentMaterialResearchTier,
  researchLockedCombinationFailure,
  requiredResearchTierForGeneratedMaterial,
  type MaterialResearchContext,
} from "./MaterialResearch.ts";
import {
  applyMaterialStationModifiers,
  materialStationGeneratedName,
  materialStationTags,
} from "./MaterialStations.ts";
import type { MaterialRegistry } from "./MaterialRegistry.ts";
import type {
  MaterialCombinationResult,
  MaterialDefinition,
  MaterialProcessingStationType,
} from "./MaterialTypes.ts";
import { validateCombinationParents } from "./MaterialValidation.ts";

export function combineMaterials(
  materialA: MaterialDefinition,
  materialB: MaterialDefinition,
  registry: MaterialRegistry,
  config: MaterialConfig = DEFAULT_MATERIAL_CONFIG,
  researchContext: MaterialResearchContext = {},
  stationType: MaterialProcessingStationType = "combiner",
): MaterialCombinationResult {
  const normalizedConfig = normalizeMaterialConfig(config);
  const recipeKey = recipeKeyForMaterialIds(
    materialA.id,
    materialB.id,
    normalizedConfig,
    stationType,
  );
  const existing = registry.getRecipeResult(
    materialA.id,
    materialB.id,
    normalizedConfig,
    stationType,
  );
  const validation = validateCombinationParents(
    materialA,
    materialB,
    registry,
    normalizedConfig,
  );

  if (validation) {
    return {
      ...validation,
      recipeKey,
    };
  }

  const parentIds = canonicalMaterialIds(
    materialA.id,
    materialB.id,
    normalizedConfig,
  );
  const parents =
    parentIds[0] === materialA.id
      ? ([materialA, materialB] as const)
      : ([materialB, materialA] as const);
  const generation = Math.max(materialA.generation, materialB.generation) + 1;
  const lockedParentTier = lockedParentMaterialResearchTier(
    parents,
    researchContext,
  );

  if (lockedParentTier) {
    return researchLockedCombinationFailure(lockedParentTier, recipeKey);
  }

  const preliminaryStats = combineMaterialStats(
    parents[0],
    parents[1],
    recipeKey,
    normalizedConfig,
  );
  const reaction = resolveMaterialReaction(
    parents[0],
    parents[1],
    preliminaryStats,
    recipeKey,
    normalizedConfig,
  );
  const lockedReactionTier = lockedMaterialResearchTier(
    reaction?.requiredResearchTier,
    researchContext,
  );

  if (lockedReactionTier) {
    return researchLockedCombinationFailure(lockedReactionTier, recipeKey);
  }

  const stationStats = applyMaterialStationModifiers(
    combineMaterialStats(
      parents[0],
      parents[1],
      recipeKey,
      normalizedConfig,
      reaction,
    ),
    stationType,
    normalizedConfig,
  );
  const preliminaryTags = [
    ...new Set([
      ...tagsForMaterial(stationStats, parents, reaction),
      ...materialStationTags(stationType),
    ]),
  ].sort();
  const stats = balanceGeneratedMaterialStats(
    stationStats,
    generation,
    normalizedConfig,
    preliminaryTags,
  );
  const tags = [
    ...new Set([
      ...tagsForMaterial(stats, parents, reaction),
      ...materialStationTags(stationType),
    ]),
  ].sort();
  const requiredResearchTier =
    existing?.requiredResearchTier ??
    requiredResearchTierForGeneratedMaterial(stats, tags, reaction);
  const lockedResultTier = lockedMaterialResearchTier(
    requiredResearchTier,
    researchContext,
  );

  if (lockedResultTier) {
    return researchLockedCombinationFailure(lockedResultTier, recipeKey);
  }

  if (existing) {
    return {
      ok: true,
      material: existing,
      recipeKey,
      discovered: false,
    };
  }

  const unstableOutcome = unstableReactionOutcome(
    recipeKey,
    stats,
    tags,
    normalizedConfig,
  );

  if (unstableOutcome) {
    return {
      ok: false,
      reason: "unstable_reaction",
      message: unstableOutcome.warningText,
      recipeKey,
      unstableOutcome,
    };
  }

  const id = `generated:g${generation}:${stableHashString(
    `${normalizedConfig.seed}|${recipeKey}`,
  ).toString(36)}`;
  const material: MaterialDefinition = {
    id,
    name: materialStationGeneratedName(
      generatedMaterialName(
        parents[0],
        parents[1],
        recipeKey,
        normalizedConfig,
        reaction,
      ),
      stationType,
    ),
    generation,
    parents: parentIds,
    rarity: rarityForStats(
      stats,
      recipeKey,
      normalizedConfig,
      reaction,
      generation,
    ),
    ...stats,
    tags,
    requiredResearchTier,
    stationType,
    discoveredAt: normalizedConfig.instantDiscovery
      ? stableHashString(`${normalizedConfig.seed}|${recipeKey}|discoveredAt`)
      : undefined,
    description: generatedMaterialDescription(parents[0], parents[1], reaction),
  };

  registry.registerGeneratedMaterial(material);
  registry.storeRecipeResult(recipeKey, material.id);

  return {
    ok: true,
    material,
    recipeKey,
    discovered: true,
  };
}
