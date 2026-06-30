import { FLOATS_PER_VERTEX, type MeshData } from "./hexPrism.ts";
import { atlasUv, BlockTexture } from "../render/blockTextureAtlas.ts";
import {
  isBlockCollisionSolid,
  isBlockFluid,
  isBlockOpaque,
  isBlockRaycastTarget,
} from "../world/blocks.ts";
import { localTerrainLightMultiplier } from "../world/Lighting.ts";
import {
  axialDistance,
  HORIZONTAL_HEX_DIRECTIONS,
} from "../world/voxelRules.ts";

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
  Bedrock = 12,
  CoalOre = 13,
  IronOre = 14,
  CopperOre = 15,
  Cactus = 16,
  Flower = 17,
  Mushroom = 18,
  DeepStone = 19,
  GoldOre = 20,
  CrystalOre = 21,
  Torch = 22,
}

export function isFluidMaterial(material: TerrainMaterial): boolean {
  return isBlockFluid(material);
}

export function isCollisionSolidMaterial(material: TerrainMaterial): boolean {
  return isBlockCollisionSolid(material);
}

export function isRaycastTargetMaterial(material: TerrainMaterial): boolean {
  return isBlockRaycastTarget(material);
}

export function isTransparentMaterial(material: TerrainMaterial): boolean {
  return !isBlockOpaque(material);
}

export type TerrainBiome =
  | "grassland"
  | "forest"
  | "desert"
  | "tundra"
  | "alpine"
  | "snow"
  | "beach"
  | "swamp"
  | "badlands";

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
  minimumMeshLevel?: number;
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
    emittedBlockCount: number;
    emittedFaceCount: number;
    emittedTriangleCount: number;
    exposedFaceCount: number;
  }>;

const SQRT_THREE = Math.sqrt(3);
export const TERRAIN_BLOCK_RADIUS = 1;
export const TERRAIN_BLOCK_HEIGHT = 0.72;
export const TERRAIN_DEPTH_BLOCKS = 500;
export const TERRAIN_BASE_Y =
  -5.76 - TERRAIN_DEPTH_BLOCKS * TERRAIN_BLOCK_HEIGHT;
const SIDE_SHADE = [1, 0.97, 0.94, 0.91, 0.93, 0.96] as const;
const TOP_BEVEL_RADIUS_SCALE = 0.985;
const TOP_BEVEL_HEIGHT_SCALE = 0.025;

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
  const distance = axialDistance({ q: 0, r: 0 }, { q, r });
  const broadHill =
    Math.sin(q * 0.82 + r * 0.31) * 0.72 + Math.cos(r * 1.17 - q * 0.24) * 0.55;
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

function materialAt(
  column: TerrainColumn | undefined,
  level: number,
): TerrainMaterial {
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
  if (caveInterior && material === TerrainMaterial.Stone) {
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
    case TerrainMaterial.DeepStone:
      return BlockTexture.DeepStone;
    case TerrainMaterial.CoalOre:
      return BlockTexture.CoalOre;
    case TerrainMaterial.IronOre:
      return BlockTexture.IronOre;
    case TerrainMaterial.CopperOre:
      return BlockTexture.CopperOre;
    case TerrainMaterial.GoldOre:
      return BlockTexture.GoldOre;
    case TerrainMaterial.CrystalOre:
      return BlockTexture.CrystalOre;
    case TerrainMaterial.Torch:
      return BlockTexture.Torch;
    case TerrainMaterial.Cactus:
      return BlockTexture.Cactus;
    case TerrainMaterial.Flower:
      return BlockTexture.Flower;
    case TerrainMaterial.Mushroom:
      return BlockTexture.Mushroom;
    case TerrainMaterial.Bedrock:
      return BlockTexture.Stone;
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
  if (material === TerrainMaterial.Air) {
    return false;
  }

  if (adjacent === TerrainMaterial.Air) {
    return true;
  }

  if (material === TerrainMaterial.Water) {
    return adjacent === TerrainMaterial.Leaves;
  }

  if (material === TerrainMaterial.Leaves) {
    return adjacent === TerrainMaterial.Water;
  }

  return (
    adjacent === TerrainMaterial.Water || adjacent === TerrainMaterial.Leaves
  );
}

export function buildTerrainChunk(
  columns: readonly TerrainColumn[],
  blockRadius = TERRAIN_BLOCK_RADIUS,
  blockHeight = TERRAIN_BLOCK_HEIGHT,
): TerrainChunkMesh {
  const opaqueOutput: number[] = [];
  const translucentOutput: number[] = [];
  const columnMap = new Map<string, TerrainColumn>();
  const biomes = new Set<TerrainBiome>();
  let blockCount = 0;
  let waterBlockCount = 0;
  let caveAirCount = 0;
  let riverColumnCount = 0;
  let mountainColumnCount = 0;
  let emittedBlockCount = 0;
  let emittedFaceCount = 0;
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
      0.97 + ((column.q * 17 + column.r * 31) & 3) * 0.012;

    const minimumLevel = Math.max(
      0,
      Math.min(maximumLevel, column.minimumMeshLevel ?? 0),
    );

    for (let level = minimumLevel; level < maximumLevel; level += 1) {
      const material = materialAt(column, level);

      if (material === TerrainMaterial.Air) {
        continue;
      }

      const output =
        material === TerrainMaterial.Water ? translucentOutput : opaqueOutput;

      const above = materialAt(column, level + 1);
      const topExposed = faceIsExposed(material, above);
      const below = materialAt(column, level - 1);
      const renderLegacyBottom = !column.blocks && level === 0;
      const bottomExposed =
        (faceIsExposed(material, below) || renderLegacyBottom) &&
        (level > 0 || renderLegacyBottom);
      const sideAdjacent = HORIZONTAL_HEX_DIRECTIONS.map((direction) =>
        materialAt(
          columnMap.get(
            columnKey(column.q + direction.q, column.r + direction.r),
          ),
          level,
        ),
      );
      const hasExposedSide = sideAdjacent.some((adjacent) =>
        faceIsExposed(material, adjacent),
      );

      if (!topExposed && !bottomExposed && !hasExposedSide) {
        continue;
      }

      emittedBlockCount += 1;
      if (material === TerrainMaterial.Water) {
        waterBlockCount += 1;
      } else {
        blockCount += 1;
      }

      const lowerY = TERRAIN_BASE_Y + level * blockHeight;
      const upperY =
        lowerY + blockHeight * (material === TerrainMaterial.Water ? 0.86 : 1);
      const beveledTop =
        Boolean(column.blocks) &&
        topExposed &&
        material !== TerrainMaterial.Water;
      const sideUpperY = beveledTop
        ? upperY - blockHeight * TOP_BEVEL_HEIGHT_SCALE
        : upperY;
      const topRadius = beveledTop
        ? blockRadius * TOP_BEVEL_RADIUS_SCALE
        : blockRadius;
      const topCenter: Vec3 = [centerX, upperY, centerZ];
      const bottomCenter: Vec3 = [centerX, lowerY, centerZ];
      const topRing: Vec3[] = [];
      const sideTopRing: Vec3[] = [];
      const bottomRing: Vec3[] = [];
      const localLight = localTerrainLightMultiplier({
        material,
        level,
        surfaceLevel: Math.max(0, column.height - 1),
        hasSkyExposure: topExposed && level >= column.height - 2,
      });
      const color =
        material === TerrainMaterial.Water
          ? tint([0.82, 0.94, 1], heightVariation * Math.max(0.68, localLight))
          : tint([1, 1, 1], heightVariation * localLight);

      for (let side = 0; side < 6; side += 1) {
        const angle = -Math.PI / 6 + side * (Math.PI / 3);
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        topRing.push([
          centerX + cosine * topRadius,
          upperY,
          centerZ + sine * topRadius,
        ]);
        sideTopRing.push([
          centerX + cosine * blockRadius,
          sideUpperY,
          centerZ + sine * blockRadius,
        ]);
        bottomRing.push([
          centerX + cosine * blockRadius,
          lowerY,
          centerZ + sine * blockRadius,
        ]);
      }

      if (topExposed) {
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

          if (beveledTop) {
            const angle = side * (Math.PI / 3);
            const normalScale = 1 / Math.hypot(0.2, 0.98);
            const bevelNormal: Vec3 = [
              Math.cos(angle) * 0.2 * normalScale,
              0.98 * normalScale,
              Math.sin(angle) * 0.2 * normalScale,
            ];
            const topCurrentUv = atlasUv(
              texture,
              (topRing[side]![0] - centerX) / (2 * blockRadius) + 0.5,
              (topRing[side]![2] - centerZ) / (2 * blockRadius) + 0.5,
            );
            const topNextUv = atlasUv(
              texture,
              (topRing[next]![0] - centerX) / (2 * blockRadius) + 0.5,
              (topRing[next]![2] - centerZ) / (2 * blockRadius) + 0.5,
            );
            const sideCurrentUv = atlasUv(
              texture,
              (sideTopRing[side]![0] - centerX) / (2 * blockRadius) + 0.5,
              (sideTopRing[side]![2] - centerZ) / (2 * blockRadius) + 0.5,
            );
            const sideNextUv = atlasUv(
              texture,
              (sideTopRing[next]![0] - centerX) / (2 * blockRadius) + 0.5,
              (sideTopRing[next]![2] - centerZ) / (2 * blockRadius) + 0.5,
            );

            pushTriangle(
              output,
              sideTopRing[side]!,
              topRing[side]!,
              topRing[next]!,
              bevelNormal,
              color,
              sideCurrentUv,
              topCurrentUv,
              topNextUv,
            );
            pushTriangle(
              output,
              sideTopRing[side]!,
              topRing[next]!,
              sideTopRing[next]!,
              bevelNormal,
              color,
              sideCurrentUv,
              topNextUv,
              sideNextUv,
            );
          }
        }
        emittedFaceCount += 1;
      }

      if (bottomExposed) {
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
        emittedFaceCount += 1;
      }

      for (let side = 0; side < 6; side += 1) {
        const adjacent = sideAdjacent[side]!;

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
          sideTopRing[side]!,
          sideTopRing[next]!,
          normal,
          sideColor,
          atlasUv(texture, 0, 1),
          atlasUv(texture, 0, 0),
          atlasUv(texture, 1, 0),
        );
        pushTriangle(
          output,
          bottomRing[side]!,
          sideTopRing[next]!,
          bottomRing[next]!,
          normal,
          sideColor,
          atlasUv(texture, 0, 1),
          atlasUv(texture, 1, 0),
          atlasUv(texture, 1, 1),
        );
        emittedFaceCount += 1;
      }
    }
  }

  const opaqueVertexCount = opaqueOutput.length / FLOATS_PER_VERTEX;
  const translucentVertexCount = translucentOutput.length / FLOATS_PER_VERTEX;
  const emittedTriangleCount = (opaqueVertexCount + translucentVertexCount) / 3;
  const vertices = new Float32Array(
    opaqueOutput.length + translucentOutput.length,
  );
  vertices.set(opaqueOutput);
  vertices.set(translucentOutput, opaqueOutput.length);

  return {
    vertices,
    vertexCount: opaqueVertexCount + translucentVertexCount,
    floatsPerVertex: FLOATS_PER_VERTEX,
    opaqueVertexCount,
    translucentVertexCount,
    columnCount: visibleColumnCount,
    blockCount,
    waterBlockCount,
    caveAirCount,
    riverColumnCount,
    mountainColumnCount,
    biomeCount: biomes.size,
    emittedBlockCount,
    emittedFaceCount,
    emittedTriangleCount,
    exposedFaceCount: emittedFaceCount,
  };
}

export function createTerrainChunk(radius = 5): TerrainChunkMesh {
  return buildTerrainChunk(generateTerrainColumns(radius));
}
