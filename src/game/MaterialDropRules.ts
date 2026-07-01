import {
  TerrainMaterial,
  type TerrainBiome,
} from "../geometry/terrainChunk.ts";
import { itemIdForMaterial, type ItemId } from "../items/ItemRegistry.ts";
import type { MaterialConfig } from "../materials/MaterialConfig.ts";
import {
  materialTraceDiscoveryForEvent,
  type MaterialAffinitySource,
} from "../materials/MaterialBiomeAffinities.ts";
import type { MaterialRegistry } from "../materials/MaterialRegistry.ts";
import { blockDefinitionFor } from "../world/blocks.ts";

export type MaterialDropInventory = Readonly<{
  add: (material: TerrainMaterial, quantity: number) => void;
  addItem: (itemId: ItemId, quantity: number) => boolean;
}>;

export type MaterialDiscoveryRule = Readonly<{
  minedMaterial: TerrainMaterial;
  materialId: string;
  itemQuantity: number;
  notificationName?: string;
}>;

export type MaterialDropRuleResult = Readonly<{
  discoveredMaterialIds: readonly string[];
  materialItemIds: readonly ItemId[];
  traceMaterialIds: readonly string[];
  notifications: readonly string[];
  normalDropCount: number;
}>;

export type MaterialDropDiscoveryContext = Readonly<{
  biome?: TerrainBiome | null;
  isCave?: boolean;
  q: number;
  r: number;
  level: number;
  worldSeed: number;
  config?: Partial<
    Pick<MaterialConfig, "materialTraceDiscoveryChance" | "seed">
  >;
}>;

const MATERIAL_DISCOVERY_RULES = [
  {
    minedMaterial: TerrainMaterial.CoalOre,
    materialId: "element:carbon",
    itemQuantity: 1,
  },
  {
    minedMaterial: TerrainMaterial.IronOre,
    materialId: "element:iron",
    itemQuantity: 1,
  },
  {
    minedMaterial: TerrainMaterial.CopperOre,
    materialId: "element:copper",
    itemQuantity: 1,
  },
  {
    minedMaterial: TerrainMaterial.GoldOre,
    materialId: "element:gold",
    itemQuantity: 1,
  },
  {
    minedMaterial: TerrainMaterial.CrystalOre,
    materialId: "element:silicon",
    itemQuantity: 1,
    notificationName: "Crystal Shard",
  },
] as const satisfies readonly MaterialDiscoveryRule[];

export function materialDiscoveryRuleFor(
  material: TerrainMaterial,
): MaterialDiscoveryRule | null {
  return (
    MATERIAL_DISCOVERY_RULES.find((rule) => rule.minedMaterial === material) ??
    null
  );
}

function emptyDropResult(
  discoveredMaterialIds: readonly string[],
  materialItemIds: readonly ItemId[],
  traceMaterialIds: readonly string[],
  notifications: readonly string[],
  normalDropCount: number,
): MaterialDropRuleResult {
  return {
    discoveredMaterialIds,
    materialItemIds,
    traceMaterialIds,
    notifications,
    normalDropCount,
  };
}

function discoverySourcesForContext(
  context: MaterialDropDiscoveryContext | undefined,
): readonly MaterialAffinitySource[] {
  if (!context) {
    return [];
  }

  const sources: MaterialAffinitySource[] = [];

  if (context.biome) {
    sources.push(context.biome);
  }
  if (context.isCave) {
    sources.push("cave");
  }

  return sources;
}

function applyTraceDiscovery(
  minedMaterial: TerrainMaterial,
  registry: MaterialRegistry,
  inventory: MaterialDropInventory,
  context: MaterialDropDiscoveryContext | undefined,
  knownEventMaterialIds: ReadonlySet<string>,
  discoveredMaterialIds: string[],
  materialItemIds: ItemId[],
  traceMaterialIds: string[],
  notifications: string[],
  suppressNotifications: boolean,
): void {
  const sources = discoverySourcesForContext(context);

  if (!context || sources.length === 0) {
    return;
  }

  const trace = materialTraceDiscoveryForEvent({
    sources,
    worldSeed: context.worldSeed,
    eventKey: `${context.q},${context.r},${context.level}:${minedMaterial}`,
    config: context.config,
  });

  if (!trace || knownEventMaterialIds.has(trace.materialId)) {
    return;
  }

  const material = registry.getMaterialById(trace.materialId);

  if (!material || material.generation !== 0) {
    return;
  }

  const newlyDiscovered = registry.discoverBaseMaterial(material.id);
  const materialItemId = itemIdForMaterial(material.id);

  inventory.addItem(materialItemId, 1);
  materialItemIds.push(materialItemId);
  traceMaterialIds.push(material.id);

  if (newlyDiscovered) {
    discoveredMaterialIds.push(material.id);
    if (!suppressNotifications) {
      notifications.push(`Discovered ${material.name} trace`);
    }
  }
}

export function applyMaterialDropRules(
  minedMaterial: TerrainMaterial,
  inventory: MaterialDropInventory,
  registry: MaterialRegistry | null,
  options: Readonly<{
    dynamicMaterialId?: string | null;
    discoveryContext?: MaterialDropDiscoveryContext;
    suppressNotifications?: boolean;
  }> = {},
): MaterialDropRuleResult {
  const block = blockDefinitionFor(minedMaterial);
  const discoveredMaterialIds: string[] = [];
  const materialItemIds: ItemId[] = [];
  const notifications: string[] = [];
  let normalDropCount = 0;

  for (const drop of block.drops) {
    if (drop.itemId) {
      inventory.addItem(drop.itemId as ItemId, drop.quantity);
      normalDropCount += drop.quantity;
    } else if (drop.numericId !== undefined) {
      inventory.add(drop.numericId as TerrainMaterial, drop.quantity);
      normalDropCount += drop.quantity;
    }
  }

  if (minedMaterial === TerrainMaterial.DynamicMaterial) {
    const materialId =
      typeof options.dynamicMaterialId === "string"
        ? options.dynamicMaterialId
        : "";

    if (materialId !== "" && registry?.hasMaterial(materialId)) {
      const materialItemId = itemIdForMaterial(materialId);

      inventory.addItem(materialItemId, 1);
      materialItemIds.push(materialItemId);
    }

    return {
      discoveredMaterialIds,
      materialItemIds,
      traceMaterialIds: [],
      notifications,
      normalDropCount,
    };
  }

  const rule = materialDiscoveryRuleFor(minedMaterial);

  if (!registry) {
    return emptyDropResult(
      discoveredMaterialIds,
      materialItemIds,
      [],
      notifications,
      normalDropCount,
    );
  }

  const traceMaterialIds: string[] = [];
  const knownEventMaterialIds = new Set<string>();

  if (rule) {
    knownEventMaterialIds.add(rule.materialId);
    const material = registry.getMaterialById(rule.materialId);

    if (material) {
      const newlyDiscovered = registry.discoverBaseMaterial(material.id);
      const materialItemId = itemIdForMaterial(material.id);

      inventory.addItem(materialItemId, rule.itemQuantity);
      materialItemIds.push(materialItemId);

      if (newlyDiscovered) {
        discoveredMaterialIds.push(material.id);
        if (!options.suppressNotifications) {
          notifications.push(
            `Discovered ${rule.notificationName ?? material.name}`,
          );
        }
      }
    }
  }

  applyTraceDiscovery(
    minedMaterial,
    registry,
    inventory,
    options.discoveryContext,
    knownEventMaterialIds,
    discoveredMaterialIds,
    materialItemIds,
    traceMaterialIds,
    notifications,
    options.suppressNotifications ?? false,
  );

  return emptyDropResult(
    discoveredMaterialIds,
    materialItemIds,
    traceMaterialIds,
    notifications,
    normalDropCount,
  );
}
