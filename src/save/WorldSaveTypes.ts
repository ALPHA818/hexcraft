import type { GameSettings } from "../game/GameSettings.ts";
import type { GameMode } from "../game/gameMode.ts";
import type { SerializedItemStack } from "../items/ItemStack.ts";
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

export function emptyRuntimeStateSave(worldId: string): WorldRuntimeStateSave {
  return {
    worldId,
    player: { position: null },
    inventory: emptyInventorySave(),
    gameTime: defaultSerializedGameTimeState(),
  };
}

export function runtimeStateWithDefaults(
  worldId: string,
  state: Partial<WorldRuntimeStateSave> | null | undefined,
): WorldRuntimeStateSave {
  return {
    worldId,
    player: state?.player ?? { position: null },
    inventory: state?.inventory ?? emptyInventorySave(),
    gameTime: normalizeSerializedGameTimeState(
      (state as { gameTime?: unknown } | null | undefined)?.gameTime,
    ),
  };
}

export function terrainEditChunkId(worldId: string, chunkKey: string): string {
  return `${worldId}:${chunkKey}`;
}
