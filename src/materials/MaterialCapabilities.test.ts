import { describe, expect, it } from "vitest";

import {
  classifyMaterialCapabilities,
  MATERIAL_CAPABILITY_KEYS,
} from "./MaterialCapabilities.ts";
import type { MaterialDefinition } from "./MaterialTypes.ts";

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
    stability: 55,
    hardness: 35,
    density: 35,
    heat: 20,
    conductivity: 20,
    toxicity: 0,
    radioactivity: 0,
    magic: 0,
    organic: 0,
    metal: 0,
    crystal: 0,
    gas: 0,
    liquid: 0,
    tags: [],
    discoveredAt: 1,
    ...overrides,
  };
}

describe("material capabilities", () => {
  it("returns every capability grade as a bounded number", () => {
    const capabilities = classifyMaterialCapabilities(
      testMaterial("generated:bounded"),
    );

    expect(Object.keys(capabilities).sort()).toEqual(
      [...MATERIAL_CAPABILITY_KEYS].sort(),
    );
    for (const grade of Object.values(capabilities)) {
      expect(grade).toBeGreaterThanOrEqual(0);
      expect(grade).toBeLessThanOrEqual(100);
    }
  });

  it("rates metal hard materials as high tool grade", () => {
    const capabilities = classifyMaterialCapabilities(
      testMaterial("generated:tool-steel", {
        stability: 76,
        hardness: 90,
        density: 70,
        conductivity: 62,
        metal: 92,
        tags: ["metal", "hard", "alloy"],
      }),
    );

    expect(capabilities.toolGrade).toBeGreaterThanOrEqual(80);
  });

  it("rates magic crystals as high magic focus grade", () => {
    const capabilities = classifyMaterialCapabilities(
      testMaterial("generated:focus-crystal", {
        stability: 70,
        conductivity: 54,
        magic: 92,
        crystal: 88,
        tags: ["magic", "crystal", "arcane"],
      }),
    );

    expect(capabilities.magicFocusGrade).toBeGreaterThanOrEqual(85);
  });

  it("rates gas and fire materials as highly explosive", () => {
    const capabilities = classifyMaterialCapabilities(
      testMaterial("generated:volatile-gas", {
        stability: 24,
        heat: 92,
        toxicity: 38,
        gas: 94,
        density: 12,
        tags: ["gas", "fire", "explosive", "fuel", "unstable"],
      }),
    );

    expect(capabilities.explosiveGrade).toBeGreaterThanOrEqual(85);
  });

  it("rates radioactive metals as reactor grade", () => {
    const capabilities = classifyMaterialCapabilities(
      testMaterial("generated:reactor-metal", {
        stability: 58,
        density: 82,
        heat: 64,
        conductivity: 66,
        radioactivity: 90,
        metal: 82,
        tags: ["radioactive", "uranium", "actinide", "metal"],
      }),
    );

    expect(capabilities.reactorGrade).toBeGreaterThanOrEqual(85);
  });

  it("rates organic toxic materials as biologically relevant poison", () => {
    const capabilities = classifyMaterialCapabilities(
      testMaterial("generated:poison-organic", {
        stability: 42,
        toxicity: 82,
        organic: 88,
        liquid: 44,
        gas: 20,
        tags: ["organic", "toxic", "poison"],
      }),
    );

    expect(capabilities.biologicalGrade).toBeGreaterThanOrEqual(85);
  });
});
