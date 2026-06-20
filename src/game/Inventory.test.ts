import { describe, expect, it } from "vitest";

import { TerrainMaterial } from "../geometry/terrainChunk.ts";
import { minedDrop } from "./Inventory.ts";

describe("survival inventory drops", () => {
  it("turns surface blocks into placeable materials", () => {
    expect(minedDrop(TerrainMaterial.Grass)).toBe(TerrainMaterial.Dirt);
    expect(minedDrop(TerrainMaterial.AlpineRock)).toBe(TerrainMaterial.Stone);
    expect(minedDrop(TerrainMaterial.Wood)).toBe(TerrainMaterial.Wood);
  });

  it("does not collect water or leaves", () => {
    expect(minedDrop(TerrainMaterial.Water)).toBeNull();
    expect(minedDrop(TerrainMaterial.Leaves)).toBeNull();
  });
});
