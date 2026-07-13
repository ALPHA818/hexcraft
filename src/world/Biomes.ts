import {
  TerrainMaterial,
  type TerrainBiome,
} from "../geometry/terrainChunk.ts";
import type { WeatherKind } from "../environment/Atmosphere.ts";

export type BiomeSelectionInput = Readonly<{
  height: number;
  waterLevel: number;
  temperature: number;
  moisture: number;
  riverStrength: number;
  mountainStrength: number;
}>;

export type TerrainBiomeDefinition = Readonly<{
  id: TerrainBiome;
  displayName: string;
  surfaceMaterial: TerrainMaterial;
  drySurfaceMaterial?: TerrainMaterial;
  shallowMaterial: TerrainMaterial;
  deepMaterial: TerrainMaterial;
  treeChance: number;
  flowerChance: number;
  mushroomChance: number;
  cactusChance: number;
  weatherWeights: BiomeWeatherWeights;
}>;

export type BiomeWeatherWeights = Readonly<Record<WeatherKind, number>>;

const BALANCED_WEATHER_WEIGHTS = {
  clear: 1.35,
  cloudy: 1.1,
  rain: 0.9,
  storm: 0.35,
  snow: 0.15,
  fog: 0.45,
  sandstorm: 0.03,
} as const satisfies BiomeWeatherWeights;

export const BIOME_DEFINITIONS = {
  grassland: {
    id: "grassland",
    displayName: "Grassland",
    surfaceMaterial: TerrainMaterial.Grass,
    drySurfaceMaterial: TerrainMaterial.DryGrass,
    shallowMaterial: TerrainMaterial.Dirt,
    deepMaterial: TerrainMaterial.Stone,
    treeChance: 0.015,
    flowerChance: 0.05,
    mushroomChance: 0,
    cactusChance: 0,
    weatherWeights: BALANCED_WEATHER_WEIGHTS,
  },
  forest: {
    id: "forest",
    displayName: "Forest",
    surfaceMaterial: TerrainMaterial.Grass,
    shallowMaterial: TerrainMaterial.Dirt,
    deepMaterial: TerrainMaterial.Stone,
    treeChance: 0.075,
    flowerChance: 0.01,
    mushroomChance: 0.025,
    cactusChance: 0,
    weatherWeights: {
      clear: 0.65,
      cloudy: 1.1,
      rain: 1.55,
      storm: 0.45,
      snow: 0.1,
      fog: 1.1,
      sandstorm: 0.02,
    },
  },
  desert: {
    id: "desert",
    displayName: "Desert",
    surfaceMaterial: TerrainMaterial.Sand,
    shallowMaterial: TerrainMaterial.Sand,
    deepMaterial: TerrainMaterial.Stone,
    treeChance: 0,
    flowerChance: 0,
    mushroomChance: 0,
    cactusChance: 0.028,
    weatherWeights: {
      clear: 1.6,
      cloudy: 0.75,
      rain: 0.18,
      storm: 0.22,
      snow: 0.02,
      fog: 0.08,
      sandstorm: 2.2,
    },
  },
  tundra: {
    id: "tundra",
    displayName: "Tundra",
    surfaceMaterial: TerrainMaterial.Snow,
    shallowMaterial: TerrainMaterial.Dirt,
    deepMaterial: TerrainMaterial.Stone,
    treeChance: 0,
    flowerChance: 0,
    mushroomChance: 0,
    cactusChance: 0,
    weatherWeights: {
      clear: 0.7,
      cloudy: 0.95,
      rain: 0.18,
      storm: 0.28,
      snow: 1.8,
      fog: 0.65,
      sandstorm: 0.01,
    },
  },
  alpine: {
    id: "alpine",
    displayName: "Alpine",
    surfaceMaterial: TerrainMaterial.AlpineRock,
    shallowMaterial: TerrainMaterial.AlpineRock,
    deepMaterial: TerrainMaterial.Stone,
    treeChance: 0,
    flowerChance: 0,
    mushroomChance: 0,
    cactusChance: 0,
    weatherWeights: {
      clear: 0.65,
      cloudy: 0.9,
      rain: 0.12,
      storm: 0.4,
      snow: 1.65,
      fog: 0.55,
      sandstorm: 0.02,
    },
  },
  snow: {
    id: "snow",
    displayName: "Snow",
    surfaceMaterial: TerrainMaterial.Snow,
    shallowMaterial: TerrainMaterial.AlpineRock,
    deepMaterial: TerrainMaterial.Stone,
    treeChance: 0,
    flowerChance: 0,
    mushroomChance: 0,
    cactusChance: 0,
    weatherWeights: {
      clear: 0.55,
      cloudy: 0.9,
      rain: 0.08,
      storm: 0.25,
      snow: 2.1,
      fog: 0.6,
      sandstorm: 0.01,
    },
  },
  beach: {
    id: "beach",
    displayName: "Beach",
    surfaceMaterial: TerrainMaterial.Sand,
    shallowMaterial: TerrainMaterial.Sand,
    deepMaterial: TerrainMaterial.Stone,
    treeChance: 0,
    flowerChance: 0,
    mushroomChance: 0,
    cactusChance: 0,
    weatherWeights: {
      clear: 1,
      cloudy: 1,
      rain: 0.75,
      storm: 0.35,
      snow: 0.04,
      fog: 0.65,
      sandstorm: 0.05,
    },
  },
  swamp: {
    id: "swamp",
    displayName: "Swamp",
    surfaceMaterial: TerrainMaterial.Grass,
    drySurfaceMaterial: TerrainMaterial.DryGrass,
    shallowMaterial: TerrainMaterial.Dirt,
    deepMaterial: TerrainMaterial.Stone,
    treeChance: 0.04,
    flowerChance: 0,
    mushroomChance: 0.035,
    cactusChance: 0,
    weatherWeights: {
      clear: 0.28,
      cloudy: 1,
      rain: 1.35,
      storm: 0.45,
      snow: 0.04,
      fog: 3.2,
      sandstorm: 0.01,
    },
  },
  badlands: {
    id: "badlands",
    displayName: "Badlands",
    surfaceMaterial: TerrainMaterial.DryGrass,
    shallowMaterial: TerrainMaterial.Sand,
    deepMaterial: TerrainMaterial.Stone,
    treeChance: 0,
    flowerChance: 0,
    mushroomChance: 0,
    cactusChance: 0.012,
    weatherWeights: {
      clear: 1.25,
      cloudy: 0.85,
      rain: 0.25,
      storm: 0.3,
      snow: 0.03,
      fog: 0.08,
      sandstorm: 1.85,
    },
  },
} as const satisfies Record<TerrainBiome, TerrainBiomeDefinition>;

export function biomeDefinitionFor(
  biome: TerrainBiome,
): TerrainBiomeDefinition {
  return BIOME_DEFINITIONS[biome];
}

export function biomeWeatherWeightsFor(
  biome: TerrainBiome | null | undefined,
): BiomeWeatherWeights {
  return biome
    ? BIOME_DEFINITIONS[biome].weatherWeights
    : BALANCED_WEATHER_WEIGHTS;
}

export function selectBiome(input: BiomeSelectionInput): TerrainBiome {
  const lowland = input.height <= input.waterLevel + 3;
  const nearWater =
    input.riverStrength > 0.28 && input.height <= input.waterLevel + 1;

  if (input.height >= 28 || input.mountainStrength > 0.62) {
    return input.temperature < 0.52 ? "snow" : "alpine";
  }

  if (input.height >= 21 || input.mountainStrength > 0.42) {
    return "alpine";
  }

  if (nearWater && input.temperature > 0.3) {
    return "beach";
  }

  if (lowland && input.moisture > 0.72 && input.temperature > 0.34) {
    return "swamp";
  }

  if (input.temperature < 0.28) {
    return "tundra";
  }

  if (input.temperature > 0.58 && input.moisture < 0.35) {
    return "desert";
  }

  if (input.temperature > 0.52 && input.moisture < 0.43) {
    return "badlands";
  }

  if (input.moisture > 0.58) {
    return "forest";
  }

  return "grassland";
}

export function surfaceMaterialForBiome(
  biome: TerrainBiome,
  moistureVariant: number,
): TerrainMaterial {
  const definition = biomeDefinitionFor(biome);

  return definition.drySurfaceMaterial && moistureVariant < 0.42
    ? definition.drySurfaceMaterial
    : definition.surfaceMaterial;
}

export function subsurfaceMaterialForBiome(
  biome: TerrainBiome,
  depth: number,
  mountain: boolean,
): TerrainMaterial {
  const definition = biomeDefinitionFor(biome);

  if (depth <= 3) {
    return definition.shallowMaterial;
  }

  if (mountain && depth <= 8) {
    return TerrainMaterial.AlpineRock;
  }

  return definition.deepMaterial;
}
