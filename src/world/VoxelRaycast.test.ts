import { describe, expect, it } from "vitest";

import {
  TERRAIN_BASE_Y,
  TERRAIN_BLOCK_HEIGHT,
  TERRAIN_DEPTH_BLOCKS,
  TerrainMaterial,
} from "../geometry/terrainChunk.ts";
import { InfiniteTerrain, type VoxelRaycastHit } from "./InfiniteTerrain.ts";

const RAYCAST_LEVEL = TERRAIN_DEPTH_BLOCKS + 80;

function createTerrain(): InfiniteTerrain {
  const terrain = new InfiniteTerrain(42, 4, 1);
  terrain.update({ x: 0, z: 0 });
  return terrain;
}

function levelCenterY(level = RAYCAST_LEVEL): number {
  return TERRAIN_BASE_Y + (level + 0.5) * TERRAIN_BLOCK_HEIGHT;
}

function levelTopY(level = RAYCAST_LEVEL): number {
  return TERRAIN_BASE_Y + (level + 1) * TERRAIN_BLOCK_HEIGHT;
}

function levelBottomY(level = RAYCAST_LEVEL): number {
  return TERRAIN_BASE_Y + level * TERRAIN_BLOCK_HEIGHT;
}

describe("voxel raycasting", () => {
  it("hits the nearest block", () => {
    const terrain = createTerrain();
    terrain.setBlock(
      { q: 0, r: 0, level: RAYCAST_LEVEL },
      TerrainMaterial.Stone,
    );
    terrain.setBlock(
      { q: 1, r: 0, level: RAYCAST_LEVEL },
      TerrainMaterial.Dirt,
    );

    const hit = terrain.raycast([4, levelCenterY(), 0], [-1, 0, 0], 8);

    expect(hit?.voxel).toEqual({ q: 1, r: 0, level: RAYCAST_LEVEL });
    expect(hit?.material).toBe(TerrainMaterial.Dirt);
  });

  it("returns the correct adjacent voxel for side faces", () => {
    const terrain = createTerrain();
    terrain.setBlock(
      { q: 0, r: 0, level: RAYCAST_LEVEL },
      TerrainMaterial.Stone,
    );

    const hit = terrain.raycast([3, levelCenterY(), 0], [-1, 0, 0], 6);

    expect(hit?.face).toBe(0);
    expect(hit?.adjacent).toEqual({ q: 1, r: 0, level: RAYCAST_LEVEL });
    expect(hit?.block.displayName).toBe("Stone");
  });

  it("respects max reach", () => {
    const terrain = createTerrain();
    terrain.setBlock(
      { q: 0, r: 0, level: RAYCAST_LEVEL },
      TerrainMaterial.Stone,
    );

    expect(terrain.raycast([8, levelCenterY(), 0], [-1, 0, 0], 3)).toBeNull();
  });

  it("ignores air", () => {
    const terrain = createTerrain();

    expect(terrain.raycast([3, levelCenterY(), 0], [-1, 0, 0], 6)).toBeNull();
  });

  it("handles top-face vertical hits", () => {
    const terrain = createTerrain();
    terrain.setBlock(
      { q: 0, r: 0, level: RAYCAST_LEVEL },
      TerrainMaterial.Stone,
    );

    const hit = terrain.raycast([0, levelTopY() + 2, 0], [0, -1, 0], 4);

    expect(hit?.face).toBe("top");
    expect(hit?.adjacent).toEqual({ q: 0, r: 0, level: RAYCAST_LEVEL + 1 });
  });

  it("handles bottom-face vertical hits", () => {
    const terrain = createTerrain();
    terrain.setBlock(
      { q: 0, r: 0, level: RAYCAST_LEVEL },
      TerrainMaterial.Stone,
    );

    const hit = terrain.raycast([0, levelBottomY() - 2, 0], [0, 1, 0], 4);

    expect(hit?.face).toBe("bottom");
    expect(hit?.adjacent).toEqual({ q: 0, r: 0, level: RAYCAST_LEVEL - 1 });
  });

  it("can include water when fluid targeting is requested", () => {
    const terrain = createTerrain();
    terrain.setBlock(
      { q: 0, r: 0, level: RAYCAST_LEVEL },
      TerrainMaterial.Water,
    );

    const defaultHit = terrain.raycast([3, levelCenterY(), 0], [-1, 0, 0], 6);
    const waterHit: VoxelRaycastHit | null = terrain.raycast(
      [3, levelCenterY(), 0],
      [-1, 0, 0],
      { maximumDistance: 6, includeFluids: true },
    );

    expect(defaultHit).toBeNull();
    expect(waterHit?.material).toBe(TerrainMaterial.Water);
    expect(waterHit?.block.fluid).toBe(true);
  });
});
