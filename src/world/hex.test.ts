import { describe, expect, it } from "vitest";

import { horizontalNeighbors } from "./hex.ts";

describe("hexagonal world coordinates", () => {
  it("finds all six horizontal neighbors", () => {
    expect(horizontalNeighbors({ q: 0, r: 0, z: 4 })).toEqual([
      { q: 1, r: 0, z: 4 },
      { q: 1, r: -1, z: 4 },
      { q: 0, r: -1, z: 4 },
      { q: -1, r: 0, z: 4 },
      { q: -1, r: 1, z: 4 },
      { q: 0, r: 1, z: 4 },
    ]);
  });
});
