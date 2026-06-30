import {
  type TerrainEditChunkSave,
  type WorldRuntimeStateSave,
  type WorldSaveMetadata,
} from "./WorldSaveTypes.ts";

export type WorldSaveDatabase = Readonly<{
  listWorldMetadata: () => Promise<WorldSaveMetadata[]>;
  getWorldMetadata: (worldId: string) => Promise<WorldSaveMetadata | null>;
  putWorldMetadata: (metadata: WorldSaveMetadata) => Promise<void>;
  deleteWorld: (worldId: string) => Promise<void>;
  getWorldRuntimeState: (
    worldId: string,
  ) => Promise<WorldRuntimeStateSave | null>;
  putWorldRuntimeState: (state: WorldRuntimeStateSave) => Promise<void>;
  getTerrainEditChunks: (worldId: string) => Promise<TerrainEditChunkSave[]>;
  replaceTerrainEditChunks: (
    worldId: string,
    chunks: readonly TerrainEditChunkSave[],
  ) => Promise<void>;
}>;

const DATABASE_NAME = "hexcraft-saves";
const DATABASE_VERSION = 1;
const WORLD_STORE = "worlds";
const RUNTIME_STORE = "worldRuntime";
const TERRAIN_EDIT_STORE = "terrainEditChunks";
const WORLD_ID_INDEX = "worldId";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted.")),
    );
    transaction.addEventListener("error", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed.")),
    );
  });
}

async function getAllByIndex<T>(
  store: IDBObjectStore,
  indexName: string,
  key: IDBValidKey,
): Promise<T[]> {
  return requestResult<T[]>(store.index(indexName).getAll(key));
}

export class IndexedDbSaveDatabase implements WorldSaveDatabase {
  #database: Promise<IDBDatabase> | null = null;

  async listWorldMetadata(): Promise<WorldSaveMetadata[]> {
    const database = await this.#open();
    const transaction = database.transaction(WORLD_STORE, "readonly");
    const worlds = await requestResult<WorldSaveMetadata[]>(
      transaction.objectStore(WORLD_STORE).getAll(),
    );

    return worlds.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getWorldMetadata(worldId: string): Promise<WorldSaveMetadata | null> {
    const database = await this.#open();
    const transaction = database.transaction(WORLD_STORE, "readonly");
    const metadata = await requestResult<WorldSaveMetadata | undefined>(
      transaction.objectStore(WORLD_STORE).get(worldId),
    );

    return metadata ?? null;
  }

  async putWorldMetadata(metadata: WorldSaveMetadata): Promise<void> {
    const database = await this.#open();
    const transaction = database.transaction(WORLD_STORE, "readwrite");

    transaction.objectStore(WORLD_STORE).put(metadata);
    await transactionDone(transaction);
  }

  async deleteWorld(worldId: string): Promise<void> {
    const database = await this.#open();
    const transaction = database.transaction(
      [WORLD_STORE, RUNTIME_STORE, TERRAIN_EDIT_STORE],
      "readwrite",
    );
    const terrainStore = transaction.objectStore(TERRAIN_EDIT_STORE);
    const chunks = await getAllByIndex<TerrainEditChunkSave>(
      terrainStore,
      WORLD_ID_INDEX,
      worldId,
    );

    transaction.objectStore(WORLD_STORE).delete(worldId);
    transaction.objectStore(RUNTIME_STORE).delete(worldId);
    for (const chunk of chunks) {
      terrainStore.delete(chunk.id);
    }
    await transactionDone(transaction);
  }

  async getWorldRuntimeState(
    worldId: string,
  ): Promise<WorldRuntimeStateSave | null> {
    const database = await this.#open();
    const transaction = database.transaction(RUNTIME_STORE, "readonly");
    const state = await requestResult<WorldRuntimeStateSave | undefined>(
      transaction.objectStore(RUNTIME_STORE).get(worldId),
    );

    return state ?? null;
  }

  async putWorldRuntimeState(state: WorldRuntimeStateSave): Promise<void> {
    const database = await this.#open();
    const transaction = database.transaction(RUNTIME_STORE, "readwrite");

    transaction.objectStore(RUNTIME_STORE).put(state);
    await transactionDone(transaction);
  }

  async getTerrainEditChunks(worldId: string): Promise<TerrainEditChunkSave[]> {
    const database = await this.#open();
    const transaction = database.transaction(TERRAIN_EDIT_STORE, "readonly");

    return getAllByIndex<TerrainEditChunkSave>(
      transaction.objectStore(TERRAIN_EDIT_STORE),
      WORLD_ID_INDEX,
      worldId,
    );
  }

  async replaceTerrainEditChunks(
    worldId: string,
    chunks: readonly TerrainEditChunkSave[],
  ): Promise<void> {
    const database = await this.#open();
    const transaction = database.transaction(TERRAIN_EDIT_STORE, "readwrite");
    const store = transaction.objectStore(TERRAIN_EDIT_STORE);
    const existing = await getAllByIndex<TerrainEditChunkSave>(
      store,
      WORLD_ID_INDEX,
      worldId,
    );

    for (const chunk of existing) {
      store.delete(chunk.id);
    }
    for (const chunk of chunks) {
      store.put(chunk);
    }
    await transactionDone(transaction);
  }

  #open(): Promise<IDBDatabase> {
    this.#database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

      request.addEventListener("upgradeneeded", () => {
        const database = request.result;

        if (!database.objectStoreNames.contains(WORLD_STORE)) {
          database.createObjectStore(WORLD_STORE, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(RUNTIME_STORE)) {
          database.createObjectStore(RUNTIME_STORE, { keyPath: "worldId" });
        }
        if (!database.objectStoreNames.contains(TERRAIN_EDIT_STORE)) {
          const terrainStore = database.createObjectStore(TERRAIN_EDIT_STORE, {
            keyPath: "id",
          });
          terrainStore.createIndex(WORLD_ID_INDEX, "worldId", {
            unique: false,
          });
        }
      });
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });

    return this.#database;
  }
}

export class MemorySaveDatabase implements WorldSaveDatabase {
  readonly #metadata = new Map<string, WorldSaveMetadata>();
  readonly #runtime = new Map<string, WorldRuntimeStateSave>();
  readonly #terrainEditChunks = new Map<string, TerrainEditChunkSave>();

  async listWorldMetadata(): Promise<WorldSaveMetadata[]> {
    return [...this.#metadata.values()].sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }

  async getWorldMetadata(worldId: string): Promise<WorldSaveMetadata | null> {
    return this.#metadata.get(worldId) ?? null;
  }

  async putWorldMetadata(metadata: WorldSaveMetadata): Promise<void> {
    this.#metadata.set(metadata.id, metadata);
  }

  async deleteWorld(worldId: string): Promise<void> {
    this.#metadata.delete(worldId);
    this.#runtime.delete(worldId);
    for (const [id, chunk] of this.#terrainEditChunks) {
      if (chunk.worldId === worldId) {
        this.#terrainEditChunks.delete(id);
      }
    }
  }

  async getWorldRuntimeState(
    worldId: string,
  ): Promise<WorldRuntimeStateSave | null> {
    return this.#runtime.get(worldId) ?? null;
  }

  async putWorldRuntimeState(state: WorldRuntimeStateSave): Promise<void> {
    this.#runtime.set(state.worldId, state);
  }

  async getTerrainEditChunks(worldId: string): Promise<TerrainEditChunkSave[]> {
    return [...this.#terrainEditChunks.values()].filter(
      (chunk) => chunk.worldId === worldId,
    );
  }

  async replaceTerrainEditChunks(
    worldId: string,
    chunks: readonly TerrainEditChunkSave[],
  ): Promise<void> {
    for (const [id, chunk] of this.#terrainEditChunks) {
      if (chunk.worldId === worldId) {
        this.#terrainEditChunks.delete(id);
      }
    }
    for (const chunk of chunks) {
      this.#terrainEditChunks.set(chunk.id, chunk);
    }
  }
}

export function createSaveDatabase(): WorldSaveDatabase {
  return typeof indexedDB === "undefined"
    ? new MemorySaveDatabase()
    : new IndexedDbSaveDatabase();
}
