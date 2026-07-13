import {
  TerrainMaterial,
  TERRAIN_DEPTH_BLOCKS,
  type TerrainBiome,
} from "../geometry/terrainChunk.ts";
import { itemIdForMaterial, type ItemId } from "../items/ItemRegistry.ts";
import {
  DEFAULT_MATERIAL_CONFIG,
  normalizeMaterialConfig,
  type MaterialConfig,
} from "../materials/MaterialConfig.ts";
import {
  materialTraceDiscoveryForEvent,
  type MaterialAffinitySource,
} from "../materials/MaterialBiomeAffinities.ts";
import { stableHashFloat } from "../materials/MaterialHash.ts";
import type { MaterialDefinition } from "../materials/MaterialTypes.ts";
import {
  dynamicMaterialBlockDropItemId,
  isDynamicMaterialBlock,
} from "../world/DynamicMaterialBlocks.ts";
import { blockDefinitionFor } from "../world/blocks.ts";

export type MaterialDropInventory = Readonly<{
  add: (material: TerrainMaterial, quantity: number) => void;
  addItem: (itemId: ItemId, quantity: number) => boolean;
}>;

export type MaterialDropMaterialSource = Readonly<{
  getMaterialById: (materialId: string) => MaterialDefinition | null;
  discoverMaterial: (materialId: string) => boolean;
  hasDiscovered?: (materialId: string) => boolean;
  hasDiscoveredMaterial?: (materialId: string) => boolean;
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
  isMountain?: boolean;
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
  if (context.isMountain) {
    sources.push("mountain");
  }

  return sources;
}

function normalizedTraceChance(
  config: MaterialDropDiscoveryContext["config"] | undefined,
): number {
  return normalizeMaterialConfig({
    ...DEFAULT_MATERIAL_CONFIG,
    ...config,
  }).materialTraceDiscoveryChance;
}

function traceSeed(context: MaterialDropDiscoveryContext): string {
  return Number.isFinite(context.config?.seed)
    ? `${context.worldSeed}:${context.config?.seed}`
    : String(context.worldSeed);
}

function traceEventKey(
  context: MaterialDropDiscoveryContext,
  minedMaterial: TerrainMaterial,
  suffix: string,
): string {
  return `${context.q},${context.r},${context.level}:${minedMaterial}:${suffix}`;
}

function canRollUndergroundSiliconTrace(
  minedMaterial: TerrainMaterial,
  context: MaterialDropDiscoveryContext | undefined,
): context is MaterialDropDiscoveryContext {
  return (
    minedMaterial === TerrainMaterial.Stone &&
    context !== undefined &&
    context.level < TERRAIN_DEPTH_BLOCKS
  );
}

function addTraceDiscovery(
  materialId: string,
  materials: MaterialDropMaterialSource,
  inventory: MaterialDropInventory,
  discoveredMaterialIds: string[],
  materialItemIds: ItemId[],
  traceMaterialIds: string[],
  notifications: string[],
  suppressNotifications: boolean,
): void {
  const material = materials.getMaterialById(materialId);

  if (!material || material.generation !== 0) {
    return;
  }

  const alreadyDiscovered =
    materials.hasDiscovered?.(material.id) ??
    materials.hasDiscoveredMaterial?.(material.id) ??
    false;

  if (alreadyDiscovered) {
    return;
  }

  const newlyDiscovered = materials.discoverMaterial(material.id);
  const materialItemId = itemIdForMaterial(material.id);

  inventory.addItem(materialItemId, 1);
  materialItemIds.push(materialItemId);
  traceMaterialIds.push(material.id);

  if (newlyDiscovered) {
    discoveredMaterialIds.push(material.id);
    if (!suppressNotifications) {
      notifications.push(`Found trace of ${material.name}`);
    }
  }
}

function applyUndergroundStoneTraceDiscovery(
  minedMaterial: TerrainMaterial,
  materials: MaterialDropMaterialSource,
  inventory: MaterialDropInventory,
  context: MaterialDropDiscoveryContext | undefined,
  discoveredMaterialIds: string[],
  materialItemIds: ItemId[],
  traceMaterialIds: string[],
  notifications: string[],
  suppressNotifications: boolean,
): void {
  if (!canRollUndergroundSiliconTrace(minedMaterial, context)) {
    return;
  }

  const chance = normalizedTraceChance(context.config);

  if (chance <= 0) {
    return;
  }

  const roll = stableHashFloat(
    `${traceSeed(context)}|material-trace|underground-stone|${traceEventKey(
      context,
      minedMaterial,
      "silicon",
    )}|roll`,
    0,
    1,
  );

  if (roll >= chance) {
    return;
  }

  addTraceDiscovery(
    "element:silicon",
    materials,
    inventory,
    discoveredMaterialIds,
    materialItemIds,
    traceMaterialIds,
    notifications,
    suppressNotifications,
  );
}

function applyTraceDiscovery(
  minedMaterial: TerrainMaterial,
  materials: MaterialDropMaterialSource,
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

  addTraceDiscovery(
    trace.materialId,
    materials,
    inventory,
    discoveredMaterialIds,
    materialItemIds,
    traceMaterialIds,
    notifications,
    suppressNotifications,
  );
}

export function applyMaterialDropRules(
  minedMaterial: TerrainMaterial,
  inventory: MaterialDropInventory,
  materials: MaterialDropMaterialSource | null,
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

  if (isDynamicMaterialBlock(minedMaterial)) {
    const materialItemId = dynamicMaterialBlockDropItemId(
      options.dynamicMaterialId,
      materials,
    );

    if (materialItemId) {
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

  if (!materials) {
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
    const material = materials.getMaterialById(rule.materialId);

    if (material) {
      const newlyDiscovered = materials.discoverMaterial(material.id);
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

  applyUndergroundStoneTraceDiscovery(
    minedMaterial,
    materials,
    inventory,
    options.discoveryContext,
    discoveredMaterialIds,
    materialItemIds,
    traceMaterialIds,
    notifications,
    options.suppressNotifications ?? false,
  );

  if (traceMaterialIds.length > 0) {
    return emptyDropResult(
      discoveredMaterialIds,
      materialItemIds,
      traceMaterialIds,
      notifications,
      normalDropCount,
    );
  }

  applyTraceDiscovery(
    minedMaterial,
    materials,
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
