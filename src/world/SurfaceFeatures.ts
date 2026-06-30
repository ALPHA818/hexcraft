import {
  TerrainMaterial,
  type TerrainBiome,
} from "../geometry/terrainChunk.ts";
import { hash2d } from "./TerrainNoise.ts";
import { biomeDefinitionFor } from "./Biomes.ts";

export type SurfaceFeatureProfile = Readonly<{
  height: number;
  waterLevel: number;
  biome: TerrainBiome;
  river: boolean;
  mountain: boolean;
}>;

export type SurfaceFeature =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "tree"; height: number }>
  | Readonly<{ kind: "cactus"; height: number }>
  | Readonly<{ kind: "flower" }>
  | Readonly<{ kind: "mushroom" }>;

export type SurfaceFeatureApplyInput = Readonly<{
  blocks: Uint8Array;
  columnQ: number;
  columnR: number;
  featureQ: number;
  featureR: number;
  featureSurfaceLevel: number;
  feature: SurfaceFeature;
}>;

export const SURFACE_FEATURE_CONFIG = {
  treeSeedOffset: 797,
  treeHeightSeedOffset: 829,
  cactusSeedOffset: 863,
  flowerSeedOffset: 887,
  mushroomSeedOffset: 907,
  treeMinimumHeight: 4,
  treeHeightVariation: 3,
  cactusMinimumHeight: 2,
  cactusHeightVariation: 3,
} as const;

const NO_FEATURE: SurfaceFeature = { kind: "none" };

export function surfaceFeatureAt(
  q: number,
  r: number,
  seed: number,
  profile: SurfaceFeatureProfile,
): SurfaceFeature {
  const definition = biomeDefinitionFor(profile.biome);
  const submerged =
    profile.waterLevel > 0 && profile.height <= profile.waterLevel;

  if (submerged || profile.river || profile.mountain) {
    return NO_FEATURE;
  }

  const treeChance = hash2d(q, r, seed + SURFACE_FEATURE_CONFIG.treeSeedOffset);
  if (treeChance >= 1 - definition.treeChance) {
    return {
      kind: "tree",
      height:
        SURFACE_FEATURE_CONFIG.treeMinimumHeight +
        Math.floor(
          hash2d(q, r, seed + SURFACE_FEATURE_CONFIG.treeHeightSeedOffset) *
            SURFACE_FEATURE_CONFIG.treeHeightVariation,
        ),
    };
  }

  const cactusChance = hash2d(
    q,
    r,
    seed + SURFACE_FEATURE_CONFIG.cactusSeedOffset,
  );
  if (cactusChance >= 1 - definition.cactusChance) {
    return {
      kind: "cactus",
      height:
        SURFACE_FEATURE_CONFIG.cactusMinimumHeight +
        Math.floor(
          hash2d(q, r, seed + SURFACE_FEATURE_CONFIG.cactusSeedOffset + 19) *
            SURFACE_FEATURE_CONFIG.cactusHeightVariation,
        ),
    };
  }

  const flowerChance = hash2d(
    q,
    r,
    seed + SURFACE_FEATURE_CONFIG.flowerSeedOffset,
  );
  if (flowerChance >= 1 - definition.flowerChance) {
    return { kind: "flower" };
  }

  const mushroomChance = hash2d(
    q,
    r,
    seed + SURFACE_FEATURE_CONFIG.mushroomSeedOffset,
  );
  if (mushroomChance >= 1 - definition.mushroomChance) {
    return { kind: "mushroom" };
  }

  return NO_FEATURE;
}

export function treeHeightFromFeature(feature: SurfaceFeature): number {
  return feature.kind === "tree" ? feature.height : 0;
}

export function applySurfaceFeatureToColumn({
  blocks,
  columnQ,
  columnR,
  featureQ,
  featureR,
  featureSurfaceLevel,
  feature,
}: SurfaceFeatureApplyInput): void {
  const isFeatureColumn = columnQ === featureQ && columnR === featureR;

  switch (feature.kind) {
    case "tree":
      if (isFeatureColumn) {
        for (
          let level = featureSurfaceLevel;
          level < featureSurfaceLevel + feature.height;
          level += 1
        ) {
          blocks[level] = TerrainMaterial.Wood;
        }
        blocks[featureSurfaceLevel + feature.height] = TerrainMaterial.Leaves;
        return;
      }

      for (
        let level = featureSurfaceLevel + feature.height - 2;
        level <= featureSurfaceLevel + feature.height;
        level += 1
      ) {
        if (blocks[level] === TerrainMaterial.Air) {
          blocks[level] = TerrainMaterial.Leaves;
        }
      }
      return;

    case "cactus":
      if (!isFeatureColumn) {
        return;
      }

      for (
        let level = featureSurfaceLevel;
        level < featureSurfaceLevel + feature.height;
        level += 1
      ) {
        if (blocks[level] === TerrainMaterial.Air) {
          blocks[level] = TerrainMaterial.Cactus;
        }
      }
      return;

    case "flower":
      if (
        isFeatureColumn &&
        blocks[featureSurfaceLevel] === TerrainMaterial.Air
      ) {
        blocks[featureSurfaceLevel] = TerrainMaterial.Flower;
      }
      return;

    case "mushroom":
      if (
        isFeatureColumn &&
        blocks[featureSurfaceLevel] === TerrainMaterial.Air
      ) {
        blocks[featureSurfaceLevel] = TerrainMaterial.Mushroom;
      }
      return;

    case "none":
      return;
  }
}
