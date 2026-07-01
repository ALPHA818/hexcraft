import { describe, expect, it } from "vitest";

import {
  axialToWorld,
  biomeAt,
  buildTerrainStream,
  caveAt,
  chunkAtAxial,
  generateTerrainColumn,
  generateStreamedColumns,
  InfiniteTerrain,
  terrainHeightAt,
  treeHeightAt,
  worldToAxial,
} from "./InfiniteTerrain.ts";
import {
  TERRAIN_BASE_Y,
  TERRAIN_BLOCK_HEIGHT,
  TERRAIN_DEPTH_BLOCKS,
  TerrainMaterial,
} from "../geometry/terrainChunk.ts";

const TEST_LEVEL = TERRAIN_DEPTH_BLOCKS + 30;
const WATER_TEST_STEP_SECONDS = 0.1;

describe("infinite terrain", () => {
  it("round-trips positive and negative axial coordinates", () => {
    for (const [q, r] of [
      [0, 0],
      [9, -4],
      [-17, 12],
    ] as const) {
      const world = axialToWorld(q, r);
      expect(worldToAxial(world.x, world.z)).toEqual({ q, r });
    }
  });

  it("maps negative coordinates into stable chunks", () => {
    expect(chunkAtAxial(7, 8, 8)).toEqual({ q: 0, r: 1 });
    expect(chunkAtAxial(-1, -8, 8)).toEqual({ q: -1, r: -1 });
    expect(chunkAtAxial(-9, -9, 8)).toEqual({ q: -2, r: -2 });
  });

  it("reproduces heights from the same seed at any coordinate", () => {
    const coordinates = [
      [-1284, 932],
      [0, 0],
      [417, -91],
      [-32, -64],
    ] as const;
    const first = coordinates.map(([q, r]) => terrainHeightAt(q, r, 42));
    const repeated = coordinates.map(([q, r]) => terrainHeightAt(q, r, 42));
    const differentSeed = coordinates.map(([q, r]) =>
      terrainHeightAt(q, r, 43),
    );

    expect(repeated).toEqual(first);
    expect(differentSeed).not.toEqual(first);
  });

  it("provides five hundred mineable blocks below the original world base", () => {
    const column = generateTerrainColumn(0, 0, 42);
    const mineableUndergroundMaterials = new Set([
      TerrainMaterial.Stone,
      TerrainMaterial.DeepStone,
      TerrainMaterial.CoalOre,
      TerrainMaterial.CopperOre,
      TerrainMaterial.IronOre,
      TerrainMaterial.GoldOre,
      TerrainMaterial.CrystalOre,
    ]);

    expect(column.height).toBeGreaterThan(TERRAIN_DEPTH_BLOCKS);
    expect(mineableUndergroundMaterials.has(column.blocks?.[0] ?? 0)).toBe(
      true,
    );
    expect(
      mineableUndergroundMaterials.has(
        column.blocks?.[TERRAIN_DEPTH_BLOCKS - 1] ?? 0,
      ),
    ).toBe(true);
    expect(
      TERRAIN_BASE_Y + TERRAIN_DEPTH_BLOCKS * TERRAIN_BLOCK_HEIGHT,
    ).toBeCloseTo(-5.76);
  });

  it("selects biomes and carves deterministic cave cells", () => {
    const biomes = new Set<string>();
    let caveCells = 0;

    for (let q = -40; q <= 40; q += 4) {
      for (let r = -40; r <= 40; r += 4) {
        const height = terrainHeightAt(q, r, 42);
        biomes.add(biomeAt(q, r, 42));
        for (let level = 2; level < height - 1; level += 1) {
          caveCells += caveAt(q, r, level, height, 42) ? 1 : 0;
        }
      }
    }

    expect(biomes.size).toBeGreaterThanOrEqual(3);
    expect(caveCells).toBeGreaterThan(0);
  });

  it("creates river water, mountain columns, and cave air", () => {
    const columns = generateStreamedColumns({ q: 0, r: 0 }, 8, 4);
    const visible = columns.filter((column) => column.visible !== false);

    expect(visible.some((column) => column.river)).toBe(true);
    expect(visible.some((column) => column.mountain)).toBe(true);
    expect(visible.some((column) => (column.caveAirCount ?? 0) > 0)).toBe(true);
    expect(
      buildTerrainStream({ q: 0, r: 0 }, 8, 4).update.mesh
        .translucentVertexCount,
    ).toBeGreaterThan(0);
    expect(generateTerrainColumn(0, 0).blocks?.length).toBeGreaterThan(0);
  });

  it("applies edits while building a streamed terrain window", () => {
    const result = buildTerrainStream({ q: 0, r: 0 }, 2, 0, 42, [
      [0, 0, 30, TerrainMaterial.Planks],
    ]);
    const edited = result.columns.find(
      (column) => column.q === 0 && column.r === 0,
    );

    expect(edited?.blocks?.[30]).toBe(TerrainMaterial.Planks);
    expect(result.update.loadedChunkCount).toBe(1);
  });

  it("opens some cave systems to daylight", () => {
    const columns = generateStreamedColumns({ q: 0, r: 0 }, 8, 4);
    const entrances = columns.filter((column) => {
      const topLevel = column.height - 1;
      return column.blocks?.[topLevel] === 0 && (column.caveAirCount ?? 0) > 1;
    });

    expect(entrances.length).toBeGreaterThan(0);
  });

  it("grows deterministic wood trunks and leaf canopies", () => {
    let treeColumn: ReturnType<typeof generateTerrainColumn> | null = null;

    for (let q = -30; q <= 30 && !treeColumn; q += 1) {
      for (let r = -30; r <= 30; r += 1) {
        if (treeHeightAt(q, r, 42) > 0) {
          treeColumn = generateTerrainColumn(q, r, 42);
          break;
        }
      }
    }

    expect(treeColumn).not.toBeNull();
    expect(treeColumn?.blocks?.includes(TerrainMaterial.Wood)).toBe(true);
    expect(treeColumn?.blocks?.includes(TerrainMaterial.Leaves)).toBe(true);
  });

  it("keeps mined and placed blocks after streaming away and back", () => {
    const terrain = new InfiniteTerrain(42, 4, 1);
    terrain.update({ x: 0, z: 0 });
    terrain.setBlock({ q: 0, r: 0, level: TEST_LEVEL }, TerrainMaterial.Planks);

    terrain.update(axialToWorld(40, 0));
    terrain.update({ x: 0, z: 0 });

    expect(terrain.materialAt(0, 0, TEST_LEVEL)).toBe(TerrainMaterial.Planks);
  });

  it("stores dynamic material metadata for placed dynamic blocks", () => {
    const terrain = new InfiniteTerrain(42, 4, 1);
    const position = { q: 0, r: 0, level: TEST_LEVEL };

    terrain.update({ x: 0, z: 0 });
    terrain.setBlock(
      position,
      TerrainMaterial.DynamicMaterial,
      "generated:test-material",
    );

    expect(terrain.materialAt(0, 0, TEST_LEVEL)).toBe(
      TerrainMaterial.DynamicMaterial,
    );
    expect(terrain.dynamicMaterialIdAt(position)).toBe(
      "generated:test-material",
    );

    terrain.setBlock(position, TerrainMaterial.Air);

    expect(terrain.dynamicMaterialIdAt(position)).toBeNull();
  });

  it("preserves dynamic material metadata through terrain edit chunks", () => {
    const source = new InfiniteTerrain(42, 4, 1);
    const target = new InfiniteTerrain(42, 4, 1);
    const position = { q: 0, r: 0, level: TEST_LEVEL };

    source.update({ x: 0, z: 0 });
    source.setBlock(
      position,
      TerrainMaterial.DynamicMaterial,
      "generated:persisted",
    );
    target.importTerrainEditChunks(source.exportTerrainEditChunks());

    expect(target.materialAt(0, 0, TEST_LEVEL)).toBe(
      TerrainMaterial.DynamicMaterial,
    );
    expect(target.dynamicMaterialIdAt(position)).toBe("generated:persisted");
  });

  it("handles unknown dynamic material metadata safely", () => {
    const terrain = new InfiniteTerrain(42, 4, 1);
    const position = { q: 0, r: 0, level: TEST_LEVEL };

    terrain.importTerrainEdits([
      [0, 0, TEST_LEVEL, TerrainMaterial.DynamicMaterial, "missing:material"],
    ]);

    expect(terrain.materialAt(0, 0, TEST_LEVEL)).toBe(
      TerrainMaterial.DynamicMaterial,
    );
    expect(terrain.dynamicMaterialIdAt(position)).toBe("missing:material");
  });

  it("raycasts a terrain block and returns the adjacent placement cell", () => {
    const terrain = new InfiniteTerrain(42, 4, 1);
    terrain.update({ x: 0, z: 0 });
    const column = generateTerrainColumn(0, 0, 42);
    const highest = column.blocks!.findLastIndex(
      (material) =>
        material !== TerrainMaterial.Air && material !== TerrainMaterial.Water,
    );
    const originY = TERRAIN_BASE_Y + (highest + 4) * TERRAIN_BLOCK_HEIGHT;
    const hit = terrain.raycast([0, originY, 0], [0, -1, 0], 8);

    expect(hit?.voxel).toEqual({ q: 0, r: 0, level: highest });
    expect(hit?.adjacent?.level).toBe(highest + 1);
  });

  it("keeps leaves solid but lets unsupported leaves decay", () => {
    const terrain = new InfiniteTerrain(42, 2, 0);
    terrain.update({ x: 0, z: 0 });

    terrain.setBlock({ q: 0, r: 0, level: TEST_LEVEL }, TerrainMaterial.Wood);
    terrain.setBlock({ q: 1, r: 0, level: TEST_LEVEL }, TerrainMaterial.Leaves);

    expect(terrain.isSolidAt(1, 0, TEST_LEVEL)).toBe(true);

    terrain.setBlock({ q: 0, r: 0, level: TEST_LEVEL }, TerrainMaterial.Air);

    expect(terrain.materialAt(1, 0, TEST_LEVEL)).toBe(TerrainMaterial.Air);
  });

  it("animates local water flow into nearby mined air", async () => {
    const terrain = new InfiniteTerrain(42, 2, 0);
    terrain.update({ x: 0, z: 0 });

    terrain.setBlock(
      { q: 0, r: 0, level: TEST_LEVEL - 1 },
      TerrainMaterial.Stone,
    );
    terrain.setBlock(
      { q: 1, r: 0, level: TEST_LEVEL - 1 },
      TerrainMaterial.Stone,
    );
    terrain.setBlock({ q: 0, r: 0, level: TEST_LEVEL }, TerrainMaterial.Water);
    terrain.setBlock({ q: 1, r: 0, level: TEST_LEVEL }, TerrainMaterial.Air);

    expect(terrain.materialAt(1, 0, TEST_LEVEL)).toBe(TerrainMaterial.Air);
    await terrain.advanceWaterFlow(WATER_TEST_STEP_SECONDS);

    expect(terrain.isSolidAt(1, 0, TEST_LEVEL)).toBe(false);
    expect(terrain.isFluidAt(1, 0, TEST_LEVEL)).toBe(true);
  });

  it("advances horizontal water one visible wave at a time", async () => {
    const terrain = new InfiniteTerrain(42, 2, 0);
    terrain.update({ x: 0, z: 0 });

    terrain.setBlock(
      { q: 0, r: 0, level: TEST_LEVEL - 1 },
      TerrainMaterial.Stone,
    );
    terrain.setBlock(
      { q: 1, r: 0, level: TEST_LEVEL - 1 },
      TerrainMaterial.Stone,
    );
    terrain.setBlock(
      { q: 2, r: 0, level: TEST_LEVEL - 1 },
      TerrainMaterial.Stone,
    );
    terrain.setBlock({ q: 0, r: 0, level: TEST_LEVEL }, TerrainMaterial.Water);
    terrain.setBlock({ q: 1, r: 0, level: TEST_LEVEL }, TerrainMaterial.Air);
    await terrain.advanceWaterFlow(WATER_TEST_STEP_SECONDS);

    expect(terrain.materialAt(1, 0, TEST_LEVEL)).toBe(TerrainMaterial.Water);
    expect(terrain.materialAt(2, 0, TEST_LEVEL)).toBe(TerrainMaterial.Air);
  });

  it("limits horizontal water flow to three hexes from its source", async () => {
    const terrain = new InfiniteTerrain(42, 2, 0);
    terrain.update({ x: 0, z: 0 });

    for (let q = 0; q <= 5; q += 1) {
      terrain.setBlock(
        { q, r: 0, level: TEST_LEVEL - 1 },
        TerrainMaterial.Stone,
      );
    }
    for (let q = 1; q <= 5; q += 1) {
      terrain.setBlock({ q, r: 0, level: TEST_LEVEL }, TerrainMaterial.Air);
    }
    terrain.setBlock({ q: 0, r: 0, level: TEST_LEVEL }, TerrainMaterial.Water);
    terrain.setBlock({ q: 1, r: 0, level: TEST_LEVEL }, TerrainMaterial.Air);

    for (let step = 0; step < 40; step += 1) {
      await terrain.advanceWaterFlow(1);
    }

    expect(terrain.materialAt(1, 0, TEST_LEVEL)).toBe(TerrainMaterial.Water);
    expect(terrain.materialAt(2, 0, TEST_LEVEL)).toBe(TerrainMaterial.Water);
    expect(terrain.materialAt(3, 0, TEST_LEVEL)).toBe(TerrainMaterial.Water);
    expect(terrain.materialAt(4, 0, TEST_LEVEL)).toBe(TerrainMaterial.Air);
    expect(terrain.materialAt(5, 0, TEST_LEVEL)).toBe(TerrainMaterial.Air);
  });

  it("animates water down a mined shaft without spreading sideways", async () => {
    const terrain = new InfiniteTerrain(42, 2, 0);
    terrain.update({ x: 0, z: 0 });

    terrain.setBlock(
      { q: 0, r: 0, level: TEST_LEVEL - 3 },
      TerrainMaterial.Stone,
    );
    terrain.setBlock(
      { q: 0, r: 0, level: TEST_LEVEL - 2 },
      TerrainMaterial.Air,
    );
    terrain.setBlock(
      { q: 0, r: 0, level: TEST_LEVEL - 1 },
      TerrainMaterial.Air,
    );
    terrain.setBlock(
      { q: 0, r: 0, level: TEST_LEVEL + 1 },
      TerrainMaterial.Water,
    );
    terrain.setBlock({ q: 0, r: 0, level: TEST_LEVEL }, TerrainMaterial.Air);

    expect(terrain.materialAt(0, 0, TEST_LEVEL)).toBe(TerrainMaterial.Air);
    await terrain.advanceWaterFlow(WATER_TEST_STEP_SECONDS);
    expect(terrain.materialAt(0, 0, TEST_LEVEL)).toBe(TerrainMaterial.Water);
    expect(terrain.materialAt(0, 0, TEST_LEVEL - 1)).toBe(TerrainMaterial.Air);
    await terrain.advanceWaterFlow(WATER_TEST_STEP_SECONDS);
    expect(terrain.materialAt(0, 0, TEST_LEVEL - 1)).toBe(
      TerrainMaterial.Water,
    );
    expect(terrain.materialAt(0, 0, TEST_LEVEL - 2)).toBe(TerrainMaterial.Air);
    await terrain.advanceWaterFlow(WATER_TEST_STEP_SECONDS);
    expect(terrain.materialAt(0, 0, TEST_LEVEL - 2)).toBe(
      TerrainMaterial.Water,
    );
    expect(terrain.materialAt(0, 0, TEST_LEVEL - 3)).toBe(
      TerrainMaterial.Stone,
    );
    expect(terrain.materialAt(1, 0, TEST_LEVEL - 1)).not.toBe(
      TerrainMaterial.Water,
    );
  });

  it("adds an invisible neighbor ring around the streamed window", () => {
    const columns = generateStreamedColumns({ q: 0, r: 0 }, 2, 1, 42);
    const visible = columns.filter((column) => column.visible !== false);

    expect(visible).toHaveLength(36);
    expect(columns).toHaveLength(64);
  });

  it("rebuilds only after the camera enters another chunk", () => {
    const terrain = new InfiniteTerrain(42, 2, 0);

    expect(terrain.update({ x: 0, z: 0 })).not.toBeNull();
    expect(terrain.update({ x: 1, z: 0 })).toBeNull();
    expect(terrain.update(axialToWorld(2, 0))).not.toBeNull();
  });
});
