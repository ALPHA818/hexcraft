import { describe, expect, it } from "vitest";

import {
  TERRAIN_BASE_Y,
  TERRAIN_BLOCK_HEIGHT,
  TerrainMaterial,
} from "../geometry/terrainChunk.ts";
import { PLAYER_EYE_HEIGHT } from "../input/FirstPersonCamera.ts";
import { axialToWorld, type VoxelPosition } from "../world/InfiniteTerrain.ts";
import {
  BLOCK_PLACEMENT_REACH,
  type BlockPlacementInput,
  type BlockPlacementWorld,
  validateBlockPlacement,
} from "./BlockPlacementRules.ts";

function playerPositionAt(
  q: number,
  r: number,
  feetLevel: number,
): readonly [number, number, number] {
  const world = axialToWorld(q, r);

  return [
    world.x,
    TERRAIN_BASE_Y +
      feetLevel * TERRAIN_BLOCK_HEIGHT +
      PLAYER_EYE_HEIGHT +
      0.01,
    world.z,
  ];
}

function target(
  adjacent: VoxelPosition | null,
  distance = 3,
): BlockPlacementInput["target"] {
  return {
    adjacent,
    distance,
  };
}

function world(
  material: TerrainMaterial = TerrainMaterial.Air,
  loaded = true,
): BlockPlacementWorld {
  return {
    materialAt: () => material,
    isColumnLoaded: () => loaded,
  };
}

function baseInput(
  overrides: Partial<BlockPlacementInput> = {},
): BlockPlacementInput {
  return {
    target: target({ q: 1, r: 0, level: 1 }),
    selectedItemId: "block:dirt",
    selectedMaterial: TerrainMaterial.Dirt,
    playerPosition: playerPositionAt(8, 0, 1),
    world: world(),
    mode: "survival",
    inventoryCount: 1,
    ...overrides,
  };
}

describe("block placement rules", () => {
  it("cannot place inside player", () => {
    const result = validateBlockPlacement(
      baseInput({
        target: target({ q: 0, r: 0, level: 1 }),
        playerPosition: playerPositionAt(0, 0, 1),
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "inside_player",
    });
  });

  it("cannot place air", () => {
    const result = validateBlockPlacement(
      baseInput({
        selectedItemId: null,
        selectedMaterial: TerrainMaterial.Air,
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "air",
    });
  });

  it("cannot place tools", () => {
    const result = validateBlockPlacement(
      baseInput({
        selectedItemId: "tool:pickaxe",
        selectedMaterial: undefined,
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "non_placeable_item",
    });
  });

  it("cannot place without inventory in survival", () => {
    const result = validateBlockPlacement(
      baseInput({
        mode: "survival",
        inventoryCount: 0,
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "missing_inventory",
    });
  });

  it("allows creative to place without inventory", () => {
    const result = validateBlockPlacement(
      baseInput({
        mode: "creative",
        inventoryCount: 0,
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      consumeItem: false,
      material: TerrainMaterial.Dirt,
    });
  });

  it("can place on a side face", () => {
    const result = validateBlockPlacement(
      baseInput({
        target: target({ q: 1, r: 0, level: 1 }),
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      consumeItem: true,
      position: { q: 1, r: 0, level: 1 },
    });
  });

  it("can place on a top face", () => {
    const result = validateBlockPlacement(
      baseInput({
        target: target({ q: 0, r: 0, level: 2 }),
        playerPosition: playerPositionAt(8, 0, 1),
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      position: { q: 0, r: 0, level: 2 },
    });
  });

  it("requires a valid adjacent raycast cell", () => {
    const result = validateBlockPlacement(
      baseInput({
        target: target(null),
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "missing_target",
    });
  });

  it("requires placement to be within reach", () => {
    const result = validateBlockPlacement(
      baseInput({
        target: target({ q: 1, r: 0, level: 1 }, BLOCK_PLACEMENT_REACH + 0.1),
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "out_of_reach",
    });
  });

  it("cannot replace solid blocks", () => {
    const result = validateBlockPlacement(
      baseInput({
        world: world(TerrainMaterial.Stone),
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "occupied",
    });
  });

  it("cannot place into unloaded chunks", () => {
    const result = validateBlockPlacement(
      baseInput({
        world: world(TerrainMaterial.Air, false),
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "unloaded",
    });
  });
});
