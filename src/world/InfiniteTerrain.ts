import {
  buildTerrainChunk,
  isCollisionSolidMaterial,
  isFluidMaterial,
  isRaycastTargetMaterial,
  TERRAIN_BASE_Y,
  TERRAIN_BLOCK_HEIGHT,
  TERRAIN_BLOCK_RADIUS,
  TERRAIN_DEPTH_BLOCKS,
  TerrainMaterial,
  type TerrainChunkMesh,
  type TerrainColumn,
} from "../geometry/terrainChunk.ts";
import type { MaterialDefinition } from "../materials/MaterialTypes.ts";
import type { MaterialVisuals } from "../materials/MaterialVisuals.ts";
import {
  DEFAULT_WORLD_SEED,
  generateTerrainColumn,
} from "./TerrainGenerator.ts";
import {
  dynamicMaterialBlockVisuals,
  dynamicMaterialVoxelKey,
  isDynamicMaterialBlock,
  normalizeDynamicMaterialId,
} from "./DynamicMaterialBlocks.ts";
import { blockDefinitionFor, type BlockDefinition } from "./blocks.ts";
import {
  axialDistance,
  directionFromFace,
  HORIZONTAL_HEX_DIRECTIONS,
  neighborOf,
  VERTICAL_DIRECTIONS,
  type VoxelFace,
  voxelKey,
  type AxialPosition,
  type VoxelPosition,
} from "./voxelRules.ts";

export type { AxialPosition, VoxelPosition } from "./voxelRules.ts";
export {
  DEFAULT_WORLD_SEED,
  biomeAt,
  caveAt,
  generateTerrainColumn,
  oreMaterialAt,
  terrainHeightAt,
  terrainProfileAt,
  treeHeightAt,
} from "./TerrainGenerator.ts";

export type WorldPosition = Readonly<{
  x: number;
  z: number;
}>;

export type VoxelRaycastHit = Readonly<{
  voxel: VoxelPosition;
  face: VoxelFace;
  adjacent: VoxelPosition;
  material: TerrainMaterial;
  block: BlockDefinition;
  distance: number;
}>;

export type VoxelRaycastOptions = Readonly<{
  maximumDistance?: number;
  includeFluids?: boolean;
}>;

export type TerrainStreamUpdate = Readonly<{
  mesh: TerrainChunkMesh;
  centerChunk: AxialPosition;
  loadedChunkCount: number;
  seed: number;
}>;

export type TerrainEdit = readonly [
  q: number,
  r: number,
  level: number,
  material: TerrainMaterial,
  dynamicMaterialId?: string,
];

export type TerrainEditChunk = Readonly<{
  chunkKey: string;
  chunkQ: number;
  chunkR: number;
  edits: readonly TerrainEdit[];
}>;

type MutableTerrainEditChunk = {
  chunkKey: string;
  chunkQ: number;
  chunkR: number;
  edits: TerrainEdit[];
};

export type TerrainBuildResult = Readonly<{
  update: TerrainStreamUpdate;
  columns: readonly TerrainColumn[];
}>;

export type DynamicMaterialVisualResolver = (
  materialId: string,
) => MaterialVisuals | null;

export type DynamicMaterialResolver = Readonly<{
  getMaterialById: (materialId: string) => MaterialDefinition | null;
}>;

type WaterFlowNode = Readonly<{
  position: VoxelPosition;
  horizontalDistance: number;
  remainingFallDistance: number;
}>;

export const DEFAULT_CHUNK_SIZE = 8;
export const DEFAULT_RENDER_DISTANCE = 4;
const CENTER_AND_HORIZONTAL_DIRECTIONS = [
  { q: 0, r: 0 },
  ...HORIZONTAL_HEX_DIRECTIONS,
] as const;
const MAX_WATER_HORIZONTAL_DISTANCE = 3;
const MAX_WATER_FALL_DISTANCE = 12;
const MAX_WATER_CHANGES_PER_STEP = 12;
const MAX_WATER_STEPS_PER_UPDATE = 4;
const WATER_FLOW_STEP_SECONDS = 0.08;
const LEAF_SUPPORT_DISTANCE = 5;
const LEAF_DECAY_SCAN_RADIUS = 3;
const LEAF_DECAY_LEVEL_RADIUS = 8;
const HEX_APOTHEM = TERRAIN_BLOCK_RADIUS * Math.cos(Math.PI / 6);
const RAYCAST_SAMPLE_STEP = 0.16;
const RAYCAST_EPSILON = 1e-6;

type NormalizedDirection = readonly [number, number, number];

type VoxelRayIntersection = Readonly<{
  distance: number;
  face: VoxelFace;
}>;

function normalizeRayDirection(
  direction: readonly [number, number, number],
): NormalizedDirection | null {
  const length = Math.hypot(direction[0], direction[1], direction[2]);

  return length > RAYCAST_EPSILON
    ? [direction[0] / length, direction[1] / length, direction[2] / length]
    : null;
}

function roundAxial(q: number, r: number): AxialPosition {
  const x = q;
  const z = r;
  const y = -x - z;
  let roundedX = Math.round(x);
  let roundedY = Math.round(y);
  let roundedZ = Math.round(z);
  const differenceX = Math.abs(roundedX - x);
  const differenceY = Math.abs(roundedY - y);
  const differenceZ = Math.abs(roundedZ - z);

  if (differenceX > differenceY && differenceX > differenceZ) {
    roundedX = -roundedY - roundedZ;
  } else if (differenceY > differenceZ) {
    roundedY = -roundedX - roundedZ;
  } else {
    roundedZ = -roundedX - roundedY;
  }

  return { q: roundedX, r: roundedZ };
}

export function axialToWorld(
  q: number,
  r: number,
  blockRadius = TERRAIN_BLOCK_RADIUS,
): WorldPosition {
  return {
    x: Math.sqrt(3) * (q + r / 2) * blockRadius,
    z: 1.5 * r * blockRadius,
  };
}

export function worldToAxial(
  x: number,
  z: number,
  blockRadius = TERRAIN_BLOCK_RADIUS,
): AxialPosition {
  const q = ((Math.sqrt(3) / 3) * x - z / 3) / blockRadius;
  const r = ((2 / 3) * z) / blockRadius;
  return roundAxial(q, r);
}

export function chunkAtAxial(
  q: number,
  r: number,
  chunkSize = DEFAULT_CHUNK_SIZE,
): AxialPosition {
  return {
    q: Math.floor(q / chunkSize),
    r: Math.floor(r / chunkSize),
  };
}

export function chunkKeyAtAxial(
  q: number,
  r: number,
  chunkSize = DEFAULT_CHUNK_SIZE,
): string {
  const chunk = chunkAtAxial(q, r, chunkSize);
  return `${chunk.q},${chunk.r}`;
}

function voxelUpperY(material: TerrainMaterial, level: number): number {
  const lowerY = TERRAIN_BASE_Y + level * TERRAIN_BLOCK_HEIGHT;

  return (
    lowerY +
    TERRAIN_BLOCK_HEIGHT * (material === TerrainMaterial.Water ? 0.86 : 1)
  );
}

function isRaycastTargetForOptions(
  material: TerrainMaterial,
  options: VoxelRaycastOptions,
): boolean {
  return (
    isRaycastTargetMaterial(material) ||
    (options.includeFluids === true && isFluidMaterial(material))
  );
}

function collectRaycastCandidates(
  origin: readonly [number, number, number],
  direction: NormalizedDirection,
  maximumDistance: number,
): VoxelPosition[] {
  const candidates = new Map<string, VoxelPosition>();

  const addCandidate = (candidate: VoxelPosition): void => {
    if (candidate.level < 0) {
      return;
    }

    candidates.set(
      voxelKey(candidate.q, candidate.r, candidate.level),
      candidate,
    );
  };

  for (
    let distance = 0;
    distance <= maximumDistance + RAYCAST_EPSILON;
    distance += RAYCAST_SAMPLE_STEP
  ) {
    const x = origin[0] + direction[0] * distance;
    const y = origin[1] + direction[1] * distance;
    const z = origin[2] + direction[2] * distance;
    const axial = worldToAxial(x, z);
    const level = Math.floor((y - TERRAIN_BASE_Y) / TERRAIN_BLOCK_HEIGHT);

    for (let levelOffset = -1; levelOffset <= 1; levelOffset += 1) {
      const candidateLevel = level + levelOffset;
      addCandidate({ ...axial, level: candidateLevel });

      for (const direction of HORIZONTAL_HEX_DIRECTIONS) {
        addCandidate({
          q: axial.q + direction.q,
          r: axial.r + direction.r,
          level: candidateLevel,
        });
      }
    }
  }

  return [...candidates.values()];
}

function intersectRayWithVoxel(
  origin: readonly [number, number, number],
  direction: NormalizedDirection,
  voxel: VoxelPosition,
  material: TerrainMaterial,
  maximumDistance: number,
): VoxelRayIntersection | null {
  const center = axialToWorld(voxel.q, voxel.r);
  const lowerY = TERRAIN_BASE_Y + voxel.level * TERRAIN_BLOCK_HEIGHT;
  const upperY = voxelUpperY(material, voxel.level);
  let enterDistance = 0;
  let exitDistance = maximumDistance;
  let enterFace: VoxelFace | null = null;
  let exitFace: VoxelFace | null = null;

  const clipMaximumPlane = (
    normalX: number,
    normalZ: number,
    maximum: number,
    face: VoxelFace,
  ): boolean => {
    const originOffset =
      (origin[0] - center.x) * normalX + (origin[2] - center.z) * normalZ;
    const directionSpeed = direction[0] * normalX + direction[2] * normalZ;
    const signedDistance = originOffset - maximum;

    if (Math.abs(directionSpeed) < RAYCAST_EPSILON) {
      return signedDistance <= RAYCAST_EPSILON;
    }

    const planeDistance = -signedDistance / directionSpeed;
    if (directionSpeed < 0) {
      if (planeDistance > enterDistance + RAYCAST_EPSILON) {
        enterDistance = planeDistance;
        enterFace = face;
      }
    } else if (planeDistance < exitDistance) {
      exitDistance = planeDistance;
      exitFace = face;
    }

    return enterDistance <= exitDistance + RAYCAST_EPSILON;
  };

  const clipYInterval = (): boolean => {
    if (Math.abs(direction[1]) < RAYCAST_EPSILON) {
      return (
        origin[1] >= lowerY - RAYCAST_EPSILON &&
        origin[1] <= upperY + RAYCAST_EPSILON
      );
    }

    const lowerDistance = (lowerY - origin[1]) / direction[1];
    const upperDistance = (upperY - origin[1]) / direction[1];
    const enteringDistance = Math.min(lowerDistance, upperDistance);
    const leavingDistance = Math.max(lowerDistance, upperDistance);
    const enteringFace = direction[1] > 0 ? "bottom" : "top";
    const leavingFace = direction[1] > 0 ? "top" : "bottom";

    if (enteringDistance > enterDistance + RAYCAST_EPSILON) {
      enterDistance = enteringDistance;
      enterFace = enteringFace;
    }
    if (leavingDistance < exitDistance) {
      exitDistance = leavingDistance;
      exitFace = leavingFace;
    }

    return enterDistance <= exitDistance + RAYCAST_EPSILON;
  };

  for (let side = 0; side < 6; side += 1) {
    const angle = side * (Math.PI / 3);
    if (
      !clipMaximumPlane(
        Math.cos(angle),
        Math.sin(angle),
        HEX_APOTHEM,
        side as VoxelFace,
      )
    ) {
      return null;
    }
  }

  if (!clipYInterval() || exitDistance < -RAYCAST_EPSILON) {
    return null;
  }

  const distance = Math.max(0, enterDistance);
  if (distance > maximumDistance + RAYCAST_EPSILON) {
    return null;
  }

  return {
    distance,
    face: enterFace ?? exitFace ?? "top",
  };
}

export function generateStreamedColumns(
  centerChunk: AxialPosition,
  chunkSize = DEFAULT_CHUNK_SIZE,
  renderDistance = DEFAULT_RENDER_DISTANCE,
  seed = DEFAULT_WORLD_SEED,
  columnCache?: Map<string, TerrainColumn>,
): TerrainColumn[] {
  const minimumQ = (centerChunk.q - renderDistance) * chunkSize;
  const maximumQ = (centerChunk.q + renderDistance + 1) * chunkSize - 1;
  const minimumR = (centerChunk.r - renderDistance) * chunkSize;
  const maximumR = (centerChunk.r + renderDistance + 1) * chunkSize - 1;
  const columns: TerrainColumn[] = [];

  // The one-cell padding is used only for neighbor heights. It prevents fake
  // cliff walls from being emitted at boundaries between loaded windows.
  for (let q = minimumQ - 1; q <= maximumQ + 1; q += 1) {
    for (let r = minimumR - 1; r <= maximumR + 1; r += 1) {
      const cacheKey = `${seed},${q},${r}`;
      let column = columnCache?.get(cacheKey);
      if (!column) {
        column = generateTerrainColumn(q, r, seed, false);
        columnCache?.set(cacheKey, column);
      }
      columns.push({
        ...column,
        visible:
          q >= minimumQ && q <= maximumQ && r >= minimumR && r <= maximumR,
      });
    }
  }

  return columns;
}

export function buildTerrainStream(
  centerChunk: AxialPosition,
  chunkSize = DEFAULT_CHUNK_SIZE,
  renderDistance = DEFAULT_RENDER_DISTANCE,
  seed = DEFAULT_WORLD_SEED,
  edits: readonly TerrainEdit[] = [],
  columnCache?: Map<string, TerrainColumn>,
  visualForDynamicMaterialId?: DynamicMaterialVisualResolver,
): TerrainBuildResult {
  const columns = generateStreamedColumns(
    centerChunk,
    chunkSize,
    renderDistance,
    seed,
    columnCache,
  );
  const editsByColumn = new Map<string, TerrainEdit[]>();
  const minimumMeshLevelByColumn = new Map<string, number>();
  const dynamicMaterialIdsByVoxel = new Map<string, string>();

  for (const edit of edits) {
    const key = `${edit[0]},${edit[1]}`;
    const dynamicVoxelKey = voxelKey(edit[0], edit[1], edit[2]);
    const columnEdits = editsByColumn.get(key);
    if (columnEdits) {
      columnEdits.push(edit);
    } else {
      editsByColumn.set(key, [edit]);
    }

    for (const direction of CENTER_AND_HORIZONTAL_DIRECTIONS) {
      const affectedKey = `${edit[0] + direction.q},${edit[1] + direction.r}`;
      const minimumLevel = Math.max(0, edit[2] - 1);
      minimumMeshLevelByColumn.set(
        affectedKey,
        Math.min(
          minimumMeshLevelByColumn.get(affectedKey) ?? Number.POSITIVE_INFINITY,
          minimumLevel,
        ),
      );
    }

    if (isDynamicMaterialBlock(edit[3])) {
      const materialId = normalizeDynamicMaterialId(edit[4]);

      if (materialId) {
        dynamicMaterialIdsByVoxel.set(dynamicVoxelKey, materialId);
      } else {
        dynamicMaterialIdsByVoxel.delete(dynamicVoxelKey);
      }
    } else {
      dynamicMaterialIdsByVoxel.delete(dynamicVoxelKey);
    }
  }

  const dynamicMaterialVisualAt =
    visualForDynamicMaterialId && dynamicMaterialIdsByVoxel.size > 0
      ? (q: number, r: number, level: number): MaterialVisuals | null => {
          const materialId = dynamicMaterialIdsByVoxel.get(
            voxelKey(q, r, level),
          );

          return materialId ? visualForDynamicMaterialId(materialId) : null;
        }
      : undefined;

  const editedColumns = columns.map((column) => {
    const key = `${column.q},${column.r}`;
    const columnEdits = editsByColumn.get(key);
    const affectedMinimumLevel = minimumMeshLevelByColumn.get(key);
    const minimumMeshLevel =
      affectedMinimumLevel === undefined
        ? column.minimumMeshLevel
        : Math.min(
            column.minimumMeshLevel ?? affectedMinimumLevel,
            affectedMinimumLevel,
          );

    if (!columnEdits || !column.blocks) {
      return minimumMeshLevel === column.minimumMeshLevel
        ? column
        : { ...column, minimumMeshLevel };
    }

    const highestLevel = Math.max(...columnEdits.map((edit) => edit[2]));
    const blocks = new Uint8Array(
      Math.max(column.blocks.length, highestLevel + 1),
    );
    blocks.set(column.blocks);
    for (const [, , level, material] of columnEdits) {
      blocks[level] = material;
    }
    return { ...column, blocks, minimumMeshLevel };
  });

  return {
    update: {
      mesh: buildTerrainChunk(
        editedColumns,
        TERRAIN_BLOCK_RADIUS,
        TERRAIN_BLOCK_HEIGHT,
        { dynamicMaterialVisualAt },
      ),
      centerChunk,
      loadedChunkCount: (renderDistance * 2 + 1) ** 2,
      seed,
    },
    columns: editedColumns,
  };
}

export class InfiniteTerrain {
  readonly #seed: number;
  readonly #chunkSize: number;
  readonly #renderDistance: number;
  readonly #materialResolver: DynamicMaterialResolver | null;
  readonly #edits = new Map<string, Map<number, TerrainMaterial>>();
  readonly #dynamicMaterialIds = new Map<string, string>();
  readonly #columnCache = new Map<string, TerrainColumn>();

  #centerChunk: AxialPosition | null = null;
  #loadedColumns = new Map<string, TerrainColumn>();
  #worker: Worker | null = null;
  #workerRequestId = 0;
  #cancelPendingBuild: (() => void) | null = null;
  #backgroundBuildId = 0;
  #backgroundBuildPending = false;
  #waterFlowQueue: WaterFlowNode[] = [];
  #queuedWaterFlow = new Map<string, number>();
  #flowingWater = new Map<string, number>();
  #waterFlowElapsed = 0;

  constructor(
    seed = DEFAULT_WORLD_SEED,
    chunkSize = DEFAULT_CHUNK_SIZE,
    renderDistance = DEFAULT_RENDER_DISTANCE,
    materialResolver: DynamicMaterialResolver | null = null,
  ) {
    this.#seed = seed;
    this.#chunkSize = chunkSize;
    this.#renderDistance = renderDistance;
    this.#materialResolver = materialResolver;
  }

  update(position: WorldPosition): TerrainStreamUpdate | null {
    const axial = worldToAxial(position.x, position.z);
    const centerChunk = chunkAtAxial(axial.q, axial.r, this.#chunkSize);

    if (
      this.#centerChunk?.q === centerChunk.q &&
      this.#centerChunk.r === centerChunk.r
    ) {
      return null;
    }

    this.#centerChunk = centerChunk;
    return this.#buildUpdate(centerChunk);
  }

  requestUpdate(
    position: WorldPosition,
  ): Promise<TerrainStreamUpdate | null> | null {
    const axial = worldToAxial(position.x, position.z);
    const centerChunk = chunkAtAxial(axial.q, axial.r, this.#chunkSize);

    if (
      this.#centerChunk?.q === centerChunk.q &&
      this.#centerChunk.r === centerChunk.r
    ) {
      return null;
    }

    this.#centerChunk = centerChunk;
    return this.#requestBackgroundBuild(centerChunk);
  }

  rebuild(): TerrainStreamUpdate | null {
    return this.#centerChunk ? this.#buildUpdate(this.#centerChunk) : null;
  }

  advanceWaterFlow(
    deltaSeconds: number,
  ): Promise<TerrainStreamUpdate | null> | null {
    if (!this.#centerChunk || this.#waterFlowQueue.length === 0) {
      return null;
    }

    this.#waterFlowElapsed += Math.min(Math.max(deltaSeconds, 0), 0.25);
    if (
      this.#backgroundBuildPending ||
      this.#waterFlowElapsed < WATER_FLOW_STEP_SECONDS
    ) {
      return null;
    }

    const availableSteps = Math.min(
      MAX_WATER_STEPS_PER_UPDATE,
      Math.floor(this.#waterFlowElapsed / WATER_FLOW_STEP_SECONDS),
    );
    let completedSteps = 0;
    let changed = false;

    while (completedSteps < availableSteps && this.#waterFlowQueue.length > 0) {
      changed = this.#advanceWaterFlowStep() || changed;
      completedSteps += 1;
    }
    this.#waterFlowElapsed -= completedSteps * WATER_FLOW_STEP_SECONDS;

    if (!changed) {
      this.#waterFlowElapsed = 0;
      return null;
    }

    return this.#requestBackgroundBuild(this.#centerChunk);
  }

  materialAt(q: number, r: number, level: number): TerrainMaterial {
    if (level < 0) {
      return TerrainMaterial.Air;
    }

    const edited = this.#edits.get(`${q},${r}`)?.get(level);
    if (edited !== undefined) {
      return edited;
    }

    const key = `${q},${r}`;
    let column = this.#loadedColumns.get(key) ?? this.#columnCache.get(key);
    if (!column) {
      column = generateTerrainColumn(q, r, this.#seed, false);
      this.#columnCache.set(key, column);
      if (this.#columnCache.size > 1024) {
        const oldestKey = this.#columnCache.keys().next().value;
        if (oldestKey !== undefined) {
          this.#columnCache.delete(oldestKey);
        }
      }
    }
    return (column.blocks?.[level] ?? TerrainMaterial.Air) as TerrainMaterial;
  }

  exportTerrainEdits(): TerrainEdit[] {
    return this.#serializedEdits();
  }

  exportTerrainEditChunks(): TerrainEditChunk[] {
    const chunks = new Map<string, MutableTerrainEditChunk>();

    for (const edit of this.#serializedEdits()) {
      const chunk = chunkAtAxial(edit[0], edit[1], this.#chunkSize);
      const chunkKey = `${chunk.q},${chunk.r}`;
      let editChunk = chunks.get(chunkKey);

      if (!editChunk) {
        editChunk = {
          chunkKey,
          chunkQ: chunk.q,
          chunkR: chunk.r,
          edits: [],
        };
        chunks.set(chunkKey, editChunk);
      }
      editChunk.edits.push(edit);
    }

    return [...chunks.values()].map((chunk) => ({
      ...chunk,
      edits: [...chunk.edits],
    }));
  }

  importTerrainEdits(edits: readonly TerrainEdit[], replace = true): void {
    if (replace) {
      this.#edits.clear();
      this.#dynamicMaterialIds.clear();
      this.#flowingWater.clear();
      this.#queuedWaterFlow.clear();
      this.#waterFlowQueue = [];
      this.#waterFlowElapsed = 0;
    }

    for (const [q, r, level, material, dynamicMaterialId] of edits) {
      if (level < 0) {
        continue;
      }

      const key = `${q},${r}`;
      let columnEdits = this.#edits.get(key);
      if (!columnEdits) {
        columnEdits = new Map();
        this.#edits.set(key, columnEdits);
      }
      columnEdits.set(level, material);
      this.#setDynamicMaterialMetadata(
        { q, r, level },
        material,
        dynamicMaterialId,
      );
      this.#columnCache.delete(key);
    }
  }

  importTerrainEditChunks(
    chunks: readonly Pick<TerrainEditChunk, "edits">[],
    replace = true,
  ): void {
    this.importTerrainEdits(
      chunks.flatMap((chunk) => [...chunk.edits]),
      replace,
    );
  }

  isSolidAt(q: number, r: number, level: number): boolean {
    const material = this.materialAt(q, r, level);
    return isCollisionSolidMaterial(material);
  }

  isFluidAt(q: number, r: number, level: number): boolean {
    return isFluidMaterial(this.materialAt(q, r, level));
  }

  isColumnLoaded(q: number, r: number): boolean {
    const column = this.#loadedColumns.get(`${q},${r}`);

    return column !== undefined && column.visible !== false;
  }

  dynamicMaterialIdAt(position: VoxelPosition): string | null {
    return (
      this.#dynamicMaterialIds.get(dynamicMaterialVoxelKey(position)) ?? null
    );
  }

  groundYAt(x: number, z: number, maximumY: number): number {
    const { q, r } = worldToAxial(x, z);
    const maximumLevel = Math.min(
      TERRAIN_DEPTH_BLOCKS + 64,
      Math.floor((maximumY - TERRAIN_BASE_Y) / TERRAIN_BLOCK_HEIGHT),
    );

    for (let level = maximumLevel; level >= 0; level -= 1) {
      if (this.isSolidAt(q, r, level)) {
        return TERRAIN_BASE_Y + (level + 1) * TERRAIN_BLOCK_HEIGHT;
      }
    }

    return TERRAIN_BASE_Y;
  }

  raycast(
    origin: readonly [number, number, number],
    direction: readonly [number, number, number],
    maximumDistanceOrOptions: number | VoxelRaycastOptions = 6,
    options: VoxelRaycastOptions = {},
  ): VoxelRaycastHit | null {
    const raycastOptions =
      typeof maximumDistanceOrOptions === "number"
        ? options
        : maximumDistanceOrOptions;
    const maximumDistance =
      typeof maximumDistanceOrOptions === "number"
        ? maximumDistanceOrOptions
        : (maximumDistanceOrOptions.maximumDistance ?? 6);
    const normalizedDirection = normalizeRayDirection(direction);

    if (!normalizedDirection || maximumDistance <= 0) {
      return null;
    }

    let closestHit: VoxelRaycastHit | null = null;

    for (const voxel of collectRaycastCandidates(
      origin,
      normalizedDirection,
      maximumDistance,
    )) {
      if (!this.isColumnLoaded(voxel.q, voxel.r)) {
        continue;
      }

      const material = this.materialAt(voxel.q, voxel.r, voxel.level);
      if (!isRaycastTargetForOptions(material, raycastOptions)) {
        continue;
      }

      const intersection = intersectRayWithVoxel(
        origin,
        normalizedDirection,
        voxel,
        material,
        maximumDistance,
      );

      if (
        !intersection ||
        (closestHit &&
          intersection.distance >= closestHit.distance - RAYCAST_EPSILON)
      ) {
        continue;
      }

      const block = blockDefinitionFor(material);
      const faceDirection = directionFromFace(intersection.face);

      closestHit = {
        voxel,
        face: intersection.face,
        adjacent: neighborOf(voxel, faceDirection),
        material,
        block,
        distance: intersection.distance,
      };
    }

    return closestHit;
  }

  isSolidAtWorld(x: number, y: number, z: number): boolean {
    const { q, r } = worldToAxial(x, z);
    const level = Math.floor((y - TERRAIN_BASE_Y) / TERRAIN_BLOCK_HEIGHT);
    return this.isSolidAt(q, r, level);
  }

  isFluidAtWorld(x: number, y: number, z: number): boolean {
    const { q, r } = worldToAxial(x, z);
    const level = Math.floor((y - TERRAIN_BASE_Y) / TERRAIN_BLOCK_HEIGHT);
    return this.isFluidAt(q, r, level);
  }

  setBlock(
    position: VoxelPosition,
    material: TerrainMaterial,
    dynamicMaterialId?: string,
  ): TerrainStreamUpdate | null {
    if (position.level < 0) {
      return null;
    }

    const previousMaterial = this.materialAt(
      position.q,
      position.r,
      position.level,
    );
    this.#setEditedBlock(position, material, dynamicMaterialId);
    this.#applyMaterialConsequences(position, previousMaterial, material);
    return this.rebuild();
  }

  setBlockAsync(
    position: VoxelPosition,
    material: TerrainMaterial,
    dynamicMaterialId?: string,
  ): Promise<TerrainStreamUpdate | null> | null {
    if (position.level < 0 || !this.#centerChunk) {
      return null;
    }

    const previousMaterial = this.materialAt(
      position.q,
      position.r,
      position.level,
    );
    this.#setEditedBlock(position, material, dynamicMaterialId);
    this.#applyMaterialConsequences(position, previousMaterial, material);
    return this.#requestBackgroundBuild(this.#centerChunk);
  }

  #setEditedBlock(
    position: VoxelPosition,
    material: TerrainMaterial,
    dynamicMaterialId?: string,
  ): void {
    const key = `${position.q},${position.r}`;
    this.#flowingWater.delete(voxelKey(position.q, position.r, position.level));
    let columnEdits = this.#edits.get(key);
    if (!columnEdits) {
      columnEdits = new Map();
      this.#edits.set(key, columnEdits);
    }
    columnEdits.set(position.level, material);
    this.#setDynamicMaterialMetadata(position, material, dynamicMaterialId);
    this.#columnCache.delete(key);
  }

  #setDynamicMaterialMetadata(
    position: VoxelPosition,
    material: TerrainMaterial,
    dynamicMaterialId: string | undefined,
  ): void {
    const key = dynamicMaterialVoxelKey(position);
    const materialId = normalizeDynamicMaterialId(dynamicMaterialId);

    if (isDynamicMaterialBlock(material) && materialId) {
      this.#dynamicMaterialIds.set(key, materialId);
      return;
    }

    this.#dynamicMaterialIds.delete(key);
  }

  #setFlowingWaterBlock(
    position: VoxelPosition,
    horizontalDistance: number,
  ): void {
    this.#setEditedBlock(position, TerrainMaterial.Water);
    this.#flowingWater.set(
      voxelKey(position.q, position.r, position.level),
      horizontalDistance,
    );
  }

  #applyMaterialConsequences(
    position: VoxelPosition,
    previousMaterial: TerrainMaterial,
    material: TerrainMaterial,
  ): void {
    if (material === TerrainMaterial.Air) {
      this.#queueWaterFlowInto(position);
    }

    if (
      previousMaterial === TerrainMaterial.Wood &&
      material !== TerrainMaterial.Wood
    ) {
      this.#decayUnsupportedLeavesAround(position);
    }
  }

  #isWaterFillable(position: VoxelPosition): boolean {
    return (
      position.level >= 0 &&
      this.materialAt(position.q, position.r, position.level) ===
        TerrainMaterial.Air
    );
  }

  #waterDistanceAt(position: VoxelPosition): number | null {
    if (
      this.materialAt(position.q, position.r, position.level) !==
      TerrainMaterial.Water
    ) {
      return null;
    }

    return (
      this.#flowingWater.get(
        voxelKey(position.q, position.r, position.level),
      ) ?? 0
    );
  }

  #waterInletDistance(origin: VoxelPosition): number | null {
    const aboveDistance = this.#waterDistanceAt(
      neighborOf(origin, VERTICAL_DIRECTIONS[0]),
    );
    if (aboveDistance !== null) {
      return aboveDistance;
    }

    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const direction of HORIZONTAL_HEX_DIRECTIONS) {
      const neighborDistance = this.#waterDistanceAt(
        neighborOf(origin, direction),
      );
      if (
        neighborDistance !== null &&
        neighborDistance < MAX_WATER_HORIZONTAL_DISTANCE
      ) {
        nearestDistance = Math.min(nearestDistance, neighborDistance + 1);
      }
    }

    return Number.isFinite(nearestDistance) ? nearestDistance : null;
  }

  #queueWaterFlow(
    position: VoxelPosition,
    horizontalDistance: number,
    remainingFallDistance: number,
    resetTimer = false,
  ): void {
    const key = voxelKey(position.q, position.r, position.level);
    const queuedDistance = this.#queuedWaterFlow.get(key);
    if (queuedDistance !== undefined && queuedDistance <= horizontalDistance) {
      return;
    }

    if (resetTimer && this.#waterFlowQueue.length === 0) {
      this.#waterFlowElapsed = 0;
    }
    this.#queuedWaterFlow.set(key, horizontalDistance);
    this.#waterFlowQueue.push({
      position,
      horizontalDistance,
      remainingFallDistance,
    });
  }

  #queueWaterFlowInto(origin: VoxelPosition): void {
    if (!this.#isWaterFillable(origin)) {
      return;
    }

    const horizontalDistance = this.#waterInletDistance(origin);
    if (horizontalDistance === null) {
      return;
    }

    this.#queueWaterFlow(
      origin,
      horizontalDistance,
      MAX_WATER_FALL_DISTANCE,
      true,
    );
  }

  #advanceWaterFlowStep(): boolean {
    const queuedAtStart = this.#waterFlowQueue.length;
    let changedBlocks = 0;

    for (
      let processed = 0;
      processed < queuedAtStart && changedBlocks < MAX_WATER_CHANGES_PER_STEP;
      processed += 1
    ) {
      const node = this.#waterFlowQueue.shift()!;
      const { position } = node;
      const key = voxelKey(position.q, position.r, position.level);
      if (this.#queuedWaterFlow.get(key) !== node.horizontalDistance) {
        continue;
      }
      this.#queuedWaterFlow.delete(key);

      const inletDistance = this.#waterInletDistance(position);
      if (!this.#isWaterFillable(position) || inletDistance === null) {
        continue;
      }

      const horizontalDistance = Math.min(
        node.horizontalDistance,
        inletDistance,
      );
      this.#setFlowingWaterBlock(position, horizontalDistance);
      changedBlocks += 1;

      let falls = false;
      if (node.remainingFallDistance > 0 && position.level > 0) {
        const below = neighborOf(position, VERTICAL_DIRECTIONS[1]);

        if (this.#isWaterFillable(below)) {
          this.#queueWaterFlow(
            below,
            horizontalDistance,
            node.remainingFallDistance - 1,
          );
          falls = true;
        }
      }

      if (!falls && horizontalDistance < MAX_WATER_HORIZONTAL_DISTANCE) {
        for (const direction of HORIZONTAL_HEX_DIRECTIONS) {
          const neighbor = neighborOf(position, direction);
          if (this.#isWaterFillable(neighbor)) {
            this.#queueWaterFlow(
              neighbor,
              horizontalDistance + 1,
              MAX_WATER_FALL_DISTANCE,
            );
          }
        }
      }
    }

    return changedBlocks > 0;
  }

  #decayUnsupportedLeavesAround(origin: VoxelPosition): void {
    const candidates: VoxelPosition[] = [];

    for (
      let q = origin.q - LEAF_DECAY_SCAN_RADIUS;
      q <= origin.q + LEAF_DECAY_SCAN_RADIUS;
      q += 1
    ) {
      for (
        let r = origin.r - LEAF_DECAY_SCAN_RADIUS;
        r <= origin.r + LEAF_DECAY_SCAN_RADIUS;
        r += 1
      ) {
        if (axialDistance(origin, { q, r }) > LEAF_DECAY_SCAN_RADIUS) {
          continue;
        }

        for (
          let level = Math.max(0, origin.level - LEAF_DECAY_LEVEL_RADIUS);
          level <= origin.level + LEAF_DECAY_LEVEL_RADIUS;
          level += 1
        ) {
          if (this.materialAt(q, r, level) === TerrainMaterial.Leaves) {
            candidates.push({ q, r, level });
          }
        }
      }
    }

    for (const candidate of candidates) {
      if (
        this.materialAt(candidate.q, candidate.r, candidate.level) ===
          TerrainMaterial.Leaves &&
        !this.#leafHasWoodSupport(candidate)
      ) {
        this.#setEditedBlock(candidate, TerrainMaterial.Air);
      }
    }
  }

  #leafHasWoodSupport(start: VoxelPosition): boolean {
    type LeafNode = VoxelPosition & Readonly<{ distance: number }>;
    const queue: LeafNode[] = [{ ...start, distance: 0 }];
    const visited = new Set<string>([voxelKey(start.q, start.r, start.level)]);

    const enqueue = (position: VoxelPosition, distance: number): void => {
      const key = voxelKey(position.q, position.r, position.level);
      if (visited.has(key)) {
        return;
      }
      visited.add(key);
      queue.push({ ...position, distance });
    };

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const node = queue[cursor]!;
      const nextDistance = node.distance + 1;

      if (nextDistance > LEAF_SUPPORT_DISTANCE) {
        continue;
      }

      for (const direction of HORIZONTAL_HEX_DIRECTIONS) {
        const neighbor = neighborOf(node, direction);
        const material = this.materialAt(
          neighbor.q,
          neighbor.r,
          neighbor.level,
        );
        if (material === TerrainMaterial.Wood) {
          return true;
        }
        if (material === TerrainMaterial.Leaves) {
          enqueue(neighbor, nextDistance);
        }
      }

      for (const direction of VERTICAL_DIRECTIONS) {
        const neighbor = neighborOf(node, direction);
        const material = this.materialAt(
          neighbor.q,
          neighbor.r,
          neighbor.level,
        );
        if (material === TerrainMaterial.Wood) {
          return true;
        }
        if (material === TerrainMaterial.Leaves) {
          enqueue(neighbor, nextDistance);
        }
      }
    }

    return false;
  }

  #buildUpdate(centerChunk: AxialPosition): TerrainStreamUpdate {
    const result = buildTerrainStream(
      centerChunk,
      this.#chunkSize,
      this.#renderDistance,
      this.#seed,
      this.#serializedEdits(),
      this.#columnCache,
      (materialId) => this.#visualForDynamicMaterialId(materialId),
    );
    this.#loadedColumns.clear();
    for (const column of result.columns) {
      this.#loadedColumns.set(`${column.q},${column.r}`, column);
    }
    return result.update;
  }

  #serializedEdits(): TerrainEdit[] {
    const edits: TerrainEdit[] = [];
    for (const [key, columnEdits] of this.#edits) {
      const [qText, rText] = key.split(",");
      const q = Number(qText);
      const r = Number(rText);
      for (const [level, material] of columnEdits) {
        const dynamicMaterialId = this.#dynamicMaterialIds.get(
          dynamicMaterialVoxelKey({ q, r, level }),
        );

        edits.push(
          isDynamicMaterialBlock(material) && dynamicMaterialId
            ? [q, r, level, material, dynamicMaterialId]
            : [q, r, level, material],
        );
      }
    }
    return edits;
  }

  #requestBackgroundBuild(
    centerChunk: AxialPosition,
  ): Promise<TerrainStreamUpdate | null> {
    if (typeof Worker === "undefined") {
      return Promise.resolve(this.#buildUpdate(centerChunk));
    }

    if (this.#cancelPendingBuild) {
      this.#cancelPendingBuild();
      this.#cancelPendingBuild = null;
      this.#worker?.terminate();
      this.#worker = null;
    }
    const requestId = ++this.#workerRequestId;
    const backgroundBuildId = ++this.#backgroundBuildId;
    this.#backgroundBuildPending = true;
    const worker =
      this.#worker ??
      new Worker(new URL("./terrainWorker.ts", import.meta.url), {
        type: "module",
      });
    this.#worker = worker;

    return new Promise<TerrainStreamUpdate | null>((resolve, reject) => {
      type WorkerResponse = Readonly<{
        requestId: number;
        update: TerrainStreamUpdate;
      }>;
      const cleanup = (): void => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
      };
      const onMessage = (event: MessageEvent<WorkerResponse>): void => {
        if (event.data.requestId !== requestId) {
          return;
        }
        cleanup();
        this.#cancelPendingBuild = null;
        resolve(event.data.update);
      };
      const onError = (event: ErrorEvent): void => {
        cleanup();
        worker.terminate();
        if (this.#worker === worker) {
          this.#worker = null;
          this.#cancelPendingBuild = null;
        }
        reject(event.error ?? new Error(event.message));
      };
      this.#cancelPendingBuild = () => {
        cleanup();
        resolve(null);
      };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      worker.postMessage({
        requestId,
        centerChunk,
        chunkSize: this.#chunkSize,
        renderDistance: this.#renderDistance,
        seed: this.#seed,
        edits: this.#serializedEdits(),
        dynamicMaterialVisuals: this.#dynamicMaterialVisualRecord(),
      });
    }).finally(() => {
      if (backgroundBuildId === this.#backgroundBuildId) {
        this.#backgroundBuildPending = false;
      }
    });
  }

  #visualForDynamicMaterialId(materialId: string): MaterialVisuals | null {
    return dynamicMaterialBlockVisuals(materialId, this.#materialResolver);
  }

  #dynamicMaterialVisualRecord():
    Readonly<Record<string, MaterialVisuals>> | undefined {
    if (!this.#materialResolver || this.#dynamicMaterialIds.size === 0) {
      return undefined;
    }

    const visualsByMaterialId: Record<string, MaterialVisuals> = {};

    for (const materialId of new Set(this.#dynamicMaterialIds.values())) {
      const visual = this.#visualForDynamicMaterialId(materialId);

      if (visual) {
        visualsByMaterialId[materialId] = visual;
      }
    }

    return Object.keys(visualsByMaterialId).length > 0
      ? visualsByMaterialId
      : undefined;
  }
}
