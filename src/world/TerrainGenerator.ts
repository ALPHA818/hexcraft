import {
  TERRAIN_BLOCK_RADIUS,
  TERRAIN_DEPTH_BLOCKS,
  TerrainMaterial,
  type TerrainBiome,
  type TerrainColumn,
} from "../geometry/terrainChunk.ts";
import { HORIZONTAL_HEX_DIRECTIONS } from "./voxelRules.ts";
import {
  biomeDefinitionFor,
  selectBiome,
  subsurfaceMaterialForBiome,
  surfaceMaterialForBiome,
} from "./Biomes.ts";
import {
  applySurfaceFeatureToColumn,
  surfaceFeatureAt,
  treeHeightFromFeature,
} from "./SurfaceFeatures.ts";
import {
  hash3d,
  interpolate,
  rangeStep,
  valueNoise,
  valueNoise3d,
} from "./TerrainNoise.ts";

export const DEFAULT_WORLD_SEED = 0x484558;

export const TERRAIN_GENERATION_CONFIG = {
  localHeight: {
    minimum: 3,
    maximum: 38,
    base: 5,
    continentScale: 0.018,
    continentAmplitude: 9,
    hillScale: 0.052,
    hillAmplitude: 3.6,
    detailScale: 0.14,
    detailAmplitude: 1.6,
  },
  mountains: {
    fieldScale: 0.011,
    ridgeScale: 0.025,
    ridgeStart: 0.48,
    ridgeEnd: 0.78,
    amplitude: 20,
  },
  rivers: {
    warpScale: 0.012,
    warpAmplitude: 24,
    fieldScale: 0.021,
    innerDistance: 0.018,
    outerDistance: 0.075,
    visibleStrength: 0.48,
    mountainDamping: 0.72,
    carvedOffset: -1.2,
  },
  water: {
    baseLevel: 8,
    continentAmplitude: 5,
  },
  climate: {
    temperatureScale: 0.008,
    moistureScale: 0.01,
    mountainCooling: 0.35,
    heightCooling: 0.006,
    riverMoisture: 0.35,
  },
  caves: {
    minimumLocalLevel: 2,
    tunnelScale: 0.105,
    tunnelVerticalScale: 0.14,
    chamberScale: 0.062,
    chamberVerticalScale: 0.09,
    tunnelThreshold: 0.075,
    chamberThreshold: 0.34,
    entranceThreshold: 0.81,
    entranceDepth: 6,
    entranceTunnelThreshold: 0.15,
  },
  underground: {
    deepStoneStartDepth: 96,
    deepStoneFullDepth: 160,
    deepStoneNoiseScale: 0.071,
    deepStoneLevelNoiseScale: 0.009,
  },
  ores: {
    minimumLevel: 4,
    cellHorizontalSize: 4,
    cellVerticalSize: 5,
  },
  featureHeadroom: 10,
} as const;

export const ORE_MATERIALS = [
  TerrainMaterial.CoalOre,
  TerrainMaterial.CopperOre,
  TerrainMaterial.IronOre,
  TerrainMaterial.GoldOre,
  TerrainMaterial.CrystalOre,
] as const;

export type OreMaterial = (typeof ORE_MATERIALS)[number];

export type OreDepthRule = Readonly<{
  material: OreMaterial;
  minimumDepthBelowSurface: number;
  maximumDepthBelowSurface: number;
  veinThreshold: number;
  localThreshold: number;
  seedOffset: number;
}>;

export const ORE_DEPTH_RULES = [
  {
    material: TerrainMaterial.CrystalOre,
    minimumDepthBelowSurface: 260,
    maximumDepthBelowSurface: 520,
    veinThreshold: 0.955,
    localThreshold: 0.68,
    seedOffset: 1301,
  },
  {
    material: TerrainMaterial.GoldOre,
    minimumDepthBelowSurface: 140,
    maximumDepthBelowSurface: 470,
    veinThreshold: 0.925,
    localThreshold: 0.58,
    seedOffset: 1201,
  },
  {
    material: TerrainMaterial.IronOre,
    minimumDepthBelowSurface: 48,
    maximumDepthBelowSurface: 360,
    veinThreshold: 0.875,
    localThreshold: 0.48,
    seedOffset: 1101,
  },
  {
    material: TerrainMaterial.CopperOre,
    minimumDepthBelowSurface: 20,
    maximumDepthBelowSurface: 240,
    veinThreshold: 0.85,
    localThreshold: 0.44,
    seedOffset: 1001,
  },
  {
    material: TerrainMaterial.CoalOre,
    minimumDepthBelowSurface: 8,
    maximumDepthBelowSurface: 180,
    veinThreshold: 0.81,
    localThreshold: 0.38,
    seedOffset: 941,
  },
] as const satisfies readonly OreDepthRule[];

export type TerrainProfile = Readonly<{
  height: number;
  waterLevel: number;
  biome: TerrainBiome;
  river: boolean;
  mountain: boolean;
  temperature: number;
  moisture: number;
  riverStrength: number;
  mountainStrength: number;
}>;

const CENTER_AND_HORIZONTAL_DIRECTIONS = [
  { q: 0, r: 0 },
  ...HORIZONTAL_HEX_DIRECTIONS,
] as const;

function axialToGeneratorWorld(
  q: number,
  r: number,
  blockRadius = TERRAIN_BLOCK_RADIUS,
): Readonly<{ x: number; z: number }> {
  return {
    x: Math.sqrt(3) * (q + r / 2) * blockRadius,
    z: 1.5 * r * blockRadius,
  };
}

export function terrainProfileAt(
  q: number,
  r: number,
  seed = DEFAULT_WORLD_SEED,
): TerrainProfile {
  const config = TERRAIN_GENERATION_CONFIG;
  const { x, z } = axialToGeneratorWorld(q, r);
  const continents = valueNoise(
    x * config.localHeight.continentScale,
    z * config.localHeight.continentScale,
    seed,
  );
  const hills = valueNoise(
    x * config.localHeight.hillScale,
    z * config.localHeight.hillScale,
    seed + 101,
  );
  const detail = valueNoise(
    x * config.localHeight.detailScale,
    z * config.localHeight.detailScale,
    seed + 211,
  );
  const ridgeNoise = valueNoise(
    x * config.mountains.ridgeScale,
    z * config.mountains.ridgeScale,
    seed + 307,
  );
  const ridge = 1 - Math.abs(ridgeNoise * 2 - 1);
  const mountainField = valueNoise(
    x * config.mountains.fieldScale,
    z * config.mountains.fieldScale,
    seed + 359,
  );
  const mountainStrength =
    rangeStep(
      config.mountains.ridgeStart,
      config.mountains.ridgeEnd,
      mountainField,
    ) *
    ridge *
    ridge;
  const rawHeight =
    config.localHeight.base +
    continents * config.localHeight.continentAmplitude +
    hills * config.localHeight.hillAmplitude +
    detail * config.localHeight.detailAmplitude +
    mountainStrength * config.mountains.amplitude;
  const riverWarpX =
    (valueNoise(
      x * config.rivers.warpScale,
      z * config.rivers.warpScale,
      seed + 401,
    ) -
      0.5) *
    config.rivers.warpAmplitude;
  const riverWarpZ =
    (valueNoise(
      x * config.rivers.warpScale,
      z * config.rivers.warpScale,
      seed + 433,
    ) -
      0.5) *
    config.rivers.warpAmplitude;
  const riverField = valueNoise(
    (x + riverWarpX) * config.rivers.fieldScale,
    (z + riverWarpZ) * config.rivers.fieldScale,
    seed + 467,
  );
  const riverDistance = Math.abs(riverField - 0.5);
  const riverStrength =
    (1 -
      rangeStep(
        config.rivers.innerDistance,
        config.rivers.outerDistance,
        riverDistance,
      )) *
    (1 - mountainStrength * config.rivers.mountainDamping);
  const computedWaterLevel = Math.round(
    config.water.baseLevel + continents * config.water.continentAmplitude,
  );
  const carvedHeight = interpolate(
    rawHeight,
    computedWaterLevel + config.rivers.carvedOffset,
    riverStrength,
  );
  const height = Math.max(
    config.localHeight.minimum,
    Math.min(config.localHeight.maximum, Math.round(carvedHeight)),
  );
  const river =
    riverStrength > config.rivers.visibleStrength &&
    height < computedWaterLevel;
  const temperature =
    valueNoise(
      x * config.climate.temperatureScale,
      z * config.climate.temperatureScale,
      seed + 503,
    ) -
    mountainStrength * config.climate.mountainCooling -
    height * config.climate.heightCooling;
  const moisture =
    valueNoise(
      x * config.climate.moistureScale,
      z * config.climate.moistureScale,
      seed + 547,
    ) +
    riverStrength * config.climate.riverMoisture;
  const biome = selectBiome({
    height,
    waterLevel: computedWaterLevel,
    temperature,
    moisture,
    riverStrength,
    mountainStrength,
  });

  return {
    height,
    waterLevel: river ? computedWaterLevel : 0,
    biome,
    river,
    mountain: mountainStrength > 0.38 || height >= 21,
    temperature,
    moisture,
    riverStrength,
    mountainStrength,
  };
}

export function terrainHeightAt(
  q: number,
  r: number,
  seed = DEFAULT_WORLD_SEED,
): number {
  return TERRAIN_DEPTH_BLOCKS + terrainProfileAt(q, r, seed).height;
}

export function biomeAt(
  q: number,
  r: number,
  seed = DEFAULT_WORLD_SEED,
): TerrainBiome {
  return terrainProfileAt(q, r, seed).biome;
}

export function caveAt(
  q: number,
  r: number,
  level: number,
  surfaceHeight: number,
  seed = DEFAULT_WORLD_SEED,
): boolean {
  const config = TERRAIN_GENERATION_CONFIG.caves;
  const localLevel = level - TERRAIN_DEPTH_BLOCKS;
  const localSurfaceHeight = surfaceHeight - TERRAIN_DEPTH_BLOCKS;

  if (
    localLevel < config.minimumLocalLevel ||
    localLevel >= localSurfaceHeight
  ) {
    return false;
  }

  const tunnel = Math.abs(
    valueNoise3d(
      q * config.tunnelScale,
      localLevel * config.tunnelVerticalScale,
      r * config.tunnelScale,
      seed + 601,
    ) - 0.5,
  );
  const chamber = valueNoise3d(
    q * config.chamberScale,
    localLevel * config.chamberVerticalScale,
    r * config.chamberScale,
    seed + 647,
  );
  const cave =
    localLevel < localSurfaceHeight - 1 &&
    tunnel < config.tunnelThreshold &&
    chamber > config.chamberThreshold;
  const entranceField = valueNoise(q * 0.095, r * 0.095, seed + 691);
  const entrance =
    entranceField > config.entranceThreshold &&
    localLevel >= localSurfaceHeight - config.entranceDepth &&
    tunnel < config.entranceTunnelThreshold;

  return cave || entrance;
}

export function canOreReplaceMaterial(material: TerrainMaterial): boolean {
  return (
    material === TerrainMaterial.Stone || material === TerrainMaterial.DeepStone
  );
}

export function undergroundStoneMaterialAt(
  q: number,
  r: number,
  level: number,
  surfaceHeight: number,
  seed = DEFAULT_WORLD_SEED,
): TerrainMaterial.Stone | TerrainMaterial.DeepStone {
  const config = TERRAIN_GENERATION_CONFIG.underground;
  const depthBelowSurface = surfaceHeight - level;

  if (depthBelowSurface < config.deepStoneStartDepth) {
    return TerrainMaterial.Stone;
  }

  if (depthBelowSurface >= config.deepStoneFullDepth) {
    return TerrainMaterial.DeepStone;
  }

  const transition =
    (depthBelowSurface - config.deepStoneStartDepth) /
    (config.deepStoneFullDepth - config.deepStoneStartDepth);
  const noise = valueNoise(
    q * config.deepStoneNoiseScale + level * config.deepStoneLevelNoiseScale,
    r * config.deepStoneNoiseScale,
    seed + 881,
  );

  return noise < transition ? TerrainMaterial.DeepStone : TerrainMaterial.Stone;
}

export function oreMaterialAt(
  q: number,
  r: number,
  level: number,
  surfaceHeight: number,
  seed = DEFAULT_WORLD_SEED,
): TerrainMaterial | null {
  const config = TERRAIN_GENERATION_CONFIG.ores;
  const depthBelowSurface = surfaceHeight - level;

  if (level < config.minimumLevel) {
    return null;
  }

  for (const rule of ORE_DEPTH_RULES) {
    if (
      depthBelowSurface < rule.minimumDepthBelowSurface ||
      depthBelowSurface > rule.maximumDepthBelowSurface
    ) {
      continue;
    }

    const cellQ = Math.floor(q / config.cellHorizontalSize);
    const cellR = Math.floor(r / config.cellHorizontalSize);
    const cellLevel = Math.floor(level / config.cellVerticalSize);
    const vein =
      hash3d(cellQ, cellLevel, cellR, seed + rule.seedOffset) +
      hash3d(cellQ + 7, cellLevel - 3, cellR - 5, seed + rule.seedOffset + 37) *
        0.28;

    if (vein < rule.veinThreshold) {
      continue;
    }

    const local = hash3d(q, level, r, seed + rule.seedOffset + 71);

    if (local >= rule.localThreshold) {
      return rule.material;
    }
  }

  return null;
}

export function treeHeightAt(
  q: number,
  r: number,
  seed = DEFAULT_WORLD_SEED,
): number {
  return treeHeightFromFeature(
    surfaceFeatureAt(q, r, seed, terrainProfileAt(q, r, seed)),
  );
}

function baseStoneMaterialAt(
  q: number,
  r: number,
  level: number,
  surfaceHeight: number,
  seed: number,
): TerrainMaterial {
  const hostMaterial = undergroundStoneMaterialAt(
    q,
    r,
    level,
    surfaceHeight,
    seed,
  );

  return oreMaterialAt(q, r, level, surfaceHeight, seed) ?? hostMaterial;
}

function layerMaterialAt(
  q: number,
  r: number,
  level: number,
  surfaceHeight: number,
  profile: TerrainProfile,
  topMaterial: TerrainMaterial,
  seed: number,
): TerrainMaterial {
  const depth = surfaceHeight - level;

  if (depth === 1) {
    return topMaterial;
  }

  const material = subsurfaceMaterialForBiome(
    profile.biome,
    depth,
    profile.mountain,
  );

  if (material === TerrainMaterial.Stone) {
    const hostMaterial = undergroundStoneMaterialAt(
      q,
      r,
      level,
      surfaceHeight,
      seed,
    );

    return oreMaterialAt(q, r, level, surfaceHeight, seed) ?? hostMaterial;
  }

  return material;
}

export function generateTerrainColumn(
  q: number,
  r: number,
  seed = DEFAULT_WORLD_SEED,
  visible = true,
): TerrainColumn {
  const profile = terrainProfileAt(q, r, seed);
  const surfaceHeight = TERRAIN_DEPTH_BLOCKS + profile.height;
  const waterLevel =
    profile.waterLevel > 0 ? TERRAIN_DEPTH_BLOCKS + profile.waterLevel : 0;
  const maximumLevel =
    Math.max(surfaceHeight, waterLevel) +
    TERRAIN_GENERATION_CONFIG.featureHeadroom;
  const blocks = new Uint8Array(maximumLevel);
  const moistureVariant = valueNoise(q * 0.037, r * 0.037, seed + 733);
  const topMaterial = surfaceMaterialForBiome(profile.biome, moistureVariant);
  let caveAirCount = 0;

  for (
    let level = 0;
    level < Math.min(TERRAIN_DEPTH_BLOCKS, surfaceHeight);
    level += 1
  ) {
    blocks[level] = baseStoneMaterialAt(q, r, level, surfaceHeight, seed);
  }

  for (let level = TERRAIN_DEPTH_BLOCKS; level < surfaceHeight; level += 1) {
    const material = layerMaterialAt(
      q,
      r,
      level,
      surfaceHeight,
      profile,
      topMaterial,
      seed,
    );

    if (caveAt(q, r, level, surfaceHeight, seed)) {
      blocks[level] = TerrainMaterial.Air;
      caveAirCount += 1;
    } else {
      blocks[level] = material;
    }
  }

  for (let level = surfaceHeight; level < waterLevel; level += 1) {
    blocks[level] = TerrainMaterial.Water;
  }

  for (const direction of CENTER_AND_HORIZONTAL_DIRECTIONS) {
    const featureQ = q + direction.q;
    const featureR = r + direction.r;
    const featureProfile = terrainProfileAt(featureQ, featureR, seed);
    const feature = surfaceFeatureAt(featureQ, featureR, seed, featureProfile);

    applySurfaceFeatureToColumn({
      blocks,
      columnQ: q,
      columnR: r,
      featureQ,
      featureR,
      featureSurfaceLevel: TERRAIN_DEPTH_BLOCKS + featureProfile.height,
      feature,
    });
  }

  return {
    q,
    r,
    height: surfaceHeight,
    visible,
    blocks,
    biome: profile.biome,
    river: profile.river,
    mountain: profile.mountain,
    caveAirCount,
    minimumMeshLevel: TERRAIN_DEPTH_BLOCKS,
  };
}

export function biomeDisplayName(biome: TerrainBiome): string {
  return biomeDefinitionFor(biome).displayName;
}
