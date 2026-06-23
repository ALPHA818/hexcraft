import {
  buildTerrainStream,
  type AxialPosition,
  type TerrainEdit,
} from "./InfiniteTerrain.ts";

type TerrainWorkerRequest = Readonly<{
  centerChunk: AxialPosition;
  chunkSize: number;
  renderDistance: number;
  seed: number;
  edits: readonly TerrainEdit[];
}>;

type TerrainWorkerScope = Readonly<{
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<TerrainWorkerRequest>) => void,
  ) => void;
  postMessage: (
    message: unknown,
    transfer: readonly Transferable[],
  ) => void;
}>;

const workerScope = globalThis as unknown as TerrainWorkerScope;

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
    );
    const update = result.update;

    workerScope.postMessage(update, [update.mesh.vertices.buffer]);
  },
);
