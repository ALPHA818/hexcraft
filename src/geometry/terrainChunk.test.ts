import { describe, expect, it } from "vitest";

import {
  buildTerrainChunk,
  generateTerrainColumns,
  TerrainMaterial,
  type TerrainChunkMesh,
  type TerrainColumn,
} from "./terrainChunk.ts";
import type { MaterialVisuals } from "../materials/MaterialVisuals.ts";

function columnWithBlocks(
  q: number,
  r: number,
  blocks: readonly TerrainMaterial[],
): TerrainColumn {
  return {
    q,
    r,
    height: blocks.length,
    blocks: Uint8Array.from(blocks),
  };
}

function firstVertexColor(
  mesh: TerrainChunkMesh,
): readonly [number, number, number] {
  return [mesh.vertices[6]!, mesh.vertices[7]!, mesh.vertices[8]!];
}

function visual(baseColor: string, accentColor: string): MaterialVisuals {
  return {
    baseColor: baseColor as MaterialVisuals["baseColor"],
    accentColor: accentColor as MaterialVisuals["accentColor"],
    roughness: 0.6,
    metallic: 0,
    emissiveStrength: 0,
    alpha: 1,
  };
}

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
    expect(mesh.emittedBlockCount).toBe(1);
    expect(mesh.emittedFaceCount).toBe(8);
    expect(mesh.emittedTriangleCount).toBe(24);
    expect(mesh.vertexCount).toBe(72);
  });

  it("removes both walls shared by neighboring blocks", () => {
    const mesh = buildTerrainChunk([
      { q: 0, r: 0, height: 1 },
      { q: 1, r: 0, height: 1 },
    ]);

    expect(mesh.blockCount).toBe(2);
    expect(mesh.exposedFaceCount).toBe(14);
    expect(mesh.emittedBlockCount).toBe(2);
    expect(mesh.emittedFaceCount).toBe(14);
    expect(mesh.vertexCount).toBe(132);
  });

  it("isolated generated block emits eight logical faces", () => {
    const mesh = buildTerrainChunk([
      columnWithBlocks(0, 0, [
        TerrainMaterial.Air,
        TerrainMaterial.Stone,
        TerrainMaterial.Air,
      ]),
    ]);

    expect(mesh.emittedBlockCount).toBe(1);
    expect(mesh.emittedFaceCount).toBe(8);
    expect(mesh.emittedTriangleCount).toBe(36);
  });

  it("two horizontal neighboring blocks hide touching side faces", () => {
    const mesh = buildTerrainChunk([
      columnWithBlocks(0, 0, [
        TerrainMaterial.Air,
        TerrainMaterial.Stone,
        TerrainMaterial.Air,
      ]),
      columnWithBlocks(1, 0, [
        TerrainMaterial.Air,
        TerrainMaterial.Stone,
        TerrainMaterial.Air,
      ]),
    ]);

    expect(mesh.emittedBlockCount).toBe(2);
    expect(mesh.emittedFaceCount).toBe(14);
    expect(mesh.emittedFaceCount).toBeLessThan(16);
  });

  it("stacked blocks hide touching top and bottom faces", () => {
    const mesh = buildTerrainChunk([
      columnWithBlocks(0, 0, [
        TerrainMaterial.Air,
        TerrainMaterial.Stone,
        TerrainMaterial.Stone,
        TerrainMaterial.Air,
      ]),
    ]);

    expect(mesh.emittedBlockCount).toBe(2);
    expect(mesh.emittedFaceCount).toBe(14);
    expect(mesh.emittedFaceCount).toBeLessThan(16);
  });

  it("water does not hide solid faces and remains transparent geometry", () => {
    const mesh = buildTerrainChunk([
      columnWithBlocks(0, 0, [
        TerrainMaterial.Air,
        TerrainMaterial.Stone,
        TerrainMaterial.Air,
      ]),
      columnWithBlocks(1, 0, [
        TerrainMaterial.Air,
        TerrainMaterial.Water,
        TerrainMaterial.Air,
      ]),
    ]);

    expect(mesh.emittedBlockCount).toBe(2);
    expect(mesh.waterBlockCount).toBe(1);
    expect(mesh.emittedFaceCount).toBe(15);
    expect(mesh.opaqueVertexCount).toBeGreaterThan(0);
    expect(mesh.translucentVertexCount).toBeGreaterThan(0);
  });

  it("air does not emit faces", () => {
    const mesh = buildTerrainChunk([
      columnWithBlocks(0, 0, [
        TerrainMaterial.Air,
        TerrainMaterial.Air,
        TerrainMaterial.Air,
      ]),
    ]);

    expect(mesh.emittedBlockCount).toBe(0);
    expect(mesh.emittedFaceCount).toBe(0);
    expect(mesh.emittedTriangleCount).toBe(0);
    expect(mesh.vertexCount).toBe(0);
  });

  it("tints dynamic material blocks from provided visuals", () => {
    const dynamicColumn = columnWithBlocks(0, 0, [
      TerrainMaterial.Air,
      TerrainMaterial.DynamicMaterial,
      TerrainMaterial.Air,
    ]);
    const blueMesh = buildTerrainChunk([dynamicColumn], undefined, undefined, {
      dynamicMaterialVisualAt: () => visual("#2864d9", "#9fceff"),
    });
    const greenMesh = buildTerrainChunk([dynamicColumn], undefined, undefined, {
      dynamicMaterialVisualAt: () => visual("#36b85a", "#cfffa0"),
    });
    const blueColor = firstVertexColor(blueMesh);
    const greenColor = firstVertexColor(greenMesh);

    expect(blueColor[2]).toBeGreaterThan(blueColor[0]);
    expect(greenColor[1]).toBeGreaterThan(greenColor[2]);
    expect(greenColor).not.toEqual(blueColor);
  });
});
