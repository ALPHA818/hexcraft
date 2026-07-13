import { TerrainMaterial } from "../geometry/terrainChunk.ts";
import type { MaterialDefinition } from "../materials/MaterialTypes.ts";
import {
  generatedMaterialItemDefinitionFor,
  type GeneratedMaterialItemDefinition,
  type GeneratedMaterialItemId,
  type MaterialItemResolver,
} from "./MaterialItemResolver.ts";
import {
  modifiedToolStatsForMaterial,
  type MaterialToolModifier,
} from "./MaterialToolModifier.ts";
import {
  modifiedToolItemId,
  modifiedToolPartsFromItemId,
  type ModifiableBaseToolItemId,
  type ModifiedToolItemId,
} from "./ModifiedToolTypes.ts";
import {
  BLOCK_DEFINITIONS,
  blockDefinitionFor,
  type BlockDefinition,
  type BlockId,
} from "../world/blocks.ts";
import { dynamicMaterialBlockPlacement } from "../world/DynamicMaterialBlocks.ts";
import {
  HAND_TOOL,
  type EquippedTool,
  type ToolItemKind,
} from "./ToolTypes.ts";
import type { EquipmentSlotId } from "../game/Equipment.ts";

export {
  baseToolIdFromModifiedToolItemId,
  isModifiedToolItemId,
  materialIdFromModifiedToolItemId,
  modifiedToolItemId,
  modifiedToolRecipeId,
  modifiedToolPartsFromItemId,
} from "./ModifiedToolTypes.ts";
export {
  isGeneratedMaterialItemId,
  itemIdForMaterial,
  materialIdFromItemId,
} from "./MaterialItemResolver.ts";
export type {
  GeneratedMaterialItemDefinition,
  GeneratedMaterialItemId,
  MaterialItemResolver,
} from "./MaterialItemResolver.ts";

export type BlockItemId = `block:${BlockId}`;
export type StaticMaterialItemId =
  | "material:stick"
  | "material:coal"
  | "material:raw_copper"
  | "material:raw_iron"
  | "material:raw_gold"
  | "material:crystal"
  | "material:fuel_cell"
  | "material:magic_core"
  | "material:explosive_compound"
  | "material:circuit";
export type MaterialItemId = StaticMaterialItemId | GeneratedMaterialItemId;
export type StaticToolItemId = `tool:${ToolItemKind}`;
export type ToolItemId = StaticToolItemId | ModifiedToolItemId;
export type EquipmentItemId =
  | "equipment:gloves"
  | "equipment:goggles"
  | "equipment:respirator"
  | "equipment:backpack";
export type ItemId =
  BlockItemId | MaterialItemId | ToolItemId | EquipmentItemId;

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

export type ModifiedToolItemDefinition = ToolItemDefinition &
  Readonly<{
    id: ModifiedToolItemId;
    baseToolId: ModifiableBaseToolItemId;
    materialId: string;
    material: MaterialDefinition;
    modifier: MaterialToolModifier;
  }>;

export type MaterialItemDefinition = BaseItemDefinition &
  Readonly<{
    kind: "material";
  }>;

export type EquipmentItemDefinition = BaseItemDefinition &
  Readonly<{
    kind: "equipment";
    equipmentSlot: EquipmentSlotId;
    equipmentType: "gloves" | "goggles" | "respirator" | "backpack";
  }>;

export type ItemDefinition =
  | BlockItemDefinition
  | EquipmentItemDefinition
  | GeneratedMaterialItemDefinition
  | MaterialItemDefinition
  | ModifiedToolItemDefinition
  | ToolItemDefinition;

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

const TOOLS_BY_ID: ReadonlyMap<string, ToolItemDefinition> = new Map(
  TOOL_DEFINITIONS.map((tool) => [tool.id, tool]),
);

function itemIdForBlock(block: BlockDefinition): BlockItemId {
  return `block:${block.id}`;
}

const BLOCK_ITEM_DEFINITIONS: readonly BlockItemDefinition[] =
  BLOCK_DEFINITIONS.filter(
    (block) =>
      block.numericId !== TerrainMaterial.Air &&
      block.numericId !== TerrainMaterial.Water &&
      block.numericId !== TerrainMaterial.Bedrock &&
      block.numericId !== TerrainMaterial.DynamicMaterial,
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
  {
    id: "material:fuel_cell",
    displayName: "Material Fuel Cell",
    shortName: "Fuel Cell",
    maxStackSize: 64,
    placeable: false,
    kind: "material",
  },
  {
    id: "material:magic_core",
    displayName: "Magic Core",
    shortName: "Magic Core",
    maxStackSize: 64,
    placeable: false,
    kind: "material",
  },
  {
    id: "material:explosive_compound",
    displayName: "Explosive Compound",
    shortName: "Explosive",
    maxStackSize: 64,
    placeable: false,
    kind: "material",
  },
  {
    id: "material:circuit",
    displayName: "Material Circuit",
    shortName: "Circuit",
    maxStackSize: 64,
    placeable: false,
    kind: "material",
  },
] as const satisfies readonly MaterialItemDefinition[];

const EQUIPMENT_ITEM_DEFINITIONS = [
  {
    id: "equipment:gloves",
    displayName: "Work Gloves",
    shortName: "Gloves",
    maxStackSize: 1,
    placeable: false,
    kind: "equipment",
    equipmentSlot: "hands",
    equipmentType: "gloves",
  },
  {
    id: "equipment:goggles",
    displayName: "Protective Goggles",
    shortName: "Goggles",
    maxStackSize: 1,
    placeable: false,
    kind: "equipment",
    equipmentSlot: "head",
    equipmentType: "goggles",
  },
  {
    id: "equipment:respirator",
    displayName: "Respirator",
    shortName: "Respirator",
    maxStackSize: 1,
    placeable: false,
    kind: "equipment",
    equipmentSlot: "head",
    equipmentType: "respirator",
  },
  {
    id: "equipment:backpack",
    displayName: "Utility Backpack",
    shortName: "Backpack",
    maxStackSize: 1,
    placeable: false,
    kind: "equipment",
    equipmentSlot: "back",
    equipmentType: "backpack",
  },
] as const satisfies readonly EquipmentItemDefinition[];

export const ITEM_DEFINITIONS: readonly ItemDefinition[] = [
  ...BLOCK_ITEM_DEFINITIONS,
  ...MATERIAL_ITEM_DEFINITIONS,
  ...EQUIPMENT_ITEM_DEFINITIONS,
  ...TOOL_DEFINITIONS,
];

export const ITEMS_BY_ID: ReadonlyMap<string, ItemDefinition> = new Map(
  ITEM_DEFINITIONS.map((item) => [item.id, item]),
);

export const HOTBAR_SLOT_COUNT = 9;

export function isStabilizedPlaceableMaterial(
  material: Pick<MaterialDefinition, "generation" | "stability">,
): boolean {
  return material.generation > 0 && material.stability >= 50;
}

function modifiedToolItemDefinitionFor(
  itemId: string,
  resolver: MaterialItemResolver | null | undefined,
): ModifiedToolItemDefinition | null {
  const parts = modifiedToolPartsFromItemId(itemId);

  if (!parts || !resolver) {
    return null;
  }

  const baseTool = TOOLS_BY_ID.get(parts.baseToolId);
  const material = resolver.getMaterialById(parts.materialId);

  if (!baseTool || !material) {
    return null;
  }

  const stats = modifiedToolStatsForMaterial(baseTool, material);

  return {
    id: modifiedToolItemId(parts.baseToolId, material.id),
    displayName: stats.displayName,
    shortName: stats.shortName,
    maxStackSize: 1,
    placeable: false,
    kind: "tool",
    tool: stats.tool,
    maxDurability: stats.maxDurability,
    baseToolId: parts.baseToolId,
    materialId: material.id,
    material,
    modifier: stats.modifier,
  };
}

export function itemDefinitionFor(
  itemId: string,
  resolver?: MaterialItemResolver | null,
): ItemDefinition | null {
  return (
    ITEMS_BY_ID.get(itemId) ??
    generatedMaterialItemDefinitionFor(itemId, resolver) ??
    modifiedToolItemDefinitionFor(itemId, resolver)
  );
}

export function itemDefinitionOrThrow(
  itemId: ItemId,
  resolver?: MaterialItemResolver | null,
): ItemDefinition {
  const item = itemDefinitionFor(itemId, resolver);

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
  resolver?: MaterialItemResolver | null,
): TerrainMaterial | null {
  const item = itemDefinitionFor(itemId, resolver);

  if (
    item?.kind === "generated_material" &&
    item.material &&
    isStabilizedPlaceableMaterial(item.material)
  ) {
    return dynamicMaterialBlockPlacement(item.material.id)?.material ?? null;
  }

  return item?.kind === "block" && item.placeable ? item.material : null;
}

export function equippedToolForItem(
  itemId: string | null,
  resolver?: MaterialItemResolver | null,
): EquippedTool {
  const item = itemId ? itemDefinitionFor(itemId, resolver) : null;

  return item?.kind === "tool" ? item.tool : HAND_TOOL;
}
