import { describe, expect, it } from "vitest";

import type { MaterialDefinition } from "./MaterialTypes.ts";
import {
  hexColorToRgb,
  materialVisualsForMaterial,
  relativeLuminance,
  UNKNOWN_MATERIAL_VISUALS,
} from "./MaterialVisuals.ts";

function testMaterial(
  id: string,
  overrides: Partial<MaterialDefinition> = {},
): MaterialDefinition {
  return {
    id,
    name: "Test Material",
    generation: 1,
    parents: ["element:hydrogen", "element:carbon"],
    rarity: "common",
    stability: 62,
    hardness: 44,
    density: 40,
    heat: 30,
    conductivity: 25,
    toxicity: 0,
    radioactivity: 0,
    magic: 0,
    organic: 12,
    metal: 8,
    crystal: 12,
    gas: 0,
    liquid: 0,
    tags: [],
    discoveredAt: 1,
    ...overrides,
  };
}

describe("material visuals", () => {
  it("returns stable visuals for the same material", () => {
    const material = testMaterial("generated:stable", {
      hardness: 67,
      density: 54,
      tags: ["earth"],
    });

    expect(materialVisualsForMaterial(material)).toEqual(
      materialVisualsForMaterial(material),
    );
  });

  it("provides a fallback visual for unknown material items", () => {
    expect(UNKNOWN_MATERIAL_VISUALS).toMatchObject({
      baseColor: expect.stringMatching(/^#[0-9a-f]{6}$/i),
      accentColor: expect.stringMatching(/^#[0-9a-f]{6}$/i),
      alpha: 1,
    });
  });

  it("varies colors for different generated material ids", () => {
    const sharedStats = {
      hardness: 67,
      density: 54,
      crystal: 44,
      tags: ["earth"],
    } satisfies Partial<MaterialDefinition>;
    const first = materialVisualsForMaterial(
      testMaterial("generated:first", sharedStats),
    );
    const second = materialVisualsForMaterial(
      testMaterial("generated:second", sharedStats),
    );

    expect([first.baseColor, first.accentColor]).not.toEqual([
      second.baseColor,
      second.accentColor,
    ]);
  });

  it("makes metal materials look metallic", () => {
    const visuals = materialVisualsForMaterial(
      testMaterial("generated:metal", {
        conductivity: 86,
        density: 72,
        metal: 92,
        tags: ["metal", "metallic", "conductive"],
      }),
    );

    expect(visuals.metallic).toBeGreaterThan(0.78);
    expect(visuals.roughness).toBeLessThan(0.62);
  });

  it("gives crystal materials a brighter accent", () => {
    const visuals = materialVisualsForMaterial(
      testMaterial("generated:crystal", {
        crystal: 91,
        magic: 24,
        tags: ["crystal", "crystalline"],
      }),
    );

    expect(relativeLuminance(visuals.accentColor)).toBeGreaterThan(
      relativeLuminance(visuals.baseColor),
    );
  });

  it("uses a toxic palette for toxic materials", () => {
    const visuals = materialVisualsForMaterial(
      testMaterial("generated:toxic", {
        toxicity: 90,
        stability: 34,
        tags: ["toxic", "poison"],
      }),
    );
    const [red, green, blue] = hexColorToRgb(visuals.baseColor);

    expect(green).toBeGreaterThan(red);
    expect(green).toBeGreaterThan(blue);
  });

  it("uses a warm palette for fire materials", () => {
    const visuals = materialVisualsForMaterial(
      testMaterial("generated:fire", {
        heat: 88,
        stability: 46,
        tags: ["fire", "fuel"],
      }),
    );
    const [red, green, blue] = hexColorToRgb(visuals.baseColor);

    expect(red).toBeGreaterThan(green);
    expect(green).toBeGreaterThan(blue);
  });

  it("keeps metal, crystal, fire, and toxic examples visually distinct", () => {
    const examples = [
      materialVisualsForMaterial(
        testMaterial("generated:distinct-metal", {
          conductivity: 86,
          metal: 94,
          tags: ["metal", "metallic"],
        }),
      ),
      materialVisualsForMaterial(
        testMaterial("generated:distinct-crystal", {
          crystal: 92,
          tags: ["crystal", "crystalline"],
        }),
      ),
      materialVisualsForMaterial(
        testMaterial("generated:distinct-fire", {
          heat: 92,
          tags: ["fire", "fuel"],
        }),
      ),
      materialVisualsForMaterial(
        testMaterial("generated:distinct-toxic", {
          toxicity: 92,
          tags: ["toxic", "poison"],
        }),
      ),
    ];

    expect(new Set(examples.map((visuals) => visuals.baseColor)).size).toBe(
      examples.length,
    );
    expect(new Set(examples.map((visuals) => visuals.accentColor)).size).toBe(
      examples.length,
    );
  });
});
