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
  type TerrainBiome,
  type TerrainColumn,
} from "../geometry/terrainChunk.ts";

export type WorldPosition = Readonly<{
  x: number;
  z: number;
}>;

export type AxialPosition = Readonly<{
  q: number;
  r: number;
}>;

export type VoxelPosition = AxialPosition &
  Readonly<{
    level: number;
  }>;

export type VoxelRaycastHit = Readonly<{
  voxel: VoxelPosition;
  adjacent: VoxelPosition | null;
  material: TerrainMaterial;
  distance: number;
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
];

export type TerrainBuildResult = Readonly<{
  update: TerrainStreamUpdate;
  columns: readonly TerrainColumn[];
}>;

type WaterFlowNode = Readonly<{
  position: VoxelPosition;
  horizontalDistance: number;
  remainingFallDistance: number;
}>;

export const DEFAULT_WORLD_SEED = 0x484558;
export const DEFAULT_CHUNK_SIZE = 8;
export const DEFAULT_RENDER_DISTANCE = 4;
const HEX_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];
const HORIZONTAL_DIRECTIONS: ReadonlyArray<readonly [number, number]> =
  HEX_DIRECTIONS.slice(1);
const MAX_WATER_HORIZONTAL_DISTANCE = 3;
const MAX_WATER_FALL_DISTANCE = 12;
const MAX_WATER_CHANGES_PER_STEP = 12;
const MAX_WATER_STEPS_PER_UPDATE = 4;
const WATER_FLOW_STEP_SECONDS = 0.08;
const LEAF_SUPPORT_DISTANCE = 5;
const LEAF_DECAY_SCAN_RADIUS = 3;
const LEAF_DECAY_LEVEL_RADIUS = 8;

function interpolate(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function smoothStep(value: number): number {
  return value * value * (3 - 2 * value);
}

function rangeStep(minimum: number, maximum: number, value: number): number {
  return smoothStep(
    Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum))),
  );
}

function axialDistance(
  a: AxialPosition,
  b: AxialPosition,
): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

function hash2d(x: number, z: number, seed: number): number {
  let value =
    Math.imul(x, 0x1f123bb5) ^
    Math.imul(z, 0x5f356495) ^
    Math.imul(seed, 0x2c1b3c6d);
  value = Math.imul(value ^ (value >>> 15), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 13), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

function valueNoise(x: number, z: number, seed: number): number {
  const minimumX = Math.floor(x);
  const minimumZ = Math.floor(z);
  const fractionX = smoothStep(x - minimumX);
  const fractionZ = smoothStep(z - minimumZ);
  const north = interpolate(
    hash2d(minimumX, minimumZ, seed),
    hash2d(minimumX + 1, minimumZ, seed),
    fractionX,
  );
  const south = interpolate(
    hash2d(minimumX, minimumZ + 1, seed),
    hash2d(minimumX + 1, minimumZ + 1, seed),
    fractionX,
  );

  return interpolate(north, south, fractionZ);
}

function hash3d(x: number, y: number, z: number, seed: number): number {
  let value =
    Math.imul(x, 0x1f123bb5) ^
    Math.imul(y, 0x6c8e9cf5) ^
    Math.imul(z, 0x5f356495) ^
    Math.imul(seed, 0x2c1b3c6d);
  value = Math.imul(value ^ (value >>> 15), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 13), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

function valueNoise3d(
  x: number,
  y: number,
  z: number,
  seed: number,
): number {
  const minimumX = Math.floor(x);
  const minimumY = Math.floor(y);
  const minimumZ = Math.floor(z);
  const fractionX = smoothStep(x - minimumX);
  const fractionY = smoothStep(y - minimumY);
  const fractionZ = smoothStep(z - minimumZ);
  const layer = (offsetY: number): number => {
    const north = interpolate(
      hash3d(minimumX, minimumY + offsetY, minimumZ, seed),
      hash3d(minimumX + 1, minimumY + offsetY, minimumZ, seed),
      fractionX,
    );
    const south = interpolate(
      hash3d(minimumX, minimumY + offsetY, minimumZ + 1, seed),
      hash3d(minimumX + 1, minimumY + offsetY, minimumZ + 1, seed),
      fractionX,
    );
    return interpolate(north, south, fractionZ);
  };

  return interpolate(layer(0), layer(1), fractionY);
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
  const q = (Math.sqrt(3) / 3 * x - z / 3) / blockRadius;
  const r = ((2 / 3) * z) / blockRadius;
  return roundAxial(q, r);
}

type TerrainProfile = Readonly<{
  height: number;
  waterLevel: number;
  biome: TerrainBiome;
  river: boolean;
  mountain: boolean;
}>;

function terrainProfileAt(
  q: number,
  r: number,
  seed = DEFAULT_WORLD_SEED,
): TerrainProfile {
  const { x, z } = axialToWorld(q, r);
  const continents = valueNoise(x * 0.018, z * 0.018, seed);
  const hills = valueNoise(x * 0.052, z * 0.052, seed + 101);
  const detail = valueNoise(x * 0.14, z * 0.14, seed + 211);
  const ridgeNoise = valueNoise(x * 0.025, z * 0.025, seed + 307);
  const ridge = 1 - Math.abs(ridgeNoise * 2 - 1);
  const mountainField = valueNoise(x * 0.011, z * 0.011, seed + 359);
  const mountainStrength =
    rangeStep(0.48, 0.78, mountainField) * ridge * ridge;
  const rawHeight =
    5 +
    continents * 9 +
    hills * 3.6 +
    detail * 1.6 +
    mountainStrength * 20;
  const riverWarpX =
    (valueNoise(x * 0.012, z * 0.012, seed + 401) - 0.5) * 24;
  const riverWarpZ =
    (valueNoise(x * 0.012, z * 0.012, seed + 433) - 0.5) * 24;
  const riverField = valueNoise(
    (x + riverWarpX) * 0.021,
    (z + riverWarpZ) * 0.021,
    seed + 467,
  );
  const riverDistance = Math.abs(riverField - 0.5);
  const riverStrength =
    (1 - rangeStep(0.018, 0.075, riverDistance)) *
    (1 - mountainStrength * 0.72);
  const waterLevel = Math.round(8 + continents * 5);
  const carvedHeight = interpolate(
    rawHeight,
    waterLevel - 1.2,
    riverStrength,
  );
  const height = Math.max(3, Math.min(38, Math.round(carvedHeight)));
  const river = riverStrength > 0.48 && height < waterLevel;
  const temperature =
    valueNoise(x * 0.008, z * 0.008, seed + 503) -
    mountainStrength * 0.35 -
    height * 0.006;
  const moisture =
    valueNoise(x * 0.01, z * 0.01, seed + 547) +
    riverStrength * 0.35;
  let biome: TerrainBiome;

  if (height >= 28 || (mountainStrength > 0.62 && temperature < 0.52)) {
    biome = "snow";
  } else if (height >= 21 || mountainStrength > 0.42) {
    biome = "alpine";
  } else if (temperature < 0.28) {
    biome = "tundra";
  } else if (temperature > 0.56 && moisture < 0.35) {
    biome = "desert";
  } else if (moisture > 0.58) {
    biome = "forest";
  } else {
    biome = "grassland";
  }

  return {
    height,
    waterLevel: river ? waterLevel : 0,
    biome,
    river,
    mountain: mountainStrength > 0.38 || height >= 21,
  };
}

export function terrainHeightAt(
  q: number,
  r: number,
  seed = DEFAULT_WORLD_SEED,
): number {
  return TERRAIN_DEPTH_BLOCKS + terrainProfileAt(q, r, seed).height;
}

export function biomeAt(
  q: number,
  r: number,
  seed = DEFAULT_WORLD_SEED,
): TerrainBiome {
  return terrainProfileAt(q, r, seed).biome;
}

export function caveAt(
  q: number,
  r: number,
  level: number,
  surfaceHeight: number,
  seed = DEFAULT_WORLD_SEED,
): boolean {
  const localLevel = level - TERRAIN_DEPTH_BLOCKS;
  const localSurfaceHeight = surfaceHeight - TERRAIN_DEPTH_BLOCKS;

  if (localLevel < 2 || localLevel >= localSurfaceHeight) {
    return false;
  }

  const tunnel = Math.abs(
    valueNoise3d(
      q * 0.105,
      localLevel * 0.14,
      r * 0.105,
      seed + 601,
    ) - 0.5,
  );
  const chamber = valueNoise3d(
    q * 0.062,
    localLevel * 0.09,
    r * 0.062,
    seed + 647,
  );
  const cave =
    localLevel < localSurfaceHeight - 1 &&
    tunnel < 0.075 &&
    chamber > 0.34;
  const entranceField = valueNoise(
    q * 0.095,
    r * 0.095,
    seed + 691,
  );
  const entrance =
    entranceField > 0.81 &&
    localLevel >= localSurfaceHeight - 6 &&
    tunnel < 0.15;

  return cave || entrance;
}

function surfaceMaterial(
  biome: TerrainBiome,
  moistureVariant: number,
): TerrainMaterial {
  switch (biome) {
    case "desert":
      return TerrainMaterial.Sand;
    case "snow":
    case "tundra":
      return TerrainMaterial.Snow;
    case "alpine":
      return TerrainMaterial.AlpineRock;
    case "grassland":
      return moistureVariant < 0.42
        ? TerrainMaterial.DryGrass
        : TerrainMaterial.Grass;
    case "forest":
    default:
      return TerrainMaterial.Grass;
  }
}

export function treeHeightAt(
  q: number,
  r: number,
  seed = DEFAULT_WORLD_SEED,
): number {
  const profile = terrainProfileAt(q, r, seed);

  if (
    profile.river ||
    profile.mountain ||
    (profile.biome !== "forest" && profile.biome !== "grassland")
  ) {
    return 0;
  }

  const chance = hash2d(q, r, seed + 797);
  const threshold = profile.biome === "forest" ? 0.925 : 0.985;

  if (chance < threshold) {
    return 0;
  }

  return 4 + Math.floor(hash2d(q, r, seed + 829) * 3);
}

export function generateTerrainColumn(
  q: number,
  r: number,
  seed = DEFAULT_WORLD_SEED,
  visible = true,
): TerrainColumn {
  const profile = terrainProfileAt(q, r, seed);
  const surfaceHeight = TERRAIN_DEPTH_BLOCKS + profile.height;
  const waterLevel =
    profile.waterLevel > 0
      ? TERRAIN_DEPTH_BLOCKS + profile.waterLevel
      : 0;
  const maximumLevel = Math.max(surfaceHeight, waterLevel) + 8;
  const blocks = new Uint8Array(maximumLevel);
  const moistureVariant = valueNoise(
    q * 0.037,
    r * 0.037,
    seed + 733,
  );
  const topMaterial = surfaceMaterial(profile.biome, moistureVariant);
  let caveAirCount = 0;

  blocks.fill(
    TerrainMaterial.Stone,
    0,
    Math.min(TERRAIN_DEPTH_BLOCKS, surfaceHeight),
  );

  for (
    let level = TERRAIN_DEPTH_BLOCKS;
    level < surfaceHeight;
    level += 1
  ) {
    const depth = surfaceHeight - level;
    let material: TerrainMaterial;

    if (depth === 1) {
      material = topMaterial;
    } else if (depth <= 3) {
      material =
        profile.biome === "desert"
          ? TerrainMaterial.Sand
          : profile.biome === "alpine" || profile.biome === "snow"
            ? TerrainMaterial.AlpineRock
            : TerrainMaterial.Dirt;
    } else {
      material =
        profile.mountain && level > surfaceHeight - 8
          ? TerrainMaterial.AlpineRock
          : TerrainMaterial.Stone;
    }

    if (caveAt(q, r, level, surfaceHeight, seed)) {
      blocks[level] = TerrainMaterial.Air;
      caveAirCount += 1;
    } else {
      blocks[level] = material;
    }
  }

  for (
    let level = surfaceHeight;
    level < waterLevel;
    level += 1
  ) {
    blocks[level] = TerrainMaterial.Water;
  }

  for (const [offsetQ, offsetR] of HEX_DIRECTIONS) {
    const treeQ = q + offsetQ;
    const treeR = r + offsetR;
    const treeHeight = treeHeightAt(treeQ, treeR, seed);

    if (treeHeight === 0) {
      continue;
    }

    const treeBase =
      TERRAIN_DEPTH_BLOCKS +
      terrainProfileAt(treeQ, treeR, seed).height;
    const isTrunkColumn = offsetQ === 0 && offsetR === 0;

    if (isTrunkColumn) {
      for (let level = treeBase; level < treeBase + treeHeight; level += 1) {
        blocks[level] = TerrainMaterial.Wood;
      }
      blocks[treeBase + treeHeight] = TerrainMaterial.Leaves;
    } else {
      for (
        let level = treeBase + treeHeight - 2;
        level <= treeBase + treeHeight;
        level += 1
      ) {
        if (blocks[level] === TerrainMaterial.Air) {
          blocks[level] = TerrainMaterial.Leaves;
        }
      }
    }
  }

  return {
    q,
    r,
    height: surfaceHeight,
    visible,
    blocks,
    biome: profile.biome,
    river: profile.river,
    mountain: profile.mountain,
    caveAirCount,
    minimumMeshLevel: TERRAIN_DEPTH_BLOCKS,
  };
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

export function generateStreamedColumns(
  centerChunk: AxialPosition,
  chunkSize = DEFAULT_CHUNK_SIZE,
  renderDistance = DEFAULT_RENDER_DISTANCE,
  seed = DEFAULT_WORLD_SEED,
  columnCache?: Map<string, TerrainColumn>,
): TerrainColumn[] {
  const minimumQ = (centerChunk.q - renderDistance) * chunkSize;
  const maximumQ =
    (centerChunk.q + renderDistance + 1) * chunkSize - 1;
  const minimumR = (centerChunk.r - renderDistance) * chunkSize;
  const maximumR =
    (centerChunk.r + renderDistance + 1) * chunkSize - 1;
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
          q >= minimumQ &&
          q <= maximumQ &&
          r >= minimumR &&
          r <= maximumR,
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

  for (const edit of edits) {
    const key = `${edit[0]},${edit[1]}`;
    const columnEdits = editsByColumn.get(key);
    if (columnEdits) {
      columnEdits.push(edit);
    } else {
      editsByColumn.set(key, [edit]);
    }

    for (const [offsetQ, offsetR] of HEX_DIRECTIONS) {
      const affectedKey = `${edit[0] + offsetQ},${edit[1] + offsetR}`;
      const minimumLevel = Math.max(0, edit[2] - 1);
      minimumMeshLevelByColumn.set(
        affectedKey,
        Math.min(
          minimumMeshLevelByColumn.get(affectedKey) ??
            Number.POSITIVE_INFINITY,
          minimumLevel,
        ),
      );
    }
  }

  const editedColumns = columns.map((column) => {
    const key = `${column.q},${column.r}`;
    const columnEdits = editsByColumn.get(key);
    const affectedMinimumLevel =
      minimumMeshLevelByColumn.get(key);
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
      mesh: buildTerrainChunk(editedColumns),
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
  readonly #edits = new Map<string, Map<number, TerrainMaterial>>();
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
  ) {
    this.#seed = seed;
    this.#chunkSize = chunkSize;
    this.#renderDistance = renderDistance;
  }

  update(position: WorldPosition): TerrainStreamUpdate | null {
    const axial = worldToAxial(position.x, position.z);
    const centerChunk = chunkAtAxial(
      axial.q,
      axial.r,
      this.#chunkSize,
    );

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
    const centerChunk = chunkAtAxial(
      axial.q,
      axial.r,
      this.#chunkSize,
    );

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
    if (
      !this.#centerChunk ||
      this.#waterFlowQueue.length === 0
    ) {
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

    while (
      completedSteps < availableSteps &&
      this.#waterFlowQueue.length > 0
    ) {
      changed = this.#advanceWaterFlowStep() || changed;
      completedSteps += 1;
    }
    this.#waterFlowElapsed -=
      completedSteps * WATER_FLOW_STEP_SECONDS;

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

  isSolidAt(q: number, r: number, level: number): boolean {
    const material = this.materialAt(q, r, level);
    return isCollisionSolidMaterial(material);
  }

  isFluidAt(q: number, r: number, level: number): boolean {
    return isFluidMaterial(this.materialAt(q, r, level));
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
    maximumDistance = 6,
  ): VoxelRaycastHit | null {
    let previous: VoxelPosition | null = null;
    let previousKey = "";

    for (let distance = 0; distance <= maximumDistance; distance += 0.06) {
      const x = origin[0] + direction[0] * distance;
      const y = origin[1] + direction[1] * distance;
      const z = origin[2] + direction[2] * distance;
      const { q, r } = worldToAxial(x, z);
      const level = Math.floor(
        (y - TERRAIN_BASE_Y) / TERRAIN_BLOCK_HEIGHT,
      );
      const key = `${q},${r},${level}`;

      if (key === previousKey) {
        continue;
      }

      const voxel = { q, r, level };
      const material = this.materialAt(q, r, level);

      if (isRaycastTargetMaterial(material)) {
        return {
          voxel,
          adjacent: previous,
          material,
          distance,
        };
      }

      previous = voxel;
      previousKey = key;
    }

    return null;
  }

  isSolidAtWorld(x: number, y: number, z: number): boolean {
    const { q, r } = worldToAxial(x, z);
    const level = Math.floor(
      (y - TERRAIN_BASE_Y) / TERRAIN_BLOCK_HEIGHT,
    );
    return this.isSolidAt(q, r, level);
  }

  isFluidAtWorld(x: number, y: number, z: number): boolean {
    const { q, r } = worldToAxial(x, z);
    const level = Math.floor(
      (y - TERRAIN_BASE_Y) / TERRAIN_BLOCK_HEIGHT,
    );
    return this.isFluidAt(q, r, level);
  }

  setBlock(
    position: VoxelPosition,
    material: TerrainMaterial,
  ): TerrainStreamUpdate | null {
    if (position.level < 0) {
      return null;
    }

    const previousMaterial = this.materialAt(
      position.q,
      position.r,
      position.level,
    );
    this.#setEditedBlock(position, material);
    this.#applyMaterialConsequences(
      position,
      previousMaterial,
      material,
    );
    return this.rebuild();
  }

  setBlockAsync(
    position: VoxelPosition,
    material: TerrainMaterial,
  ): Promise<TerrainStreamUpdate | null> | null {
    if (position.level < 0 || !this.#centerChunk) {
      return null;
    }

    const previousMaterial = this.materialAt(
      position.q,
      position.r,
      position.level,
    );
    this.#setEditedBlock(position, material);
    this.#applyMaterialConsequences(
      position,
      previousMaterial,
      material,
    );
    return this.#requestBackgroundBuild(this.#centerChunk);
  }

  #setEditedBlock(
    position: VoxelPosition,
    material: TerrainMaterial,
  ): void {
    const key = `${position.q},${position.r}`;
    this.#flowingWater.delete(
      `${position.q},${position.r},${position.level}`,
    );
    let columnEdits = this.#edits.get(key);
    if (!columnEdits) {
      columnEdits = new Map();
      this.#edits.set(key, columnEdits);
    }
    columnEdits.set(position.level, material);
    this.#columnCache.delete(key);
  }

  #setFlowingWaterBlock(
    position: VoxelPosition,
    horizontalDistance: number,
  ): void {
    this.#setEditedBlock(position, TerrainMaterial.Water);
    this.#flowingWater.set(
      `${position.q},${position.r},${position.level}`,
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
        `${position.q},${position.r},${position.level}`,
      ) ?? 0
    );
  }

  #waterInletDistance(origin: VoxelPosition): number | null {
    const aboveDistance = this.#waterDistanceAt({
      q: origin.q,
      r: origin.r,
      level: origin.level + 1,
    });
    if (aboveDistance !== null) {
      return aboveDistance;
    }

    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const [offsetQ, offsetR] of HORIZONTAL_DIRECTIONS) {
      const neighborDistance = this.#waterDistanceAt({
        q: origin.q + offsetQ,
        r: origin.r + offsetR,
        level: origin.level,
      });
      if (
        neighborDistance !== null &&
        neighborDistance < MAX_WATER_HORIZONTAL_DISTANCE
      ) {
        nearestDistance = Math.min(
          nearestDistance,
          neighborDistance + 1,
        );
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
    const key = `${position.q},${position.r},${position.level}`;
    const queuedDistance = this.#queuedWaterFlow.get(key);
    if (
      queuedDistance !== undefined &&
      queuedDistance <= horizontalDistance
    ) {
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
      processed < queuedAtStart &&
      changedBlocks < MAX_WATER_CHANGES_PER_STEP;
      processed += 1
    ) {
      const node = this.#waterFlowQueue.shift()!;
      const { position } = node;
      const key = `${position.q},${position.r},${position.level}`;
      if (
        this.#queuedWaterFlow.get(key) !== node.horizontalDistance
      ) {
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
        const below = {
          q: position.q,
          r: position.r,
          level: position.level - 1,
        };

        if (this.#isWaterFillable(below)) {
          this.#queueWaterFlow(
            below,
            horizontalDistance,
            node.remainingFallDistance - 1,
          );
          falls = true;
        }
      }

      if (
        !falls &&
        horizontalDistance < MAX_WATER_HORIZONTAL_DISTANCE
      ) {
        for (const [offsetQ, offsetR] of HORIZONTAL_DIRECTIONS) {
          const neighbor = {
            q: position.q + offsetQ,
            r: position.r + offsetR,
            level: position.level,
          };
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
    const visited = new Set<string>([
      `${start.q},${start.r},${start.level}`,
    ]);

    const enqueue = (position: VoxelPosition, distance: number): void => {
      const key = `${position.q},${position.r},${position.level}`;
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

      for (const [offsetQ, offsetR] of HORIZONTAL_DIRECTIONS) {
        const neighbor = {
          q: node.q + offsetQ,
          r: node.r + offsetR,
          level: node.level,
        };
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

      for (const offsetLevel of [-1, 1] as const) {
        const neighbor = {
          q: node.q,
          r: node.r,
          level: node.level + offsetLevel,
        };
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
        edits.push([q, r, level, material]);
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
      });
    }).finally(() => {
      if (backgroundBuildId === this.#backgroundBuildId) {
        this.#backgroundBuildPending = false;
      }
    });
  }
}
