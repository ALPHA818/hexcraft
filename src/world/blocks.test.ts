import { describe, expect, it } from "vitest";

import { TerrainMaterial } from "../geometry/terrainChunk.ts";
import {
  BLOCK_DEFINITIONS,
  blockDefinitionFor,
  minedDrop,
  minedDrops,
} from "./blocks.ts";

describe("block registry", () => {
  it("marks air as non-solid and not placeable by default", () => {
    const air = blockDefinitionFor(TerrainMaterial.Air);

    expect(air.solid).toBe(false);
    expect(air.placeable).toBe(false);
  });

  it("marks water as fluid and not opaque", () => {
    const water = blockDefinitionFor(TerrainMaterial.Water);

    expect(water.fluid).toBe(true);
    expect(water.opaque).toBe(false);
  });

  it("marks stone as solid and opaque", () => {
    const stone = blockDefinitionFor(TerrainMaterial.Stone);

    expect(stone.solid).toBe(true);
    expect(stone.opaque).toBe(true);
  });

  it("marks bedrock as unbreakable", () => {
    const bedrock = blockDefinitionFor(TerrainMaterial.Bedrock);

    expect(bedrock.solid).toBe(true);
    expect(bedrock.breakable).toBe(false);
    expect(minedDrop(TerrainMaterial.Bedrock)).toBeNull();
  });

  it("marks leaves as not fully opaque", () => {
    expect(blockDefinitionFor(TerrainMaterial.Leaves).opaque).toBe(false);
  });

  it("registers emissive placeholder blocks", () => {
    const torch = blockDefinitionFor(TerrainMaterial.Torch);

    expect(torch.displayName).toBe("Torch");
    expect(torch.placeable).toBe(true);
    expect(torch.opaque).toBe(false);
    expect(torch.lightEmission).toBeGreaterThan(0);
    expect(blockDefinitionFor(TerrainMaterial.Air).lightEmission ?? 0).toBe(0);
  });

  it("registers a generic dynamic material block", () => {
    const dynamicMaterial = blockDefinitionFor(TerrainMaterial.DynamicMaterial);

    expect(dynamicMaterial).toMatchObject({
      id: "dynamic_material",
      displayName: "Dynamic Material",
      placeable: true,
      breakable: true,
      solid: true,
    });
  });

  it("registers unique numeric ids", () => {
    const numericIds = BLOCK_DEFINITIONS.map((block) => block.numericId);

    expect(new Set(numericIds).size).toBe(numericIds.length);
  });

  it("gives every registered block a display name", () => {
    for (const block of BLOCK_DEFINITIONS) {
      expect(block.displayName.trim()).not.toBe("");
    }
  });

  it("uses registry drops for mined drops", () => {
    for (const block of BLOCK_DEFINITIONS) {
      expect(minedDrop(block.numericId)).toBe(
        block.drops[0]?.numericId ?? null,
      );
    }

    expect(minedDrop(TerrainMaterial.Grass)).toBe(TerrainMaterial.Dirt);
    expect(minedDrop(TerrainMaterial.AlpineRock)).toBe(TerrainMaterial.Stone);
    expect(minedDrop(TerrainMaterial.Water)).toBeNull();
    expect(minedDrop(TerrainMaterial.Leaves)).toBeNull();
  });

  it("maps ore blocks to raw material item drops", () => {
    expect(minedDrops(TerrainMaterial.CoalOre)).toEqual([
      { itemId: "material:coal", quantity: 1 },
    ]);
    expect(minedDrops(TerrainMaterial.CopperOre)).toEqual([
      { itemId: "material:raw_copper", quantity: 1 },
    ]);
    expect(minedDrops(TerrainMaterial.IronOre)).toEqual([
      { itemId: "material:raw_iron", quantity: 1 },
    ]);
    expect(minedDrops(TerrainMaterial.GoldOre)).toEqual([
      { itemId: "material:raw_gold", quantity: 1 },
    ]);
    expect(minedDrops(TerrainMaterial.CrystalOre)).toEqual([
      { itemId: "material:crystal", quantity: 1 },
    ]);
  });
});
