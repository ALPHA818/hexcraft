import { describe, expect, it } from "vitest";

import {
  ALL_VOXEL_DIRECTIONS,
  axialDistance,
  directionFromFace,
  faceFromDirection,
  HORIZONTAL_HEX_DIRECTIONS,
  neighborOf,
  oppositeFace,
  parseVoxelKey,
  sameVoxel,
  VERTICAL_DIRECTIONS,
  voxelDistance,
  voxelKey,
} from "./voxelRules.ts";

describe("hex voxel rules", () => {
  it("finds all 6 horizontal neighbors", () => {
    const voxel = { q: 3, r: -2, level: 7 };

    expect(
      HORIZONTAL_HEX_DIRECTIONS.map((direction) =>
        neighborOf(voxel, direction),
      ),
    ).toEqual([
      { q: 4, r: -2, level: 7 },
      { q: 3, r: -1, level: 7 },
      { q: 2, r: -1, level: 7 },
      { q: 2, r: -2, level: 7 },
      { q: 3, r: -3, level: 7 },
      { q: 4, r: -3, level: 7 },
    ]);
  });

  it("finds top and bottom neighbors", () => {
    const voxel = { q: 3, r: -2, level: 7 };

    expect(
      VERTICAL_DIRECTIONS.map((direction) => neighborOf(voxel, direction)),
    ).toEqual([
      { q: 3, r: -2, level: 8 },
      { q: 3, r: -2, level: 6 },
    ]);
  });

  it("maps opposite faces", () => {
    expect(oppositeFace("top")).toBe("bottom");
    expect(oppositeFace("bottom")).toBe("top");
    expect(oppositeFace(0)).toBe(3);
    expect(oppositeFace(1)).toBe(4);
    expect(oppositeFace(2)).toBe(5);
    expect(oppositeFace(3)).toBe(0);
    expect(oppositeFace(4)).toBe(1);
    expect(oppositeFace(5)).toBe(2);
  });

  it("round-trips faces and directions", () => {
    for (const direction of ALL_VOXEL_DIRECTIONS) {
      expect(directionFromFace(faceFromDirection(direction))).toEqual(
        direction,
      );
    }
  });

  it("round-trips voxel keys", () => {
    const voxel = { q: -12, r: 5, level: 42 };
    const parsed = parseVoxelKey(voxelKey(voxel.q, voxel.r, voxel.level));

    expect(parsed).toEqual(voxel);
    expect(sameVoxel(parsed, voxel)).toBe(true);
  });

  it("measures axial distance on the hex grid", () => {
    expect(axialDistance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
    expect(axialDistance({ q: 0, r: 0 }, { q: 3, r: 0 })).toBe(3);
    expect(axialDistance({ q: 0, r: 0 }, { q: 3, r: -3 })).toBe(3);
    expect(axialDistance({ q: 2, r: -1 }, { q: -1, r: 3 })).toBe(4);
  });

  it("includes vertical distance in voxel distance", () => {
    expect(
      voxelDistance({ q: 0, r: 0, level: 10 }, { q: 3, r: -3, level: 14 }),
    ).toBe(7);
  });
});
