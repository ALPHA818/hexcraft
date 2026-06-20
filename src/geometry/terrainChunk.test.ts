import { describe, expect, it } from "vitest";

import {
  buildTerrainChunk,
  generateTerrainColumns,
} from "./terrainChunk.ts";

describe("terrain chunk generation", () => {
  it("generates every coordinate in a hexagonal radius", () => {
    expect(generateTerrainColumns(0)).toHaveLength(1);
    expect(generateTerrainColumns(1)).toHaveLength(7);
    expect(generateTerrainColumns(5)).toHaveLength(91);
  });

  it("meshes one block as a complete hexagonal prism", () => {
    const mesh = buildTerrainChunk([{ q: 0, r: 0, height: 1 }]);

    expect(mesh.blockCount).toBe(1);
    expect(mesh.exposedFaceCount).toBe(8);
    expect(mesh.vertexCount).toBe(72);
  });

  it("removes both walls shared by neighboring blocks", () => {
    const mesh = buildTerrainChunk([
      { q: 0, r: 0, height: 1 },
      { q: 1, r: 0, height: 1 },
    ]);

    expect(mesh.blockCount).toBe(2);
    expect(mesh.exposedFaceCount).toBe(14);
    expect(mesh.vertexCount).toBe(132);
  });
});
