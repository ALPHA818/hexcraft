import type { GameSettings } from "../game/GameSettings.ts";
import type { GameMode } from "../game/gameMode.ts";
import { TerrainMaterial } from "../geometry/terrainChunk.ts";
import {
  blockItemIdForMaterial,
  itemDefinitionFor,
} from "../items/ItemRegistry.ts";
import type { SerializedItemStack } from "../items/ItemStack.ts";
import { BASE_ELEMENT_MATERIALS } from "../materials/BaseElements.ts";
import {
  DEFAULT_MATERIAL_CONFIG,
  normalizeMaterialConfig,
  type MaterialConfig,
} from "../materials/MaterialConfig.ts";
import { MaterialRegistry } from "../materials/MaterialRegistry.ts";
import {
  normalizeMaterialResearchTier,
  normalizeMaterialResearchState,
} from "../materials/MaterialResearch.ts";
import { isMaterialProcessingStationType } from "../materials/MaterialStations.ts";
import {
  MATERIAL_STAT_KEYS,
  type MaterialDefinition,
  type MaterialProcessingStationType,
  type MaterialRarity,
  type MaterialResearchTier,
  type MaterialStatKey,
  type MaterialStats,
} from "../materials/MaterialTypes.ts";
import {
  defaultSerializedGameTimeState,
  normalizeSerializedGameTimeState,
  type SerializedGameTimeState,
} from "../world/GameTime.ts";
import type { TerrainEdit } from "../world/InfiniteTerrain.ts";

export const CURRENT_SAVE_VERSION = 1;

export type SaveVersion = typeof CURRENT_SAVE_VERSION;

export type WorldSaveMetadata = Readonly<{
  id: string;
  saveVersion: SaveVersion;
  name: string;
  seed: number;
  gameMode: GameMode;
  renderDistance: number;
  chunkSize: number;
  enableWeather: boolean;
  enableDayNightCycle: boolean;
  debugOverlay: boolean;
  showMobileControls: boolean;
  createdAt: number;
  updatedAt: number;
}>;

export type SerializedVec3 = readonly [number, number, number];

export type LegacySerializedInventoryItem = Readonly<{
  material: number;
  count: number;
}>;

export type SerializedInventory = Readonly<{
  selectedHotbarIndex?: number;
  hotbar?: readonly (SerializedItemStack | null)[];
  backpack?: readonly (SerializedItemStack | null)[];
  selectedIndex?: number;
  slots?: readonly (SerializedItemStack | null)[];
  items?: readonly LegacySerializedInventoryItem[];
}>;

export const SAVE_HOTBAR_SLOT_COUNT = 9;
export const SAVE_BACKPACK_SLOT_COUNT = 27;
const UNKNOWN_ITEM_MAX_STACK_SIZE = 9999;

export type SerializedMaterialStorageItem = Readonly<{
  materialId: string;
  quantity: number;
}>;

export type SerializedMaterialStorage = Readonly<{
  materials: readonly SerializedMaterialStorageItem[];
}>;

export type SerializedPlayerState = Readonly<{
  position: SerializedVec3 | null;
}>;

export const MATERIAL_CODEX_SAVE_VERSION = 1;

export const BASIC_STARTING_ELEMENT_IDS = [
  "element:hydrogen",
  "element:oxygen",
  "element:carbon",
  "element:nitrogen",
  "element:silicon",
  "element:iron",
  "element:copper",
  "element:sulfur",
  "element:sodium",
  "element:chlorine",
] as const;

export type SerializedMaterial = Readonly<
  {
    id: string;
    name: string;
    generation: number;
    parents: readonly string[];
    rarity: MaterialRarity;
    tags: readonly string[];
    requiredResearchTier: MaterialResearchTier | undefined;
    stationType: MaterialProcessingStationType | undefined;
    discoveredAt: number | undefined;
    description: string | undefined;
  } & MaterialStats
>;

export type SerializedMaterialRecipe = Readonly<{
  recipeKey: string;
  parentAId: string;
  parentBId: string;
  resultMaterialId: string;
  stationType: MaterialProcessingStationType;
}>;

export type SerializedMaterialCodex = Readonly<{
  version: typeof MATERIAL_CODEX_SAVE_VERSION;
  discoveredMaterialIds: readonly string[];
  generatedMaterials: readonly SerializedMaterial[];
  recipeResults: readonly SerializedMaterialRecipe[];
  unlockedResearchTiers: readonly MaterialResearchTier[];
}>;

export type TerrainEditChunkSave = Readonly<{
  id: string;
  worldId: string;
  chunkKey: string;
  chunkQ: number;
  chunkR: number;
  edits: readonly TerrainEdit[];
}>;

export type WorldRuntimeStateSave = Readonly<{
  worldId: string;
  player: SerializedPlayerState;
  inventory: SerializedInventory;
  gameTime: SerializedGameTimeState;
  materialCodex: SerializedMaterialCodex;
  materialStorage: SerializedMaterialStorage;
}>;

export type LoadedWorldSave = Readonly<{
  metadata: WorldSaveMetadata;
  runtime: WorldRuntimeStateSave;
  terrainEditChunks: readonly TerrainEditChunkSave[];
}>;

export function metadataFromSettings(
  id: string,
  settings: GameSettings,
  timestamp = Date.now(),
): WorldSaveMetadata {
  return {
    id,
    saveVersion: CURRENT_SAVE_VERSION,
    name: settings.worldName,
    seed: settings.worldSeed,
    gameMode: settings.gameMode,
    renderDistance: settings.renderDistance,
    chunkSize: settings.chunkSize,
    enableWeather: settings.enableWeather,
    enableDayNightCycle: settings.enableDayNightCycle,
    debugOverlay: settings.debugOverlay,
    showMobileControls: settings.showMobileControls,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function settingsFromMetadata(
  metadata: WorldSaveMetadata,
): GameSettings {
  return {
    worldName: metadata.name,
    gameMode: metadata.gameMode,
    worldSeed: metadata.seed,
    renderDistance: metadata.renderDistance,
    chunkSize: metadata.chunkSize,
    enableWeather: metadata.enableWeather,
    enableDayNightCycle: metadata.enableDayNightCycle,
    debugOverlay: metadata.debugOverlay,
    showMobileControls: metadata.showMobileControls,
  };
}

export function emptyInventorySave(): SerializedInventory {
  return {
    selectedHotbarIndex: 0,
    hotbar: emptySerializedInventorySlots(SAVE_HOTBAR_SLOT_COUNT),
    backpack: emptySerializedInventorySlots(SAVE_BACKPACK_SLOT_COUNT),
  };
}

function emptySerializedInventorySlots(
  count: number,
): readonly (SerializedItemStack | null)[] {
  return Array.from({ length: count }, () => null);
}

function warnUnknownSavedItemId(itemId: string): void {
  console.warn(`Unknown item id in saved inventory: ${itemId}`);
}

function normalizeSerializedItemStackValue(
  value: unknown,
): SerializedItemStack | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const stack = value as Record<string, unknown>;
  const itemId = typeof stack.itemId === "string" ? stack.itemId.trim() : "";
  const count =
    typeof stack.count === "number" && Number.isFinite(stack.count)
      ? Math.floor(stack.count)
      : 0;

  if (itemId === "" || count <= 0) {
    return null;
  }

  const item = itemDefinitionFor(itemId);
  const durability =
    typeof stack.durability === "number" && Number.isFinite(stack.durability)
      ? Math.floor(stack.durability)
      : undefined;

  if (!item) {
    warnUnknownSavedItemId(itemId);
    return {
      itemId,
      count: Math.min(UNKNOWN_ITEM_MAX_STACK_SIZE, count),
      ...(durability !== undefined ? { durability } : {}),
    };
  }

  if (item.kind === "tool") {
    const safeDurability = Math.min(
      item.maxDurability,
      durability ?? item.maxDurability,
    );

    return safeDurability > 0
      ? {
          itemId: item.id,
          count: 1,
          durability: safeDurability,
        }
      : null;
  }

  return {
    itemId: item.id,
    count: Math.min(item.maxStackSize, count),
  };
}

function normalizeLegacyInventoryItem(
  value: unknown,
): SerializedItemStack | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Record<string, unknown>;
  const material =
    typeof item.material === "number" && Number.isFinite(item.material)
      ? item.material
      : null;
  const count =
    typeof item.count === "number" && Number.isFinite(item.count)
      ? item.count
      : 0;

  if (material === null || count <= 0) {
    return null;
  }

  const itemId = blockItemIdForMaterial(material as TerrainMaterial);

  if (!itemId) {
    console.warn(`Unknown terrain material in saved inventory: ${material}`);
    return null;
  }

  return {
    itemId,
    count: Math.floor(count),
  };
}

function selectedHotbarIndexFromInventory(
  inventory: Record<string, unknown>,
): number {
  const selected =
    typeof inventory.selectedHotbarIndex === "number"
      ? inventory.selectedHotbarIndex
      : inventory.selectedIndex;

  return typeof selected === "number" && Number.isFinite(selected)
    ? Math.max(0, Math.min(SAVE_HOTBAR_SLOT_COUNT - 1, Math.floor(selected)))
    : 0;
}

function copySerializedSlots(
  target: (SerializedItemStack | null)[],
  source: readonly unknown[],
): void {
  for (const [index, stack] of source.entries()) {
    if (index >= target.length) {
      return;
    }

    target[index] = normalizeSerializedItemStackValue(stack);
  }
}

function mergeOrPlaceSerializedStack(
  containers: readonly (SerializedItemStack | null)[][],
  stack: SerializedItemStack,
): void {
  const item = itemDefinitionFor(stack.itemId);
  const maxStackSize = item?.maxStackSize ?? UNKNOWN_ITEM_MAX_STACK_SIZE;
  const isStackable = item?.kind !== "tool";
  let remaining = stack.count;

  if (isStackable) {
    for (const slots of containers) {
      for (const [index, existing] of slots.entries()) {
        if (!existing || existing.itemId !== stack.itemId) {
          continue;
        }

        const added = Math.min(maxStackSize - existing.count, remaining);

        if (added <= 0) {
          continue;
        }

        slots[index] = {
          ...existing,
          count: existing.count + added,
        };
        remaining -= added;

        if (remaining === 0) {
          return;
        }
      }
    }
  }

  for (const slots of containers) {
    for (const [index, existing] of slots.entries()) {
      if (existing) {
        continue;
      }

      const added = isStackable ? Math.min(maxStackSize, remaining) : 1;

      slots[index] = {
        ...stack,
        count: added,
      };
      remaining -= added;

      if (remaining === 0) {
        return;
      }
    }
  }
}

export function normalizeSerializedInventory(
  value: unknown,
): SerializedInventory {
  const inventory =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const hotbar = [
    ...emptySerializedInventorySlots(SAVE_HOTBAR_SLOT_COUNT),
  ] as (SerializedItemStack | null)[];
  const backpack = [
    ...emptySerializedInventorySlots(SAVE_BACKPACK_SLOT_COUNT),
  ] as (SerializedItemStack | null)[];

  const savedHotbar = Array.isArray(inventory.hotbar) ? inventory.hotbar : [];
  const savedBackpack = Array.isArray(inventory.backpack)
    ? inventory.backpack
    : [];

  if (savedHotbar.length > 0 || savedBackpack.length > 0) {
    copySerializedSlots(hotbar, savedHotbar);
    copySerializedSlots(backpack, savedBackpack);
  } else if (Array.isArray(inventory.slots)) {
    copySerializedSlots(hotbar, inventory.slots);
    if (inventory.slots.length > SAVE_HOTBAR_SLOT_COUNT) {
      copySerializedSlots(
        backpack,
        inventory.slots.slice(SAVE_HOTBAR_SLOT_COUNT),
      );
    }
  } else if (Array.isArray(inventory.items)) {
    for (const item of inventory.items) {
      const stack = normalizeLegacyInventoryItem(item);

      if (stack) {
        mergeOrPlaceSerializedStack([hotbar, backpack], stack);
      }
    }
  }

  return {
    selectedHotbarIndex: selectedHotbarIndexFromInventory(inventory),
    hotbar,
    backpack,
  };
}

export function emptyMaterialStorageSave(): SerializedMaterialStorage {
  return {
    materials: [],
  };
}

function uniqueSortedStrings(values: Iterable<unknown>): readonly string[] {
  const strings = new Set<string>();

  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") {
      strings.add(value);
    }
  }

  return [...strings].sort();
}

function uniqueStringsInOrder(values: Iterable<unknown>): readonly string[] {
  const strings = new Set<string>();

  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") {
      strings.add(value);
    }
  }

  return [...strings];
}

function isMaterialRarity(value: unknown): value is MaterialRarity {
  return (
    value === "common" ||
    value === "uncommon" ||
    value === "rare" ||
    value === "epic" ||
    value === "legendary" ||
    value === "mythic"
  );
}

function finiteNumberOrDefault(value: unknown, defaultValue: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : defaultValue;
}

function normalizeMaterialResearchTiers(
  values: Iterable<unknown>,
): readonly MaterialResearchTier[] {
  return [...values]
    .map(normalizeMaterialResearchTier)
    .filter((tier): tier is MaterialResearchTier => tier !== undefined)
    .filter((tier, index, tiers) => tiers.indexOf(tier) === index)
    .sort();
}

function stationTypeFromRecipeKey(
  recipeKey: string,
): MaterialProcessingStationType {
  const stationMatch = /(?:^|\|)station:([^|]+)/.exec(recipeKey);
  const stationType = stationMatch?.[1];

  return isMaterialProcessingStationType(stationType)
    ? stationType
    : "combiner";
}

function serializedMaterialStatsFrom(
  value: Record<string, unknown>,
  config: Pick<MaterialConfig, "statMin" | "statMax">,
): MaterialStats {
  return Object.fromEntries(
    MATERIAL_STAT_KEYS.map((key): readonly [MaterialStatKey, number] => {
      const stat = finiteNumberOrDefault(value[key], 0);

      return [key, Math.max(config.statMin, Math.min(config.statMax, stat))];
    }),
  ) as MaterialStats;
}

export function serializeMaterial(
  material: MaterialDefinition,
): SerializedMaterial {
  return {
    id: material.id,
    name: material.name,
    generation: material.generation,
    parents: [...material.parents],
    rarity: material.rarity,
    stability: material.stability,
    hardness: material.hardness,
    density: material.density,
    heat: material.heat,
    conductivity: material.conductivity,
    toxicity: material.toxicity,
    radioactivity: material.radioactivity,
    magic: material.magic,
    organic: material.organic,
    metal: material.metal,
    crystal: material.crystal,
    gas: material.gas,
    liquid: material.liquid,
    tags: [...material.tags],
    requiredResearchTier: material.requiredResearchTier,
    stationType: material.stationType,
    discoveredAt: material.discoveredAt,
    description: material.description,
  };
}

function normalizeSerializedMaterial(
  value: unknown,
  config: Pick<MaterialConfig, "statMin" | "statMax">,
): SerializedMaterial | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const material = value as Record<string, unknown>;
  const id = typeof material.id === "string" ? material.id : "";
  const name = typeof material.name === "string" ? material.name : "";

  if (id.trim() === "" || name.trim() === "") {
    return null;
  }

  return {
    id,
    name,
    generation: Math.max(
      0,
      Math.floor(finiteNumberOrDefault(material.generation, 1)),
    ),
    parents: uniqueStringsInOrder(
      Array.isArray(material.parents) ? material.parents : [],
    ),
    rarity: isMaterialRarity(material.rarity) ? material.rarity : "common",
    ...serializedMaterialStatsFrom(material, config),
    tags: uniqueSortedStrings(
      Array.isArray(material.tags) ? material.tags : [],
    ),
    requiredResearchTier: normalizeMaterialResearchTier(
      material.requiredResearchTier,
    ),
    stationType: isMaterialProcessingStationType(material.stationType)
      ? material.stationType
      : undefined,
    discoveredAt:
      typeof material.discoveredAt === "number" &&
      Number.isFinite(material.discoveredAt)
        ? material.discoveredAt
        : undefined,
    description:
      typeof material.description === "string"
        ? material.description
        : undefined,
  };
}

function normalizeSerializedMaterialRecipe(
  value: unknown,
): SerializedMaterialRecipe | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const recipe = value as Record<string, unknown>;
  const recipeKey =
    typeof recipe.recipeKey === "string" ? recipe.recipeKey : "";
  const resultMaterialId =
    typeof recipe.resultMaterialId === "string" ? recipe.resultMaterialId : "";
  const legacyParentIds = uniqueStringsInOrder(
    Array.isArray(recipe.parentIds) ? recipe.parentIds : [],
  );
  const parentAId =
    typeof recipe.parentAId === "string"
      ? recipe.parentAId
      : (legacyParentIds[0] ?? "");
  const parentBId =
    typeof recipe.parentBId === "string"
      ? recipe.parentBId
      : (legacyParentIds[1] ?? "");
  const stationType = isMaterialProcessingStationType(recipe.stationType)
    ? recipe.stationType
    : stationTypeFromRecipeKey(recipeKey);

  if (
    recipeKey.trim() === "" ||
    resultMaterialId.trim() === "" ||
    parentAId.trim() === "" ||
    parentBId.trim() === ""
  ) {
    return null;
  }

  return {
    recipeKey,
    parentAId,
    parentBId,
    resultMaterialId,
    stationType,
  };
}

function allBaseElementIds(): readonly string[] {
  return BASE_ELEMENT_MATERIALS.map((material) => material.id);
}

function validBaseElementIds(ids: readonly string[]): readonly string[] {
  const baseIds = new Set(allBaseElementIds());

  return ids.filter((id) => baseIds.has(id)).sort();
}

export function emptyMaterialCodexSave(
  discoveredMaterialIds: readonly string[] = allBaseElementIds(),
  unlockedResearchTiers: readonly MaterialResearchTier[] = [],
): SerializedMaterialCodex {
  return {
    version: MATERIAL_CODEX_SAVE_VERSION,
    discoveredMaterialIds: validBaseElementIds(discoveredMaterialIds),
    generatedMaterials: [],
    recipeResults: [],
    unlockedResearchTiers: normalizeMaterialResearchTiers(
      unlockedResearchTiers,
    ),
  };
}

export function createStartingMaterialCodex(
  settings: Pick<GameSettings, "gameMode">,
  config: MaterialConfig = DEFAULT_MATERIAL_CONFIG,
): SerializedMaterialCodex {
  const normalizedConfig = normalizeMaterialConfig(config);
  const discoverAll =
    settings.gameMode === "creative" ||
    normalizedConfig.startingElementMode === "all";

  return emptyMaterialCodexSave(
    discoverAll ? allBaseElementIds() : BASIC_STARTING_ELEMENT_IDS,
  );
}

export function normalizeSerializedMaterialCodex(
  value: unknown,
  config: MaterialConfig = DEFAULT_MATERIAL_CONFIG,
): SerializedMaterialCodex {
  if (!value || typeof value !== "object") {
    return emptyMaterialCodexSave();
  }

  const codex = value as Record<string, unknown>;
  const normalizedConfig = normalizeMaterialConfig(config);
  const generatedMaterials = (
    Array.isArray(codex.generatedMaterials) ? codex.generatedMaterials : []
  )
    .map((material) => normalizeSerializedMaterial(material, normalizedConfig))
    .filter((material): material is SerializedMaterial => material !== null)
    .sort((a, b) => a.generation - b.generation || a.id.localeCompare(b.id));
  const recipeResults = (
    Array.isArray(codex.recipeResults)
      ? codex.recipeResults
      : Array.isArray(codex.recipes)
        ? codex.recipes
        : []
  )
    .map(normalizeSerializedMaterialRecipe)
    .filter((recipe): recipe is SerializedMaterialRecipe => recipe !== null)
    .sort((a, b) => a.recipeKey.localeCompare(b.recipeKey));
  const generatedMaterialIds = new Set(
    generatedMaterials.map((material) => material.id),
  );
  const knownMaterialIds = new Set([
    ...allBaseElementIds(),
    ...generatedMaterialIds,
  ]);
  const discoveredMaterialIdSet = new Set(
    uniqueSortedStrings(
      Array.isArray(codex.discoveredMaterialIds)
        ? codex.discoveredMaterialIds
        : Array.isArray(codex.discoveredBaseMaterialIds)
          ? codex.discoveredBaseMaterialIds
          : [],
    ).filter((id) => knownMaterialIds.has(id)),
  );
  for (const material of generatedMaterials) {
    if (material.discoveredAt !== undefined) {
      discoveredMaterialIdSet.add(material.id);
    }
  }
  const discoveredMaterialIds = [...discoveredMaterialIdSet].sort();
  const unlockedResearchTiers = normalizeMaterialResearchTiers(
    Array.isArray(codex.unlockedResearchTiers)
      ? codex.unlockedResearchTiers
      : [],
  );

  return {
    version: MATERIAL_CODEX_SAVE_VERSION,
    discoveredMaterialIds:
      discoveredMaterialIds.length > 0
        ? discoveredMaterialIds
        : emptyMaterialCodexSave().discoveredMaterialIds,
    generatedMaterials,
    recipeResults,
    unlockedResearchTiers,
  };
}

export function serializeMaterialCodex(
  registry: MaterialRegistry,
  unlockedResearchTiers: readonly MaterialResearchTier[] = [],
): SerializedMaterialCodex {
  const materials = registry.allMaterials();
  const generatedMaterialIds = new Set(
    materials
      .filter((material) => material.generation > 0)
      .map((material) => material.id),
  );

  return {
    version: MATERIAL_CODEX_SAVE_VERSION,
    discoveredMaterialIds: registry.discoveredMaterialIds(),
    generatedMaterials: materials
      .filter((material) => material.generation > 0)
      .map(serializeMaterial)
      .sort((a, b) => a.generation - b.generation || a.id.localeCompare(b.id)),
    recipeResults: registry
      .allRecipeResults()
      .map((recipe): SerializedMaterialRecipe | null => {
        const result = registry.getMaterialById(recipe.resultMaterialId);

        if (!result || !generatedMaterialIds.has(result.id)) {
          return null;
        }

        const parentIds = uniqueStringsInOrder(result.parents);

        if (parentIds.length < 2) {
          return null;
        }

        return {
          recipeKey: recipe.recipeKey,
          parentAId: parentIds[0]!,
          parentBId: parentIds[1]!,
          resultMaterialId: recipe.resultMaterialId,
          stationType:
            result.stationType ?? stationTypeFromRecipeKey(recipe.recipeKey),
        };
      })
      .filter((recipe): recipe is SerializedMaterialRecipe => recipe !== null)
      .sort((a, b) => a.recipeKey.localeCompare(b.recipeKey)),
    unlockedResearchTiers: normalizeMaterialResearchTiers(
      unlockedResearchTiers,
    ),
  };
}

export function materialRegistryFromSerializedCodex(
  materialCodex: SerializedMaterialCodex | null | undefined,
  config: MaterialConfig = DEFAULT_MATERIAL_CONFIG,
): MaterialRegistry {
  const normalizedConfig = normalizeMaterialConfig(config);
  const registry = new MaterialRegistry(normalizedConfig);
  const normalizedCodex = normalizeSerializedMaterialCodex(
    materialCodex,
    normalizedConfig,
  );
  const discoveredMaterialIds = new Set(normalizedCodex.discoveredMaterialIds);

  registry.registerBaseMaterials(
    BASE_ELEMENT_MATERIALS,
    validBaseElementIds(normalizedCodex.discoveredMaterialIds),
  );
  for (const material of normalizedCodex.generatedMaterials) {
    if (!material.parents.every((parentId) => registry.hasMaterial(parentId))) {
      continue;
    }

    registry.registerGeneratedMaterial(material);
    if (
      discoveredMaterialIds.has(material.id) &&
      material.discoveredAt === undefined
    ) {
      registry.discoverMaterial(material.id);
    }
  }
  for (const recipe of normalizedCodex.recipeResults) {
    if (
      registry.hasMaterial(recipe.parentAId) &&
      registry.hasMaterial(recipe.parentBId) &&
      registry.hasMaterial(recipe.resultMaterialId)
    ) {
      registry.storeRecipeResult(recipe.recipeKey, recipe.resultMaterialId);
    }
  }

  return registry;
}

export function emptyRuntimeStateSave(
  worldId: string,
  materialCodex: SerializedMaterialCodex = emptyMaterialCodexSave(),
): WorldRuntimeStateSave {
  return {
    worldId,
    player: { position: null },
    inventory: emptyInventorySave(),
    gameTime: defaultSerializedGameTimeState(),
    materialCodex,
    materialStorage: emptyMaterialStorageSave(),
  };
}

export function normalizeSerializedMaterialStorage(
  value: unknown,
): SerializedMaterialStorage {
  if (!value || typeof value !== "object") {
    return emptyMaterialStorageSave();
  }

  const record = value as Record<string, unknown>;
  const source = Array.isArray(record.materials) ? record.materials : [];
  const counts = new Map<string, number>();

  for (const item of source) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const entry = item as Record<string, unknown>;
    const materialId =
      typeof entry.materialId === "string" ? entry.materialId.trim() : "";
    const quantity =
      typeof entry.quantity === "number" && Number.isFinite(entry.quantity)
        ? Math.max(0, Math.floor(entry.quantity))
        : 0;

    if (materialId === "" || quantity <= 0) {
      continue;
    }

    counts.set(materialId, (counts.get(materialId) ?? 0) + quantity);
  }

  return {
    materials: [...counts.entries()]
      .map(([materialId, quantity]) => ({ materialId, quantity }))
      .sort((a, b) => a.materialId.localeCompare(b.materialId)),
  };
}

function materialCodexWithLegacyResearchTiers(
  codex: SerializedMaterialCodex,
  legacyResearch: unknown,
): SerializedMaterialCodex {
  const legacyTiers =
    normalizeMaterialResearchState(legacyResearch).unlockedTiers;

  if (legacyTiers.length === 0) {
    return codex;
  }

  return {
    ...codex,
    unlockedResearchTiers: normalizeMaterialResearchTiers([
      ...codex.unlockedResearchTiers,
      ...legacyTiers,
    ]),
  };
}

export function runtimeStateWithDefaults(
  worldId: string,
  state: Partial<WorldRuntimeStateSave> | null | undefined,
  defaultMaterialCodex: SerializedMaterialCodex = emptyMaterialCodexSave(),
): WorldRuntimeStateSave {
  const materialCodex = normalizeSerializedMaterialCodex(
    (state as { materialCodex?: unknown } | null | undefined)?.materialCodex ??
      defaultMaterialCodex,
  );

  return {
    worldId,
    player: state?.player ?? { position: null },
    inventory: normalizeSerializedInventory(state?.inventory),
    gameTime: normalizeSerializedGameTimeState(
      (state as { gameTime?: unknown } | null | undefined)?.gameTime,
    ),
    materialCodex: materialCodexWithLegacyResearchTiers(
      materialCodex,
      (state as { materialResearch?: unknown } | null | undefined)
        ?.materialResearch,
    ),
    materialStorage: normalizeSerializedMaterialStorage(
      (state as { materialStorage?: unknown } | null | undefined)
        ?.materialStorage,
    ),
  };
}

export function terrainEditChunkId(worldId: string, chunkKey: string): string {
  return `${worldId}:${chunkKey}`;
}
