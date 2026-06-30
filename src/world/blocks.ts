export type BlockId =
  | "air"
  | "grass"
  | "dirt"
  | "stone"
  | "bedrock"
  | "sand"
  | "snow"
  | "alpine_rock"
  | "dry_grass"
  | "water"
  | "wood"
  | "leaves"
  | "planks"
  | "deep_stone"
  | "coal_ore"
  | "iron_ore"
  | "copper_ore"
  | "gold_ore"
  | "crystal_ore"
  | "cactus"
  | "flower"
  | "mushroom"
  | "torch";

export type PreferredTool =
  "hand" | "shovel" | "pickaxe" | "axe" | "shears" | "bucket";

export type BlockTextures = Readonly<{
  top: string;
  side: string;
  bottom: string;
}>;

export type BlockDrop = Readonly<{
  numericId?: number;
  itemId?: string;
  quantity: number;
}>;

export type BlockDefinition = Readonly<{
  id: BlockId;
  numericId: number;
  displayName: string;
  solid: boolean;
  opaque: boolean;
  fluid: boolean;
  breakable: boolean;
  placeable: boolean;
  hardness: number;
  preferredTool: PreferredTool;
  drops: readonly BlockDrop[];
  textures: BlockTextures;
  lightEmission?: number;
}>;

export const MATERIAL_NUMERIC_IDS = {
  Air: 0,
  Grass: 1,
  Dirt: 2,
  Stone: 3,
  Bedrock: 12,
  Sand: 4,
  Snow: 5,
  AlpineRock: 6,
  DryGrass: 7,
  Water: 8,
  Wood: 9,
  Leaves: 10,
  Planks: 11,
  CoalOre: 13,
  IronOre: 14,
  CopperOre: 15,
  Cactus: 16,
  Flower: 17,
  Mushroom: 18,
  DeepStone: 19,
  GoldOre: 20,
  CrystalOre: 21,
  Torch: 22,
} as const;

function sameTexture(name: string): BlockTextures {
  return {
    top: name,
    side: name,
    bottom: name,
  };
}

function singleDrop(numericId: number): readonly BlockDrop[] {
  return [{ numericId, quantity: 1 }];
}

function itemDrop(itemId: string): readonly BlockDrop[] {
  return [{ itemId, quantity: 1 }];
}

export const BLOCK_DEFINITIONS = [
  {
    id: "air",
    numericId: MATERIAL_NUMERIC_IDS.Air,
    displayName: "Air",
    solid: false,
    opaque: false,
    fluid: false,
    breakable: false,
    placeable: false,
    hardness: 0,
    preferredTool: "hand",
    drops: [],
    textures: sameTexture("air"),
  },
  {
    id: "grass",
    numericId: MATERIAL_NUMERIC_IDS.Grass,
    displayName: "Grass",
    solid: true,
    opaque: true,
    fluid: false,
    breakable: true,
    placeable: false,
    hardness: 0.6,
    preferredTool: "shovel",
    drops: singleDrop(MATERIAL_NUMERIC_IDS.Dirt),
    textures: {
      top: "grass_top",
      side: "grass_side",
      bottom: "dirt",
    },
  },
  {
    id: "dirt",
    numericId: MATERIAL_NUMERIC_IDS.Dirt,
    displayName: "Dirt",
    solid: true,
    opaque: true,
    fluid: false,
    breakable: true,
    placeable: true,
    hardness: 0.5,
    preferredTool: "shovel",
    drops: singleDrop(MATERIAL_NUMERIC_IDS.Dirt),
    textures: sameTexture("dirt"),
  },
  {
    id: "stone",
    numericId: MATERIAL_NUMERIC_IDS.Stone,
    displayName: "Stone",
    solid: true,
    opaque: true,
    fluid: false,
    breakable: true,
    placeable: true,
    hardness: 1.5,
    preferredTool: "pickaxe",
    drops: singleDrop(MATERIAL_NUMERIC_IDS.Stone),
    textures: sameTexture("stone"),
  },
  {
    id: "bedrock",
    numericId: MATERIAL_NUMERIC_IDS.Bedrock,
    displayName: "Bedrock",
    solid: true,
    opaque: true,
    fluid: false,
    breakable: false,
    placeable: false,
    hardness: Number.POSITIVE_INFINITY,
    preferredTool: "pickaxe",
    drops: [],
    textures: sameTexture("stone"),
  },
  {
    id: "sand",
    numericId: MATERIAL_NUMERIC_IDS.Sand,
    displayName: "Sand",
    solid: true,
    opaque: true,
    fluid: false,
    breakable: true,
    placeable: true,
    hardness: 0.5,
    preferredTool: "shovel",
    drops: singleDrop(MATERIAL_NUMERIC_IDS.Sand),
    textures: sameTexture("sand"),
  },
  {
    id: "snow",
    numericId: MATERIAL_NUMERIC_IDS.Snow,
    displayName: "Snow",
    solid: true,
    opaque: true,
    fluid: false,
    breakable: true,
    placeable: false,
    hardness: 0.2,
    preferredTool: "shovel",
    drops: singleDrop(MATERIAL_NUMERIC_IDS.Dirt),
    textures: sameTexture("snow"),
  },
  {
    id: "alpine_rock",
    numericId: MATERIAL_NUMERIC_IDS.AlpineRock,
    displayName: "Alpine Rock",
    solid: true,
    opaque: true,
    fluid: false,
    breakable: true,
    placeable: false,
    hardness: 1.8,
    preferredTool: "pickaxe",
    drops: singleDrop(MATERIAL_NUMERIC_IDS.Stone),
    textures: sameTexture("alpine_rock"),
  },
  {
    id: "dry_grass",
    numericId: MATERIAL_NUMERIC_IDS.DryGrass,
    displayName: "Dry Grass",
    solid: true,
    opaque: true,
    fluid: false,
    breakable: true,
    placeable: false,
    hardness: 0.6,
    preferredTool: "shovel",
    drops: singleDrop(MATERIAL_NUMERIC_IDS.Dirt),
    textures: sameTexture("dry_grass"),
  },
  {
    id: "water",
    numericId: MATERIAL_NUMERIC_IDS.Water,
    displayName: "Water",
    solid: false,
    opaque: false,
    fluid: true,
    breakable: false,
    placeable: false,
    hardness: 100,
    preferredTool: "bucket",
    drops: [],
    textures: sameTexture("water"),
  },
  {
    id: "wood",
    numericId: MATERIAL_NUMERIC_IDS.Wood,
    displayName: "Wood",
    solid: true,
    opaque: true,
    fluid: false,
    breakable: true,
    placeable: true,
    hardness: 2,
    preferredTool: "axe",
    drops: singleDrop(MATERIAL_NUMERIC_IDS.Wood),
    textures: sameTexture("wood"),
  },
  {
    id: "leaves",
    numericId: MATERIAL_NUMERIC_IDS.Leaves,
    displayName: "Leaves",
    solid: true,
    opaque: false,
    fluid: false,
    breakable: true,
    placeable: false,
    hardness: 0.2,
    preferredTool: "shears",
    drops: [],
    textures: sameTexture("leaves"),
  },
  {
    id: "planks",
    numericId: MATERIAL_NUMERIC_IDS.Planks,
    displayName: "Wood Planks",
    solid: true,
    opaque: true,
    fluid: false,
    breakable: true,
    placeable: true,
    hardness: 2,
    preferredTool: "axe",
    drops: singleDrop(MATERIAL_NUMERIC_IDS.Planks),
    textures: sameTexture("planks"),
  },
  {
    id: "coal_ore",
    numericId: MATERIAL_NUMERIC_IDS.CoalOre,
    displayName: "Coal Ore",
    solid: true,
    opaque: true,
    fluid: false,
    breakable: true,
    placeable: true,
    hardness: 1.8,
    preferredTool: "pickaxe",
    drops: itemDrop("material:coal"),
    textures: sameTexture("coal_ore"),
  },
  {
    id: "iron_ore",
    numericId: MATERIAL_NUMERIC_IDS.IronOre,
    displayName: "Iron Ore",
    solid: true,
    opaque: true,
    fluid: false,
    breakable: true,
    placeable: true,
    hardness: 2.2,
    preferredTool: "pickaxe",
    drops: itemDrop("material:raw_iron"),
    textures: sameTexture("iron_ore"),
  },
  {
    id: "copper_ore",
    numericId: MATERIAL_NUMERIC_IDS.CopperOre,
    displayName: "Copper Ore",
    solid: true,
    opaque: true,
    fluid: false,
    breakable: true,
    placeable: true,
    hardness: 2,
    preferredTool: "pickaxe",
    drops: itemDrop("material:raw_copper"),
    textures: sameTexture("copper_ore"),
  },
  {
    id: "deep_stone",
    numericId: MATERIAL_NUMERIC_IDS.DeepStone,
    displayName: "Deep Stone",
    solid: true,
    opaque: true,
    fluid: false,
    breakable: true,
    placeable: true,
    hardness: 2.4,
    preferredTool: "pickaxe",
    drops: singleDrop(MATERIAL_NUMERIC_IDS.DeepStone),
    textures: sameTexture("deep_stone"),
  },
  {
    id: "gold_ore",
    numericId: MATERIAL_NUMERIC_IDS.GoldOre,
    displayName: "Gold Ore",
    solid: true,
    opaque: true,
    fluid: false,
    breakable: true,
    placeable: true,
    hardness: 2.6,
    preferredTool: "pickaxe",
    drops: itemDrop("material:raw_gold"),
    textures: sameTexture("gold_ore"),
  },
  {
    id: "crystal_ore",
    numericId: MATERIAL_NUMERIC_IDS.CrystalOre,
    displayName: "Crystal Ore",
    solid: true,
    opaque: true,
    fluid: false,
    breakable: true,
    placeable: true,
    hardness: 3,
    preferredTool: "pickaxe",
    drops: itemDrop("material:crystal"),
    textures: sameTexture("crystal_ore"),
    lightEmission: 7,
  },
  {
    id: "cactus",
    numericId: MATERIAL_NUMERIC_IDS.Cactus,
    displayName: "Cactus",
    solid: true,
    opaque: true,
    fluid: false,
    breakable: true,
    placeable: false,
    hardness: 0.4,
    preferredTool: "axe",
    drops: singleDrop(MATERIAL_NUMERIC_IDS.Cactus),
    textures: sameTexture("cactus"),
  },
  {
    id: "flower",
    numericId: MATERIAL_NUMERIC_IDS.Flower,
    displayName: "Flower",
    solid: true,
    opaque: true,
    fluid: false,
    breakable: true,
    placeable: false,
    hardness: 0.1,
    preferredTool: "hand",
    drops: singleDrop(MATERIAL_NUMERIC_IDS.Flower),
    textures: sameTexture("flower"),
  },
  {
    id: "mushroom",
    numericId: MATERIAL_NUMERIC_IDS.Mushroom,
    displayName: "Mushroom",
    solid: true,
    opaque: true,
    fluid: false,
    breakable: true,
    placeable: false,
    hardness: 0.1,
    preferredTool: "hand",
    drops: singleDrop(MATERIAL_NUMERIC_IDS.Mushroom),
    textures: sameTexture("mushroom"),
  },
  {
    id: "torch",
    numericId: MATERIAL_NUMERIC_IDS.Torch,
    displayName: "Torch",
    solid: false,
    opaque: false,
    fluid: false,
    breakable: true,
    placeable: true,
    hardness: 0.1,
    preferredTool: "hand",
    drops: singleDrop(MATERIAL_NUMERIC_IDS.Torch),
    textures: sameTexture("torch"),
    lightEmission: 14,
  },
] as const satisfies readonly BlockDefinition[];

export const BLOCKS_BY_NUMERIC_ID: ReadonlyMap<number, BlockDefinition> =
  new Map(BLOCK_DEFINITIONS.map((block) => [block.numericId, block]));

export const HOTBAR_BLOCK_NUMERIC_IDS = [
  MATERIAL_NUMERIC_IDS.Dirt,
  MATERIAL_NUMERIC_IDS.Stone,
  MATERIAL_NUMERIC_IDS.Wood,
  MATERIAL_NUMERIC_IDS.Planks,
  MATERIAL_NUMERIC_IDS.Sand,
] as const;

export function blockDefinitionFor(numericId: number): BlockDefinition {
  return BLOCKS_BY_NUMERIC_ID.get(numericId) ?? BLOCK_DEFINITIONS[0];
}

export function isBlockFluid(numericId: number): boolean {
  return blockDefinitionFor(numericId).fluid;
}

export function isBlockCollisionSolid(numericId: number): boolean {
  const block = blockDefinitionFor(numericId);
  return block.solid && !block.fluid;
}

export function isBlockRaycastTarget(numericId: number): boolean {
  return isBlockCollisionSolid(numericId);
}

export function isBlockOpaque(numericId: number): boolean {
  return blockDefinitionFor(numericId).opaque;
}

export function minedDrop(numericId: number): number | null {
  return blockDefinitionFor(numericId).drops[0]?.numericId ?? null;
}

export function minedDrops(numericId: number): readonly BlockDrop[] {
  return blockDefinitionFor(numericId).drops;
}
