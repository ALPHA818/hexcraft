import { describe, expect, it } from "vitest";

import { createHexPrism } from "./hexPrism.ts";

describe("hexagonal prism geometry", () => {
  it("creates 24 triangles with position, normal, and color data", () => {
    const mesh = createHexPrism();

    expect(mesh.vertexCount).toBe(72);
    expect(mesh.vertices.length).toBe(72 * 11);
  });

  it("uses the requested radius and height", () => {
    const mesh = createHexPrism(2, 4);
    const positions: number[] = [];

    for (let index = 0; index < mesh.vertices.length; index += 11) {
      positions.push(
        mesh.vertices[index]!,
        mesh.vertices[index + 1]!,
        mesh.vertices[index + 2]!,
      );
    }

    const yValues = positions.filter((_, index) => index % 3 === 1);
    expect(Math.min(...yValues)).toBe(-2);
    expect(Math.max(...yValues)).toBe(2);
  });
});
