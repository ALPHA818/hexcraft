import {
  TerrainMaterial,
  type TerrainBiome,
} from "../geometry/terrainChunk.ts";

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
}>;

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
  },
} as const satisfies Record<TerrainBiome, TerrainBiomeDefinition>;

export function biomeDefinitionFor(
  biome: TerrainBiome,
): TerrainBiomeDefinition {
  return BIOME_DEFINITIONS[biome];
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
