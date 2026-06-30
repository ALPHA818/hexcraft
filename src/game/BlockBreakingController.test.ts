import { describe, expect, it, vi } from "vitest";

import { TerrainMaterial } from "../geometry/terrainChunk.ts";
import { equippedToolForItem } from "../items/ItemRegistry.ts";
import { blockDefinitionFor, type PreferredTool } from "../world/blocks.ts";
import type { VoxelRaycastHit } from "../world/InfiniteTerrain.ts";
import {
  blockBreakProgressPerSecond,
  BlockBreakingController,
} from "./BlockBreakingController.ts";

function target(
  material: TerrainMaterial,
  q = 0,
  r = 0,
  level = 10,
): VoxelRaycastHit {
  return {
    voxel: { q, r, level },
    face: "top",
    adjacent: { q, r, level: level + 1 },
    material,
    block: blockDefinitionFor(material),
    distance: 1,
  };
}

function createController(
  mode: "creative" | "survival",
  tool: PreferredTool = "hand",
  onBlockBroken = vi.fn(),
): BlockBreakingController {
  return new BlockBreakingController({
    mode,
    getEquippedTool: () => tool,
    onBlockBroken,
  });
}

describe("block breaking controller", () => {
  it("breaks dirt faster than stone", () => {
    expect(
      blockBreakProgressPerSecond(TerrainMaterial.Dirt, "hand"),
    ).toBeGreaterThan(
      blockBreakProgressPerSecond(TerrainMaterial.Stone, "hand"),
    );
  });

  it("speeds up blocks with the correct tool", () => {
    expect(
      blockBreakProgressPerSecond(TerrainMaterial.Stone, "pickaxe"),
    ).toBeGreaterThan(
      blockBreakProgressPerSecond(TerrainMaterial.Stone, "shovel"),
    );
    expect(
      blockBreakProgressPerSecond(TerrainMaterial.Dirt, "shovel"),
    ).toBeGreaterThan(
      blockBreakProgressPerSecond(TerrainMaterial.Dirt, "pickaxe"),
    );
  });

  it("uses item tool speed multipliers", () => {
    expect(
      blockBreakProgressPerSecond(
        TerrainMaterial.Stone,
        equippedToolForItem("tool:pickaxe"),
      ),
    ).toBeGreaterThan(
      blockBreakProgressPerSecond(TerrainMaterial.Stone, "pickaxe"),
    );
  });

  it("resets progress when switching target blocks", () => {
    const controller = createController("survival");
    const dirt = target(TerrainMaterial.Dirt, 0);
    const stone = target(TerrainMaterial.Stone, 1);

    controller.start(dirt);
    controller.update(dirt, 0.25);
    expect(controller.progress).toBeGreaterThan(0);

    controller.update(stone, 0);
    expect(controller.progress).toBe(0);
  });

  it("breaks instantly in creative mode", () => {
    const onBlockBroken = vi.fn();
    const controller = createController("creative", "hand", onBlockBroken);
    const stone = target(TerrainMaterial.Stone);

    controller.start(stone);

    expect(onBlockBroken).toHaveBeenCalledOnce();
    expect(onBlockBroken).toHaveBeenCalledWith(stone);
  });

  it("never breaks unbreakable blocks", () => {
    const onBlockBroken = vi.fn();
    const controller = createController("survival", "pickaxe", onBlockBroken);
    const bedrock = target(TerrainMaterial.Bedrock);

    controller.start(bedrock);
    controller.update(bedrock, 999);

    expect(controller.progress).toBe(0);
    expect(onBlockBroken).not.toHaveBeenCalled();
  });
});
