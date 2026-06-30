import { TerrainMaterial } from "../geometry/terrainChunk.ts";
import {
  BLOCK_DEFINITIONS,
  blockDefinitionFor,
  type BlockDefinition,
  type BlockId,
} from "../world/blocks.ts";
import {
  HAND_TOOL,
  type EquippedTool,
  type ToolItemKind,
} from "./ToolTypes.ts";

export type BlockItemId = `block:${BlockId}`;
export type MaterialItemId =
  | "material:stick"
  | "material:coal"
  | "material:raw_copper"
  | "material:raw_iron"
  | "material:raw_gold"
  | "material:crystal";
export type ToolItemId = `tool:${ToolItemKind}`;
export type ItemId = BlockItemId | MaterialItemId | ToolItemId;

type BaseItemDefinition = Readonly<{
  id: ItemId;
  displayName: string;
  shortName: string;
  maxStackSize: number;
  placeable: boolean;
}>;

export type BlockItemDefinition = BaseItemDefinition &
  Readonly<{
    kind: "block";
    material: TerrainMaterial;
    block: BlockDefinition;
  }>;

export type ToolItemDefinition = BaseItemDefinition &
  Readonly<{
    kind: "tool";
    tool: EquippedTool;
    maxDurability: number;
  }>;

export type MaterialItemDefinition = BaseItemDefinition &
  Readonly<{
    kind: "material";
  }>;

export type ItemDefinition =
  BlockItemDefinition | MaterialItemDefinition | ToolItemDefinition;

const BLOCK_SHORT_NAMES = new Map<number, string>([
  [TerrainMaterial.Planks, "Planks"],
]);

const TOOL_DEFINITIONS = [
  {
    id: "tool:pickaxe",
    displayName: "Wooden Pickaxe",
    shortName: "Pickaxe",
    maxStackSize: 1,
    placeable: false,
    kind: "tool",
    tool: { kind: "pickaxe", speedMultiplier: 4 },
    maxDurability: 48,
  },
  {
    id: "tool:shovel",
    displayName: "Wooden Shovel",
    shortName: "Shovel",
    maxStackSize: 1,
    placeable: false,
    kind: "tool",
    tool: { kind: "shovel", speedMultiplier: 4 },
    maxDurability: 48,
  },
  {
    id: "tool:axe",
    displayName: "Wooden Axe",
    shortName: "Axe",
    maxStackSize: 1,
    placeable: false,
    kind: "tool",
    tool: { kind: "axe", speedMultiplier: 4 },
    maxDurability: 48,
  },
  {
    id: "tool:shears",
    displayName: "Shears",
    shortName: "Shears",
    maxStackSize: 1,
    placeable: false,
    kind: "tool",
    tool: { kind: "shears", speedMultiplier: 5 },
    maxDurability: 64,
  },
] as const satisfies readonly ToolItemDefinition[];

function itemIdForBlock(block: BlockDefinition): BlockItemId {
  return `block:${block.id}`;
}

const BLOCK_ITEM_DEFINITIONS: readonly BlockItemDefinition[] =
  BLOCK_DEFINITIONS.filter(
    (block) =>
      block.numericId !== TerrainMaterial.Air &&
      block.numericId !== TerrainMaterial.Water &&
      block.numericId !== TerrainMaterial.Bedrock,
  ).map((block) => ({
    id: itemIdForBlock(block),
    displayName: block.displayName,
    shortName: BLOCK_SHORT_NAMES.get(block.numericId) ?? block.displayName,
    maxStackSize: 64,
    placeable: block.placeable,
    kind: "block",
    material: block.numericId as TerrainMaterial,
    block,
  }));

const MATERIAL_ITEM_DEFINITIONS = [
  {
    id: "material:stick",
    displayName: "Stick",
    shortName: "Stick",
    maxStackSize: 64,
    placeable: false,
    kind: "material",
  },
  {
    id: "material:coal",
    displayName: "Coal",
    shortName: "Coal",
    maxStackSize: 64,
    placeable: false,
    kind: "material",
  },
  {
    id: "material:raw_copper",
    displayName: "Raw Copper",
    shortName: "Copper",
    maxStackSize: 64,
    placeable: false,
    kind: "material",
  },
  {
    id: "material:raw_iron",
    displayName: "Raw Iron",
    shortName: "Iron",
    maxStackSize: 64,
    placeable: false,
    kind: "material",
  },
  {
    id: "material:raw_gold",
    displayName: "Raw Gold",
    shortName: "Gold",
    maxStackSize: 64,
    placeable: false,
    kind: "material",
  },
  {
    id: "material:crystal",
    displayName: "Crystal",
    shortName: "Crystal",
    maxStackSize: 64,
    placeable: false,
    kind: "material",
  },
] as const satisfies readonly MaterialItemDefinition[];

export const ITEM_DEFINITIONS: readonly ItemDefinition[] = [
  ...BLOCK_ITEM_DEFINITIONS,
  ...MATERIAL_ITEM_DEFINITIONS,
  ...TOOL_DEFINITIONS,
];

export const ITEMS_BY_ID: ReadonlyMap<string, ItemDefinition> = new Map(
  ITEM_DEFINITIONS.map((item) => [item.id, item]),
);

export const DEFAULT_CREATIVE_HOTBAR_ITEM_IDS = [
  "block:dirt",
  "block:stone",
  "block:wood",
  "block:planks",
  "block:sand",
  "block:torch",
  "tool:pickaxe",
  "tool:shovel",
  "tool:axe",
] as const satisfies readonly ItemId[];

export const DEFAULT_SURVIVAL_HOTBAR_ITEM_IDS = [
  "block:dirt",
  "tool:pickaxe",
  "tool:shovel",
  "tool:axe",
] as const satisfies readonly ItemId[];

export const HOTBAR_SLOT_COUNT = DEFAULT_CREATIVE_HOTBAR_ITEM_IDS.length;

export function itemDefinitionFor(itemId: string): ItemDefinition | null {
  return ITEMS_BY_ID.get(itemId) ?? null;
}

export function itemDefinitionOrThrow(itemId: ItemId): ItemDefinition {
  const item = itemDefinitionFor(itemId);

  if (!item) {
    throw new Error(`Unknown item: ${itemId}`);
  }

  return item;
}

export function blockItemIdForMaterial(
  material: TerrainMaterial,
): BlockItemId | null {
  const block = blockDefinitionFor(material);
  const itemId = itemIdForBlock(block);

  return ITEMS_BY_ID.has(itemId) ? itemId : null;
}

export function materialForBlockItem(itemId: string): TerrainMaterial | null {
  const item = itemDefinitionFor(itemId);

  return item?.kind === "block" ? item.material : null;
}

export function placeableMaterialForItem(
  itemId: string,
): TerrainMaterial | null {
  const item = itemDefinitionFor(itemId);

  return item?.kind === "block" && item.placeable ? item.material : null;
}

export function equippedToolForItem(itemId: string | null): EquippedTool {
  const item = itemId ? itemDefinitionFor(itemId) : null;

  return item?.kind === "tool" ? item.tool : HAND_TOOL;
}
