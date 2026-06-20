import { FLOATS_PER_VERTEX, type MeshData } from "./hexPrism.ts";
import {
  atlasUv,
  BlockTexture,
} from "../render/blockTextureAtlas.ts";

type Vec3 = readonly [number, number, number];
type Color = readonly [number, number, number];
type Vec2 = readonly [number, number];

export const enum TerrainMaterial {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Sand = 4,
  Snow = 5,
  AlpineRock = 6,
  DryGrass = 7,
  Water = 8,
  Wood = 9,
  Leaves = 10,
  Planks = 11,
}

export type TerrainBiome =
  | "grassland"
  | "forest"
  | "desert"
  | "tundra"
  | "alpine"
  | "snow";

export type TerrainColumn = Readonly<{
  q: number;
  r: number;
  height: number;
  visible?: boolean;
  blocks?: Uint8Array;
  biome?: TerrainBiome;
  river?: boolean;
  mountain?: boolean;
  caveAirCount?: number;
}>;

export type TerrainChunkMesh = MeshData &
  Readonly<{
    columnCount: number;
    blockCount: number;
    waterBlockCount: number;
    caveAirCount: number;
    riverColumnCount: number;
    mountainColumnCount: number;
    biomeCount: number;
    exposedFaceCount: number;
  }>;

const SQRT_THREE = Math.sqrt(3);
export const TERRAIN_BLOCK_RADIUS = 1;
export const TERRAIN_BLOCK_HEIGHT = 0.72;
export const TERRAIN_BASE_Y = -5.76;
const SIDE_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];
const SIDE_SHADE = [1, 0.94, 0.88, 0.82, 0.86, 0.93] as const;

function columnKey(q: number, r: number): string {
  return `${q},${r}`;
}

function pushVertex(
  output: number[],
  position: Vec3,
  normal: Vec3,
  color: Color,
  uv: Vec2,
): void {
  output.push(...position, ...normal, ...color, ...uv);
}

function pushTriangle(
  output: number[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  normal: Vec3,
  color: Color,
  aUv: Vec2,
  bUv: Vec2,
  cUv: Vec2,
): void {
  pushVertex(output, a, normal, color, aUv);
  pushVertex(output, b, normal, color, bUv);
  pushVertex(output, c, normal, color, cUv);
}

function tint(color: Color, amount: number): Color {
  return [
    Math.min(1, color[0] * amount),
    Math.min(1, color[1] * amount),
    Math.min(1, color[2] * amount),
  ];
}

function terrainHeight(q: number, r: number, radius: number): number {
  const distance = (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
  const broadHill =
    Math.sin(q * 0.82 + r * 0.31) * 0.72 +
    Math.cos(r * 1.17 - q * 0.24) * 0.55;
  const centerRise = (radius - distance) * 0.48;

  return Math.max(1, Math.min(6, Math.round(1.7 + centerRise + broadHill)));
}

export function generateTerrainColumns(radius = 5): TerrainColumn[] {
  const columns: TerrainColumn[] = [];

  for (let q = -radius; q <= radius; q += 1) {
    const minimumR = Math.max(-radius, -q - radius);
    const maximumR = Math.min(radius, -q + radius);

    for (let r = minimumR; r <= maximumR; r += 1) {
      columns.push({
        q,
        r,
        height: terrainHeight(q, r, radius),
      });
    }
  }

  return columns;
}

function legacyMaterial(column: TerrainColumn, level: number): TerrainMaterial {
  if (level < 0 || level >= column.height) {
    return TerrainMaterial.Air;
  }

  const depth = column.height - level;
  if (depth === 1) {
    return TerrainMaterial.Grass;
  }
  if (depth <= 3) {
    return TerrainMaterial.Dirt;
  }
  return TerrainMaterial.Stone;
}

function materialAt(column: TerrainColumn | undefined, level: number): TerrainMaterial {
  if (!column || level < 0) {
    return TerrainMaterial.Air;
  }

  if (!column.blocks) {
    return legacyMaterial(column, level);
  }

  return (column.blocks[level] ?? TerrainMaterial.Air) as TerrainMaterial;
}

function textureFor(
  material: TerrainMaterial,
  face: "top" | "side" | "bottom",
  caveInterior: boolean,
): BlockTexture {
  if (caveInterior && material !== TerrainMaterial.Water) {
    return BlockTexture.CaveStone;
  }

  switch (material) {
    case TerrainMaterial.Grass:
      return face === "top" ? BlockTexture.GrassTop : BlockTexture.GrassSide;
    case TerrainMaterial.Dirt:
      return BlockTexture.Dirt;
    case TerrainMaterial.Sand:
      return BlockTexture.Sand;
    case TerrainMaterial.Snow:
      return BlockTexture.Snow;
    case TerrainMaterial.AlpineRock:
      return BlockTexture.AlpineRock;
    case TerrainMaterial.DryGrass:
      return BlockTexture.DryGrass;
    case TerrainMaterial.Water:
      return BlockTexture.Water;
    case TerrainMaterial.Wood:
      return BlockTexture.Wood;
    case TerrainMaterial.Leaves:
      return BlockTexture.Leaves;
    case TerrainMaterial.Planks:
      return BlockTexture.Planks;
    case TerrainMaterial.Stone:
    case TerrainMaterial.Air:
    default:
      return BlockTexture.Stone;
  }
}

function faceIsExposed(
  material: TerrainMaterial,
  adjacent: TerrainMaterial,
): boolean {
  if (material === TerrainMaterial.Water) {
    return adjacent === TerrainMaterial.Air;
  }

  return (
    adjacent === TerrainMaterial.Air ||
    adjacent === TerrainMaterial.Water
  );
}

export function buildTerrainChunk(
  columns: readonly TerrainColumn[],
  blockRadius = TERRAIN_BLOCK_RADIUS,
  blockHeight = TERRAIN_BLOCK_HEIGHT,
): TerrainChunkMesh {
  const output: number[] = [];
  const columnMap = new Map<string, TerrainColumn>();
  const biomes = new Set<TerrainBiome>();
  let blockCount = 0;
  let waterBlockCount = 0;
  let caveAirCount = 0;
  let riverColumnCount = 0;
  let mountainColumnCount = 0;
  let exposedFaceCount = 0;
  let visibleColumnCount = 0;

  for (const column of columns) {
    columnMap.set(columnKey(column.q, column.r), column);

    if (column.visible === false) {
      continue;
    }

    visibleColumnCount += 1;
    caveAirCount += column.caveAirCount ?? 0;
    riverColumnCount += column.river ? 1 : 0;
    mountainColumnCount += column.mountain ? 1 : 0;
    if (column.biome) {
      biomes.add(column.biome);
    }
  }

  for (const column of columns) {
    if (column.visible === false) {
      continue;
    }

    const maximumLevel = column.blocks?.length ?? column.height;
    const centerX = SQRT_THREE * (column.q + column.r / 2) * blockRadius;
    const centerZ = 1.5 * column.r * blockRadius;
    const heightVariation =
      0.94 + ((column.q * 17 + column.r * 31) & 3) * 0.025;

    for (let level = 0; level < maximumLevel; level += 1) {
      const material = materialAt(column, level);

      if (material === TerrainMaterial.Air) {
        continue;
      }

      if (material === TerrainMaterial.Water) {
        waterBlockCount += 1;
      } else {
        blockCount += 1;
      }

      const lowerY = TERRAIN_BASE_Y + level * blockHeight;
      const upperY =
        lowerY +
        blockHeight *
          (material === TerrainMaterial.Water ? 0.86 : 1);
      const topCenter: Vec3 = [centerX, upperY, centerZ];
      const bottomCenter: Vec3 = [centerX, lowerY, centerZ];
      const topRing: Vec3[] = [];
      const bottomRing: Vec3[] = [];
      const color =
        material === TerrainMaterial.Water
          ? tint([0.82, 0.94, 1], heightVariation)
          : tint([1, 1, 1], heightVariation);

      for (let side = 0; side < 6; side += 1) {
        const angle = -Math.PI / 6 + side * (Math.PI / 3);
        const x = centerX + Math.cos(angle) * blockRadius;
        const z = centerZ + Math.sin(angle) * blockRadius;
        topRing.push([x, upperY, z]);
        bottomRing.push([x, lowerY, z]);
      }

      const above = materialAt(column, level + 1);
      if (faceIsExposed(material, above)) {
        const texture = textureFor(material, "top", false);
        for (let side = 0; side < 6; side += 1) {
          const next = (side + 1) % 6;
          pushTriangle(
            output,
            topCenter,
            topRing[next]!,
            topRing[side]!,
            [0, 1, 0],
            color,
            atlasUv(texture, 0.5, 0.5),
            atlasUv(
              texture,
              (topRing[next]![0] - centerX) / (2 * blockRadius) + 0.5,
              (topRing[next]![2] - centerZ) / (2 * blockRadius) + 0.5,
            ),
            atlasUv(
              texture,
              (topRing[side]![0] - centerX) / (2 * blockRadius) + 0.5,
              (topRing[side]![2] - centerZ) / (2 * blockRadius) + 0.5,
            ),
          );
        }
        exposedFaceCount += 1;
      }

      const below = materialAt(column, level - 1);
      const renderLegacyBottom = !column.blocks && level === 0;
      if (
        material !== TerrainMaterial.Water &&
        (faceIsExposed(material, below) || renderLegacyBottom) &&
        (level > 0 || renderLegacyBottom)
      ) {
        const caveInterior = level < column.height - 2;
        const texture = textureFor(material, "bottom", caveInterior);
        for (let side = 0; side < 6; side += 1) {
          const next = (side + 1) % 6;
          pushTriangle(
            output,
            bottomCenter,
            bottomRing[side]!,
            bottomRing[next]!,
            [0, -1, 0],
            color,
            atlasUv(texture, 0.5, 0.5),
            atlasUv(texture, 0, 0),
            atlasUv(texture, 1, 1),
          );
        }
        exposedFaceCount += 1;
      }

      for (let side = 0; side < 6; side += 1) {
        const [neighborQ, neighborR] = SIDE_DIRECTIONS[side]!;
        const neighbor = columnMap.get(
          columnKey(column.q + neighborQ, column.r + neighborR),
        );
        const adjacent = materialAt(neighbor, level);

        if (!faceIsExposed(material, adjacent)) {
          continue;
        }

        const next = (side + 1) % 6;
        const angle = side * (Math.PI / 3);
        const normal: Vec3 = [Math.cos(angle), 0, Math.sin(angle)];
        const caveInterior =
          adjacent === TerrainMaterial.Air && level < column.height - 2;
        const texture = textureFor(material, "side", caveInterior);
        const sideColor = tint(color, SIDE_SHADE[side]!);

        pushTriangle(
          output,
          bottomRing[side]!,
          topRing[side]!,
          topRing[next]!,
          normal,
          sideColor,
          atlasUv(texture, 0, 1),
          atlasUv(texture, 0, 0),
          atlasUv(texture, 1, 0),
        );
        pushTriangle(
          output,
          bottomRing[side]!,
          topRing[next]!,
          bottomRing[next]!,
          normal,
          sideColor,
          atlasUv(texture, 0, 1),
          atlasUv(texture, 1, 0),
          atlasUv(texture, 1, 1),
        );
        exposedFaceCount += 1;
      }
    }
  }

  return {
    vertices: new Float32Array(output),
    vertexCount: output.length / FLOATS_PER_VERTEX,
    floatsPerVertex: FLOATS_PER_VERTEX,
    columnCount: visibleColumnCount,
    blockCount,
    waterBlockCount,
    caveAirCount,
    riverColumnCount,
    mountainColumnCount,
    biomeCount: biomes.size,
    exposedFaceCount,
  };
}

export function createTerrainChunk(radius = 5): TerrainChunkMesh {
  return buildTerrainChunk(generateTerrainColumns(radius));
}
