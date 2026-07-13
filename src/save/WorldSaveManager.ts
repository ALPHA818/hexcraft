import type { GameSettings } from "../game/GameSettings.ts";
import {
  createStartingInventory,
  startingInventoryModeForSettings,
} from "../game/StartingInventory.ts";
import {
  DEFAULT_MATERIAL_CONFIG,
  type MaterialConfig,
} from "../materials/MaterialConfig.ts";
import type { SerializedGameTimeState } from "../world/GameTime.ts";
import { createSaveDatabase, type WorldSaveDatabase } from "./SaveDatabase.ts";
import {
  CURRENT_SAVE_VERSION,
  createStartingMaterialCodex,
  emptyMaterialCodexSave,
  emptyRuntimeStateSave,
  metadataFromSettings,
  normalizeSerializedInventory,
  runtimeStateWithDefaults,
  settingsFromMetadata,
  terrainEditChunkId,
  type LoadedWorldSave,
  type SerializedEquipment,
  type SerializedInventory,
  type SerializedMaterialCodex,
  type SerializedMaterialStorage,
  type SerializedProgression,
  type SerializedPlayerState,
  type TerrainEditChunkSave,
  type WorldRuntimeStateSave,
  type WorldSaveMetadata,
} from "./WorldSaveTypes.ts";

export type SaveWorldPayload = Readonly<{
  metadata: WorldSaveMetadata;
  player: SerializedPlayerState;
  inventory: SerializedInventory;
  equipment?: SerializedEquipment;
  progression?: SerializedProgression;
  gameTime?: SerializedGameTimeState;
  materialCodex?: SerializedMaterialCodex;
  materialStorage?: SerializedMaterialStorage;
  terrainEditChunks: readonly Omit<TerrainEditChunkSave, "id" | "worldId">[];
}>;

function createWorldId(): string {
  const cryptoObject = globalThis.crypto;

  if (typeof cryptoObject?.randomUUID === "function") {
    return cryptoObject.randomUUID();
  }

  return `world-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function attachWorldIdToChunk(
  worldId: string,
  chunk: Omit<TerrainEditChunkSave, "id" | "worldId">,
): TerrainEditChunkSave {
  return {
    ...chunk,
    id: terrainEditChunkId(worldId, chunk.chunkKey),
    worldId,
  };
}

export function migrateWorldSaveData(save: LoadedWorldSave): LoadedWorldSave {
  const migratedSave = {
    ...save,
    runtime: runtimeStateWithDefaults(
      save.metadata.id,
      save.runtime,
      emptyMaterialCodexSave(),
      save.metadata.gameMode,
    ),
  };

  // Placeholder for future migrations. Version 1 is the initial format.
  if (save.metadata.saveVersion === CURRENT_SAVE_VERSION) {
    return migratedSave;
  }

  return migratedSave;
}

export class WorldSaveManager {
  readonly #database: WorldSaveDatabase;
  readonly #materialConfig: MaterialConfig;

  constructor(
    database: WorldSaveDatabase = createSaveDatabase(),
    materialConfig: MaterialConfig = DEFAULT_MATERIAL_CONFIG,
  ) {
    this.#database = database;
    this.#materialConfig = materialConfig;
  }

  async listWorlds(): Promise<WorldSaveMetadata[]> {
    return this.#database.listWorldMetadata();
  }

  async createWorld(
    settings: GameSettings,
    now = Date.now(),
  ): Promise<LoadedWorldSave> {
    const metadata = metadataFromSettings(createWorldId(), settings, now);
    const runtime = {
      ...emptyRuntimeStateSave(
        metadata.id,
        createStartingMaterialCodex(settings, this.#materialConfig),
        settings.gameMode,
      ),
      inventory: createStartingInventory(
        startingInventoryModeForSettings(settings),
      ),
    };

    await this.#database.putWorldMetadata(metadata);
    await this.#database.putWorldRuntimeState(runtime);
    await this.#database.replaceTerrainEditChunks(metadata.id, []);

    return {
      metadata,
      runtime,
      terrainEditChunks: [],
    };
  }

  async loadWorld(worldId: string): Promise<LoadedWorldSave | null> {
    const metadata = await this.#database.getWorldMetadata(worldId);

    if (!metadata) {
      return null;
    }

    const runtime = runtimeStateWithDefaults(
      worldId,
      await this.#database.getWorldRuntimeState(worldId),
      emptyMaterialCodexSave(),
      metadata.gameMode,
    );
    const terrainEditChunks =
      await this.#database.getTerrainEditChunks(worldId);

    return migrateWorldSaveData({
      metadata,
      runtime,
      terrainEditChunks,
    });
  }

  async saveWorld(
    payload: SaveWorldPayload,
    now = Date.now(),
  ): Promise<WorldSaveMetadata> {
    const metadata: WorldSaveMetadata = {
      ...payload.metadata,
      saveVersion: CURRENT_SAVE_VERSION,
      startingInventoryMode: startingInventoryModeForSettings(payload.metadata),
      updatedAt: now,
    };
    const defaultMaterialCodex = createStartingMaterialCodex(
      settingsFromMetadata(metadata),
      this.#materialConfig,
    );
    const existingRuntime = await this.#database.getWorldRuntimeState(
      metadata.id,
    );
    const runtime: WorldRuntimeStateSave = {
      worldId: metadata.id,
      player: payload.player,
      inventory: normalizeSerializedInventory(payload.inventory),
      equipment: runtimeStateWithDefaults(metadata.id, {
        equipment: payload.equipment ?? existingRuntime?.equipment,
      }).equipment,
      progression: runtimeStateWithDefaults(
        metadata.id,
        {
          progression: payload.progression ?? existingRuntime?.progression,
        },
        emptyMaterialCodexSave(),
        metadata.gameMode,
      ).progression,
      gameTime: runtimeStateWithDefaults(metadata.id, {
        gameTime: payload.gameTime,
      }).gameTime,
      materialCodex: runtimeStateWithDefaults(
        metadata.id,
        {
          materialCodex:
            payload.materialCodex ??
            existingRuntime?.materialCodex ??
            defaultMaterialCodex,
        } as Partial<WorldRuntimeStateSave>,
        defaultMaterialCodex,
      ).materialCodex,
      materialStorage: runtimeStateWithDefaults(metadata.id, {
        materialStorage:
          payload.materialStorage ?? existingRuntime?.materialStorage,
      }).materialStorage,
    };
    const terrainEditChunks = payload.terrainEditChunks.map((chunk) =>
      attachWorldIdToChunk(metadata.id, chunk),
    );

    await this.#database.putWorldMetadata(metadata);
    await this.#database.putWorldRuntimeState(runtime);
    await this.#database.replaceTerrainEditChunks(
      metadata.id,
      terrainEditChunks,
    );

    return metadata;
  }

  async deleteWorld(worldId: string): Promise<void> {
    await this.#database.deleteWorld(worldId);
  }

  async renameWorld(
    worldId: string,
    name: string,
    now = Date.now(),
  ): Promise<WorldSaveMetadata | null> {
    const metadata = await this.#database.getWorldMetadata(worldId);
    const trimmedName = name.trim();

    if (!metadata || trimmedName === "") {
      return metadata;
    }

    const renamedMetadata: WorldSaveMetadata = {
      ...metadata,
      name: trimmedName,
      updatedAt: now,
    };

    await this.#database.putWorldMetadata(renamedMetadata);
    return renamedMetadata;
  }
}
