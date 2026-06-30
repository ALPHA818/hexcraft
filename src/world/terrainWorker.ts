import {
  buildTerrainStream,
  type AxialPosition,
  type TerrainEdit,
} from "./InfiniteTerrain.ts";
import type { TerrainColumn } from "../geometry/terrainChunk.ts";

type TerrainWorkerRequest = Readonly<{
  requestId: number;
  centerChunk: AxialPosition;
  chunkSize: number;
  renderDistance: number;
  seed: number;
  edits: readonly TerrainEdit[];
}>;

type TerrainWorkerResponse = Readonly<{
  requestId: number;
  update: ReturnType<typeof buildTerrainStream>["update"];
}>;

type TerrainWorkerScope = Readonly<{
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<TerrainWorkerRequest>) => void,
  ) => void;
  postMessage: (
    message: TerrainWorkerResponse,
    transfer: readonly Transferable[],
  ) => void;
}>;

const workerScope = globalThis as unknown as TerrainWorkerScope;
const columnCache = new Map<string, TerrainColumn>();

workerScope.addEventListener(
  "message",
  (event: MessageEvent<TerrainWorkerRequest>) => {
    const request = event.data;
    const result = buildTerrainStream(
      request.centerChunk,
      request.chunkSize,
      request.renderDistance,
      request.seed,
      request.edits,
      columnCache,
    );
    const update = result.update;

    while (columnCache.size > 8192) {
      const oldestKey = columnCache.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      columnCache.delete(oldestKey);
    }

    workerScope.postMessage({ requestId: request.requestId, update }, [
      update.mesh.vertices.buffer,
    ]);
  },
);
