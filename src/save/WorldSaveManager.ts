import type { GameSettings } from "../game/GameSettings.ts";
import type { SerializedGameTimeState } from "../world/GameTime.ts";
import { createSaveDatabase, type WorldSaveDatabase } from "./SaveDatabase.ts";
import {
  CURRENT_SAVE_VERSION,
  emptyRuntimeStateSave,
  metadataFromSettings,
  runtimeStateWithDefaults,
  terrainEditChunkId,
  type LoadedWorldSave,
  type SerializedInventory,
  type SerializedPlayerState,
  type TerrainEditChunkSave,
  type WorldRuntimeStateSave,
  type WorldSaveMetadata,
} from "./WorldSaveTypes.ts";

export type SaveWorldPayload = Readonly<{
  metadata: WorldSaveMetadata;
  player: SerializedPlayerState;
  inventory: SerializedInventory;
  gameTime?: SerializedGameTimeState;
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
  // Placeholder for future migrations. Version 1 is the initial format.
  if (save.metadata.saveVersion === CURRENT_SAVE_VERSION) {
    return save;
  }

  return save;
}

export class WorldSaveManager {
  readonly #database: WorldSaveDatabase;

  constructor(database: WorldSaveDatabase = createSaveDatabase()) {
    this.#database = database;
  }

  async listWorlds(): Promise<WorldSaveMetadata[]> {
    return this.#database.listWorldMetadata();
  }

  async createWorld(
    settings: GameSettings,
    now = Date.now(),
  ): Promise<LoadedWorldSave> {
    const metadata = metadataFromSettings(createWorldId(), settings, now);
    const runtime = emptyRuntimeStateSave(metadata.id);

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
      updatedAt: now,
    };
    const runtime: WorldRuntimeStateSave = {
      worldId: metadata.id,
      player: payload.player,
      inventory: payload.inventory,
      gameTime: runtimeStateWithDefaults(metadata.id, {
        gameTime: payload.gameTime,
      }).gameTime,
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
