import {
  buildTerrainChunk,
  isCollisionSolidMaterial,
  isFluidMaterial,
  isRaycastTargetMaterial,
  TERRAIN_BASE_Y,
  TERRAIN_BLOCK_HEIGHT,
  TERRAIN_BLOCK_RADIUS,
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
const WATER_SPREAD_DISTANCE = 5;
const WATER_FLOW_SCAN_RADIUS = 2;
const WATER_FLOW_LEVEL_RADIUS = 3;
const MAX_WATER_FLOW_EDITS = 96;
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
  return terrainProfileAt(q, r, seed).height;
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
  if (level < 2 || level >= surfaceHeight) {
    return false;
  }

  const tunnel = Math.abs(
    valueNoise3d(q * 0.105, level * 0.14, r * 0.105, seed + 601) - 0.5,
  );
  const chamber = valueNoise3d(
    q * 0.062,
    level * 0.09,
    r * 0.062,
    seed + 647,
  );
  const cave =
    level < surfaceHeight - 1 &&
    tunnel < 0.075 &&
    chamber > 0.34;
  const entranceField = valueNoise(
    q * 0.095,
    r * 0.095,
    seed + 691,
  );
  const entrance =
    entranceField > 0.81 &&
    level >= surfaceHeight - 6 &&
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
  const maximumLevel = Math.max(profile.height, profile.waterLevel) + 8;
  const blocks = new Uint8Array(maximumLevel);
  const moistureVariant = valueNoise(
    q * 0.037,
    r * 0.037,
    seed + 733,
  );
  const topMaterial = surfaceMaterial(profile.biome, moistureVariant);
  let caveAirCount = 0;

  for (let level = 0; level < profile.height; level += 1) {
    const depth = profile.height - level;
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
        profile.mountain && level > profile.height - 8
          ? TerrainMaterial.AlpineRock
          : TerrainMaterial.Stone;
    }

    if (caveAt(q, r, level, profile.height, seed)) {
      blocks[level] = TerrainMaterial.Air;
      caveAirCount += 1;
    } else {
      blocks[level] = material;
    }
  }

  for (
    let level = profile.height;
    level < profile.waterLevel;
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

    const treeBase = terrainProfileAt(treeQ, treeR, seed).height;
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
    height: profile.height,
    visible,
    blocks,
    biome: profile.biome,
    river: profile.river,
    mountain: profile.mountain,
    caveAirCount,
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
      columns.push({
        ...generateTerrainColumn(q, r, seed, 
          q >= minimumQ &&
          q <= maximumQ &&
          r >= minimumR &&
          r <= maximumR),
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
): TerrainBuildResult {
  const columns = generateStreamedColumns(
    centerChunk,
    chunkSize,
    renderDistance,
    seed,
  );
  const editsByColumn = new Map<string, TerrainEdit[]>();

  for (const edit of edits) {
    const key = `${edit[0]},${edit[1]}`;
    const columnEdits = editsByColumn.get(key);
    if (columnEdits) {
      columnEdits.push(edit);
    } else {
      editsByColumn.set(key, [edit]);
    }
  }

  const editedColumns = columns.map((column) => {
    const columnEdits = editsByColumn.get(`${column.q},${column.r}`);
    if (!columnEdits || !column.blocks) {
      return column;
    }

    const highestLevel = Math.max(...columnEdits.map((edit) => edit[2]));
    const blocks = new Uint8Array(
      Math.max(column.blocks.length, highestLevel + 1),
    );
    blocks.set(column.blocks);
    for (const [, , level, material] of columnEdits) {
      blocks[level] = material;
    }
    return { ...column, blocks };
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
      63,
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
    let columnEdits = this.#edits.get(key);
    if (!columnEdits) {
      columnEdits = new Map();
      this.#edits.set(key, columnEdits);
    }
    columnEdits.set(position.level, material);
    this.#columnCache.delete(key);
  }

  #applyMaterialConsequences(
    position: VoxelPosition,
    previousMaterial: TerrainMaterial,
    material: TerrainMaterial,
  ): void {
    if (material === TerrainMaterial.Air) {
      this.#settleWaterAround(position);
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

  #settleWaterAround(origin: VoxelPosition): void {
    type WaterNode = VoxelPosition & Readonly<{ distance: number }>;
    const queue: WaterNode[] = [];
    const visited = new Set<string>();
    let waterEditCount = 0;

    const enqueue = (node: WaterNode): void => {
      const key = `${node.q},${node.r},${node.level}`;
      if (visited.has(key)) {
        return;
      }
      visited.add(key);
      queue.push(node);
    };

    for (
      let q = origin.q - WATER_FLOW_SCAN_RADIUS;
      q <= origin.q + WATER_FLOW_SCAN_RADIUS;
      q += 1
    ) {
      for (
        let r = origin.r - WATER_FLOW_SCAN_RADIUS;
        r <= origin.r + WATER_FLOW_SCAN_RADIUS;
        r += 1
      ) {
        if (axialDistance(origin, { q, r }) > WATER_FLOW_SCAN_RADIUS) {
          continue;
        }

        for (
          let level = Math.max(0, origin.level - WATER_FLOW_LEVEL_RADIUS);
          level <= origin.level + WATER_FLOW_LEVEL_RADIUS;
          level += 1
        ) {
          if (this.materialAt(q, r, level) === TerrainMaterial.Water) {
            enqueue({ q, r, level, distance: 0 });
          }
        }
      }
    }

    for (
      let cursor = 0;
      cursor < queue.length && waterEditCount < MAX_WATER_FLOW_EDITS;
      cursor += 1
    ) {
      const source = queue[cursor]!;

      if (source.level > 0) {
        const below = {
          q: source.q,
          r: source.r,
          level: source.level - 1,
        };
        if (this.#isWaterFillable(below)) {
          this.#setEditedBlock(below, TerrainMaterial.Water);
          waterEditCount += 1;
          enqueue({ ...below, distance: source.distance });
          continue;
        }
      }

      if (source.distance >= WATER_SPREAD_DISTANCE) {
        continue;
      }

      for (const [offsetQ, offsetR] of HORIZONTAL_DIRECTIONS) {
        const next = {
          q: source.q + offsetQ,
          r: source.r + offsetR,
          level: source.level,
        };

        if (!this.#isWaterFillable(next)) {
          continue;
        }

        this.#setEditedBlock(next, TerrainMaterial.Water);
        waterEditCount += 1;
        enqueue({ ...next, distance: source.distance + 1 });

        if (waterEditCount >= MAX_WATER_FLOW_EDITS) {
          break;
        }
      }
    }
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

    this.#cancelPendingBuild?.();
    this.#cancelPendingBuild = null;
    this.#worker?.terminate();
    const requestId = ++this.#workerRequestId;
    const worker = new Worker(
      new URL("./terrainWorker.ts", import.meta.url),
      { type: "module" },
    );
    this.#worker = worker;

    return new Promise((resolve, reject) => {
      this.#cancelPendingBuild = () => resolve(null);
      worker.addEventListener("message", (event: MessageEvent<TerrainStreamUpdate>) => {
        worker.terminate();
        if (this.#worker === worker) {
          this.#worker = null;
          this.#cancelPendingBuild = null;
        }
        resolve(requestId === this.#workerRequestId ? event.data : null);
      });
      worker.addEventListener("error", (event) => {
        worker.terminate();
        if (this.#worker === worker) {
          this.#worker = null;
          this.#cancelPendingBuild = null;
        }
        reject(event.error ?? new Error(event.message));
      });
      worker.postMessage({
        centerChunk,
        chunkSize: this.#chunkSize,
        renderDistance: this.#renderDistance,
        seed: this.#seed,
        edits: this.#serializedEdits(),
      });
    });
  }
}
