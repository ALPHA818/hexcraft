import { describe, expect, it } from "vitest";

import { DEFAULT_MATERIAL_CONFIG } from "./MaterialConfig.ts";
import { combineMaterials } from "./MaterialCombiner.ts";
import {
  applyMaterialStationModifiers,
  materialStationGeneratedName,
} from "./MaterialStations.ts";
import {
  legacyRecipeKeyForMaterialIds,
  recipeKeyForMaterialIds,
} from "./MaterialReactions.ts";
import { MaterialRegistry } from "./MaterialRegistry.ts";
import type { MaterialDefinition, MaterialStats } from "./MaterialTypes.ts";

function registryWithBaseMaterials(): MaterialRegistry {
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
    throw new Error(`Missing material ${id}`);
  }

  return material;
}

function generatedMaterial(
  id: string,
  parents: readonly [string, string],
): MaterialDefinition {
  return {
    id,
    name: "Legacy Alloy",
    generation: 1,
    parents,
    rarity: "common",
    stability: 70,
    hardness: 60,
    density: 55,
    heat: 35,
    conductivity: 50,
    toxicity: 0,
    radioactivity: 0,
    magic: 0,
    organic: 0,
    metal: 68,
    crystal: 10,
    gas: 0,
    liquid: 0,
    tags: ["metal", "alloy"],
    discoveredAt: 1,
  };
}

const BASE_STATS: MaterialStats = {
  stability: 50,
  hardness: 40,
  density: 40,
  heat: 20,
  conductivity: 20,
  toxicity: 5,
  radioactivity: 0,
  magic: 0,
  organic: 0,
  metal: 20,
  crystal: 5,
  gas: 10,
  liquid: 10,
};

describe("material processing stations", () => {
  it("creates different recipe keys for combiner and forge", () => {
    const combinerKey = recipeKeyForMaterialIds(
      "element:iron",
      "element:carbon",
      DEFAULT_MATERIAL_CONFIG,
      "combiner",
    );
    const forgeKey = recipeKeyForMaterialIds(
      "element:iron",
      "element:carbon",
      DEFAULT_MATERIAL_CONFIG,
      "forge",
    );

    expect(combinerKey).toContain("station:combiner");
    expect(forgeKey).toContain("station:forge");
    expect(forgeKey).not.toBe(combinerKey);
  });

  it("applies station modifiers to stats", () => {
    const forged = applyMaterialStationModifiers(
      BASE_STATS,
      "forge",
      DEFAULT_MATERIAL_CONFIG,
    );

    expect(forged.hardness).toBeGreaterThan(BASE_STATS.hardness);
    expect(forged.metal).toBeGreaterThan(BASE_STATS.metal);
    expect(forged.gas).toBeLessThan(BASE_STATS.gas);
  });

  it("applies station modifiers to generated names", () => {
    expect(materialStationGeneratedName("Embersteel", "forge")).toBe(
      "Forged Embersteel",
    );
    expect(materialStationGeneratedName("Embersteel", "combiner")).toBe(
      "Embersteel",
    );
  });

  it("can generate different materials from the same parents in different stations", () => {
    const registry = registryWithBaseMaterials();
    const iron = materialOrThrow(registry, "element:iron");
    const carbon = materialOrThrow(registry, "element:carbon");
    const combinerResult = combineMaterials(iron, carbon, registry);
    const forgeResult = combineMaterials(
      iron,
      carbon,
      registry,
      DEFAULT_MATERIAL_CONFIG,
      {},
      "forge",
    );

    expect(combinerResult.ok).toBe(true);
    expect(forgeResult.ok).toBe(true);
    if (combinerResult.ok && forgeResult.ok) {
      expect(forgeResult.recipeKey).not.toBe(combinerResult.recipeKey);
      expect(forgeResult.material.id).not.toBe(combinerResult.material.id);
      expect(forgeResult.material.stationType).toBe("forge");
      expect(combinerResult.material.stationType).toBe("combiner");
      expect(forgeResult.material.name).toContain("Forged");
    }
  });

  it("loads legacy combiner recipes without station keys", () => {
    const registry = registryWithBaseMaterials();
    const legacyMaterial = generatedMaterial("generated:legacy-alloy", [
      "element:carbon",
      "element:iron",
    ]);
    const legacyKey = legacyRecipeKeyForMaterialIds(
      "element:iron",
      "element:carbon",
      DEFAULT_MATERIAL_CONFIG,
    );

    registry.registerGeneratedMaterial(legacyMaterial);
    registry.storeRecipeResult(legacyKey, legacyMaterial.id);

    expect(registry.getRecipeResult("element:iron", "element:carbon")?.id).toBe(
      legacyMaterial.id,
    );
  });
});
