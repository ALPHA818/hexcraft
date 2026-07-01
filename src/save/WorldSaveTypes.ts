import type { GameSettings } from "../game/GameSettings.ts";
import type { GameMode } from "../game/gameMode.ts";
import type { SerializedItemStack } from "../items/ItemStack.ts";
import { BASE_ELEMENT_MATERIALS } from "../materials/BaseElements.ts";
import {
  DEFAULT_MATERIAL_CONFIG,
  normalizeMaterialConfig,
  type MaterialConfig,
} from "../materials/MaterialConfig.ts";
import { MaterialRegistry } from "../materials/MaterialRegistry.ts";
import {
  MATERIAL_RESEARCH_TIERS,
  defaultMaterialResearchState,
  normalizeMaterialResearchState,
  type SerializedMaterialResearch,
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
  selectedIndex: number;
  slots?: readonly (SerializedItemStack | null)[];
  items?: readonly LegacySerializedInventoryItem[];
}>;

export type SerializedPlayerState = Readonly<{
  position: SerializedVec3 | null;
}>;

export const MATERIAL_CODEX_SAVE_VERSION = 1;

export const BASIC_STARTING_ELEMENT_IDS = [
  "element:hydrogen",
  "element:nitrogen",
  "element:oxygen",
  "element:sodium",
  "element:aluminium",
  "element:silicon",
  "element:phosphorus",
  "element:sulfur",
  "element:calcium",
] as const;

export type SerializedMaterial = Readonly<
  {
    id: string;
    name: string;
    generation: number;
    parents: readonly string[];
    rarity: MaterialRarity;
    tags: readonly string[];
    requiredResearchTier?: MaterialResearchTier;
    stationType?: MaterialProcessingStationType;
    discoveredAt?: number;
    description?: string;
  } & MaterialStats
>;

export type SerializedMaterialRecipe = Readonly<{
  recipeKey: string;
  parentIds: readonly [string, string];
  resultMaterialId: string;
  discoveredAt?: number;
}>;

export type SerializedMaterialCodex = Readonly<{
  version: typeof MATERIAL_CODEX_SAVE_VERSION;
  discoveredBaseMaterialIds: readonly string[];
  generatedMaterials: readonly SerializedMaterial[];
  recipes: readonly SerializedMaterialRecipe[];
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
  materialResearch: SerializedMaterialResearch;
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
    selectedIndex: 0,
    slots: [],
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

function normalizeMaterialResearchTier(
  value: unknown,
): MaterialResearchTier | undefined {
  return typeof value === "string" &&
    MATERIAL_RESEARCH_TIERS.includes(value as MaterialResearchTier)
    ? (value as MaterialResearchTier)
    : undefined;
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
    ...(material.requiredResearchTier
      ? { requiredResearchTier: material.requiredResearchTier }
      : {}),
    ...(material.stationType ? { stationType: material.stationType } : {}),
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
    ...(() => {
      const requiredResearchTier = normalizeMaterialResearchTier(
        material.requiredResearchTier,
      );

      return requiredResearchTier ? { requiredResearchTier } : {};
    })(),
    ...(isMaterialProcessingStationType(material.stationType)
      ? { stationType: material.stationType }
      : {}),
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
  const parentIds = uniqueStringsInOrder(
    Array.isArray(recipe.parentIds) ? recipe.parentIds : [],
  );

  if (
    recipeKey.trim() === "" ||
    resultMaterialId.trim() === "" ||
    parentIds.length < 2
  ) {
    return null;
  }

  return {
    recipeKey,
    parentIds: [parentIds[0]!, parentIds[1]!],
    resultMaterialId,
    discoveredAt:
      typeof recipe.discoveredAt === "number" &&
      Number.isFinite(recipe.discoveredAt)
        ? recipe.discoveredAt
        : undefined,
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
  discoveredBaseMaterialIds: readonly string[] = allBaseElementIds(),
): SerializedMaterialCodex {
  return {
    version: MATERIAL_CODEX_SAVE_VERSION,
    discoveredBaseMaterialIds: validBaseElementIds(discoveredBaseMaterialIds),
    generatedMaterials: [],
    recipes: [],
  };
}

export function createStartingMaterialCodex(
  settings: Pick<GameSettings, "gameMode">,
  config: MaterialConfig = DEFAULT_MATERIAL_CONFIG,
): SerializedMaterialCodex {
  const normalizedConfig = normalizeMaterialConfig(config);
  const discoverAll =
    normalizedConfig.startingElementMode === "all" ||
    (normalizedConfig.startingElementMode === "creativeAll" &&
      settings.gameMode === "creative");

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
  const recipes = (Array.isArray(codex.recipes) ? codex.recipes : [])
    .map(normalizeSerializedMaterialRecipe)
    .filter((recipe): recipe is SerializedMaterialRecipe => recipe !== null)
    .sort((a, b) => a.recipeKey.localeCompare(b.recipeKey));
  const discoveredBaseMaterialIds = validBaseElementIds(
    uniqueSortedStrings(
      Array.isArray(codex.discoveredBaseMaterialIds)
        ? codex.discoveredBaseMaterialIds
        : [],
    ),
  );

  return {
    version: MATERIAL_CODEX_SAVE_VERSION,
    discoveredBaseMaterialIds:
      discoveredBaseMaterialIds.length > 0
        ? discoveredBaseMaterialIds
        : emptyMaterialCodexSave().discoveredBaseMaterialIds,
    generatedMaterials,
    recipes,
  };
}

export function serializeMaterialCodex(
  registry: MaterialRegistry,
): SerializedMaterialCodex {
  const discoveredMaterials = registry.allDiscoveredMaterials();
  const generatedMaterialIds = new Set(
    discoveredMaterials
      .filter((material) => material.generation > 0)
      .map((material) => material.id),
  );

  return {
    version: MATERIAL_CODEX_SAVE_VERSION,
    discoveredBaseMaterialIds: discoveredMaterials
      .filter((material) => material.generation === 0)
      .map((material) => material.id)
      .sort(),
    generatedMaterials: discoveredMaterials
      .filter((material) => material.generation > 0)
      .map(serializeMaterial)
      .sort((a, b) => a.generation - b.generation || a.id.localeCompare(b.id)),
    recipes: registry
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
          parentIds: [parentIds[0]!, parentIds[1]!],
          resultMaterialId: recipe.resultMaterialId,
          discoveredAt: result.discoveredAt,
        };
      })
      .filter((recipe): recipe is SerializedMaterialRecipe => recipe !== null)
      .sort((a, b) => a.recipeKey.localeCompare(b.recipeKey)),
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

  registry.registerBaseMaterials(
    BASE_ELEMENT_MATERIALS,
    normalizedCodex.discoveredBaseMaterialIds,
  );
  for (const material of normalizedCodex.generatedMaterials) {
    registry.registerGeneratedMaterial(material);
  }
  for (const recipe of normalizedCodex.recipes) {
    if (registry.hasMaterial(recipe.resultMaterialId)) {
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
    materialResearch: defaultMaterialResearchState(),
  };
}

export function runtimeStateWithDefaults(
  worldId: string,
  state: Partial<WorldRuntimeStateSave> | null | undefined,
  defaultMaterialCodex: SerializedMaterialCodex = emptyMaterialCodexSave(),
): WorldRuntimeStateSave {
  return {
    worldId,
    player: state?.player ?? { position: null },
    inventory: state?.inventory ?? emptyInventorySave(),
    gameTime: normalizeSerializedGameTimeState(
      (state as { gameTime?: unknown } | null | undefined)?.gameTime,
    ),
    materialCodex: normalizeSerializedMaterialCodex(
      (state as { materialCodex?: unknown } | null | undefined)
        ?.materialCodex ?? defaultMaterialCodex,
    ),
    materialResearch: normalizeMaterialResearchState(
      (state as { materialResearch?: unknown } | null | undefined)
        ?.materialResearch,
    ),
  };
}

export function terrainEditChunkId(worldId: string, chunkKey: string): string {
  return `${worldId}:${chunkKey}`;
}
