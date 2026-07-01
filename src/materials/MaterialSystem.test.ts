import { describe, expect, it } from "vitest";

import { BASE_ELEMENT_COUNT, BASE_ELEMENT_MATERIALS } from "./BaseElements.ts";
import { DEFAULT_MATERIAL_CONFIG } from "./MaterialConfig.ts";
import { combineMaterials } from "./MaterialCombiner.ts";
import { recipeKeyForMaterialIds } from "./MaterialReactions.ts";
import { MaterialRegistry } from "./MaterialRegistry.ts";
import {
  MATERIAL_STAT_KEYS,
  type MaterialDefinition,
} from "./MaterialTypes.ts";

function baseRegistry(): MaterialRegistry {
  const registry = new MaterialRegistry();

  registry.registerBaseMaterials();
  return registry;
}

function materialOrThrow(
  registry: MaterialRegistry,
  id: string,
): MaterialDefinition {
  const material = registry.getMaterialById(id);

  if (!material) {
    throw new Error(`Missing test material ${id}`);
  }

  return material;
}

describe("procedural material system", () => {
  it("base registry has 118 base materials", () => {
    const registry = baseRegistry();

    expect(BASE_ELEMENT_COUNT).toBe(118);
    expect(registry.allMaterials()).toHaveLength(118);
    expect(registry.getMaterialById("element:hydrogen")?.generation).toBe(0);
    expect(registry.getMaterialById("element:iron")?.parents).toEqual([]);
    expect(
      BASE_ELEMENT_MATERIALS.find(
        (material) => material.id === "element:uranium",
      )?.symbol,
    ).toBe("U");
  });

  it("has no duplicate base material ids", () => {
    const ids = new Set(BASE_ELEMENT_MATERIALS.map((material) => material.id));

    expect(ids.size).toBe(BASE_ELEMENT_MATERIALS.length);
  });

  it("has no duplicate base material names", () => {
    const names = new Set(
      BASE_ELEMENT_MATERIALS.map((material) => material.name.toLowerCase()),
    );

    expect(names.size).toBe(BASE_ELEMENT_MATERIALS.length);
  });

  it("A+B and B+A use the same recipe when orderMatters is false", () => {
    const config = {
      ...DEFAULT_MATERIAL_CONFIG,
      orderMatters: false,
    };

    expect(
      recipeKeyForMaterialIds("element:iron", "element:carbon", config),
    ).toBe(recipeKeyForMaterialIds("element:carbon", "element:iron", config));
  });

  it("same pair returns the same material every time", () => {
    const registry = baseRegistry();
    const iron = materialOrThrow(registry, "element:iron");
    const carbon = materialOrThrow(registry, "element:carbon");
    const first = combineMaterials(iron, carbon, registry);
    const second = combineMaterials(carbon, iron, registry);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.discovered).toBe(false);
      expect(second.material).toBe(first.material);
      expect(second.recipeKey).toBe(first.recipeKey);
    }
  });

  it("generated material stores parents", () => {
    const registry = baseRegistry();
    const copper = materialOrThrow(registry, "element:copper");
    const tin = materialOrThrow(registry, "element:tin");
    const result = combineMaterials(copper, tin, registry);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.material.parents).toEqual([
        "element:copper",
        "element:tin",
      ]);
    }
  });

  it("generation increases correctly", () => {
    const registry = baseRegistry();
    const hydrogen = materialOrThrow(registry, "element:hydrogen");
    const oxygen = materialOrThrow(registry, "element:oxygen");
    const waterLike = combineMaterials(hydrogen, oxygen, registry);

    expect(waterLike.ok).toBe(true);
    if (!waterLike.ok) {
      return;
    }

    const sodium = materialOrThrow(registry, "element:sodium");
    const secondGeneration = combineMaterials(
      waterLike.material,
      sodium,
      registry,
    );

    expect(waterLike.material.generation).toBe(1);
    expect(secondGeneration.ok).toBe(true);
    if (secondGeneration.ok) {
      expect(secondGeneration.material.generation).toBe(2);
    }
  });

  it("stats stay in configured bounds", () => {
    const registry = baseRegistry();
    const uranium = materialOrThrow(registry, "element:uranium");
    const oxygen = materialOrThrow(registry, "element:oxygen");
    const config = {
      ...DEFAULT_MATERIAL_CONFIG,
      statMin: 10,
      statMax: 90,
    };
    const result = combineMaterials(uranium, oxygen, registry, config);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    for (const stat of MATERIAL_STAT_KEYS) {
      expect(result.material[stat]).toBeGreaterThanOrEqual(config.statMin);
      expect(result.material[stat]).toBeLessThanOrEqual(config.statMax);
    }
  });

  it("invalid material ids are handled cleanly", () => {
    const registry = baseRegistry();
    const iron = materialOrThrow(registry, "element:iron");
    const invalid: MaterialDefinition = {
      ...iron,
      id: "missing:ghostium",
      name: "Ghostium",
    };
    const result = combineMaterials(iron, invalid, registry);

    expect(result).toMatchObject({
      ok: false,
      reason: "missing_parent",
    });
  });
});
