import { describe, expect, it } from "vitest";

import { DEFAULT_MATERIAL_CONFIG } from "./MaterialConfig.ts";
import { combineMaterials } from "./MaterialCombiner.ts";
import {
  createMaterialResearchState,
  requiredResearchTierForGeneratedMaterial,
  unlockMaterialResearchTier,
} from "./MaterialResearch.ts";
import { MaterialRegistry } from "./MaterialRegistry.ts";
import type { MaterialDefinition, MaterialStats } from "./MaterialTypes.ts";

const BASE_STATS: MaterialStats = {
  stability: 70,
  hardness: 35,
  density: 35,
  heat: 30,
  conductivity: 20,
  toxicity: 0,
  radioactivity: 0,
  magic: 0,
  organic: 0,
  metal: 0,
  crystal: 0,
  gas: 0,
  liquid: 0,
};

function traitMaterial(
  id: string,
  name: string,
  tags: readonly string[],
  stats: Partial<MaterialStats> = {},
): MaterialDefinition {
  return {
    id: `test:${id}`,
    name,
    generation: 0,
    parents: [],
    rarity: "common",
    ...BASE_STATS,
    ...stats,
    tags,
    discoveredAt: 0,
  };
}

function registryWith(
  materials: readonly MaterialDefinition[] = [],
): MaterialRegistry {
  const registry = new MaterialRegistry();

  registry.registerBaseMaterials();
  for (const material of materials) {
    registry.registerGeneratedMaterial(material);
  }

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

const fire = traitMaterial("fire", "Fire", ["fire", "fuel"], {
  heat: 92,
  stability: 58,
});

describe("material research progression", () => {
  it("blocks locked reactions in survival", () => {
    const registry = registryWith([fire]);
    const iron = materialOrThrow(registry, "element:iron");
    const result = combineMaterials(
      fire,
      iron,
      registry,
      DEFAULT_MATERIAL_CONFIG,
      { mode: "survival", research: createMaterialResearchState() },
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "research_locked",
      requiredResearchTier: "metallurgical",
      message: "Requires Metallurgical Research",
    });
  });

  it("lets creative combine locked reactions", () => {
    const registry = registryWith([fire]);
    const iron = materialOrThrow(registry, "element:iron");
    const result = combineMaterials(
      fire,
      iron,
      registry,
      DEFAULT_MATERIAL_CONFIG,
      { mode: "creative", research: createMaterialResearchState() },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.material.requiredResearchTier).toBe("metallurgical");
    }
  });

  it("allows locked reactions after unlocking the tier", () => {
    const registry = registryWith([fire]);
    const iron = materialOrThrow(registry, "element:iron");
    const research = unlockMaterialResearchTier(
      createMaterialResearchState(),
      "metallurgical",
    );
    const result = combineMaterials(
      fire,
      iron,
      registry,
      DEFAULT_MATERIAL_CONFIG,
      { mode: "survival", research },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.material.name).toBe("Embersteel");
      expect(result.material.requiredResearchTier).toBe("metallurgical");
    }
  });

  it("assigns the generated material to the reaction research tier", () => {
    const registry = registryWith([fire]);
    const iron = materialOrThrow(registry, "element:iron");
    const result = combineMaterials(
      fire,
      iron,
      registry,
      DEFAULT_MATERIAL_CONFIG,
      { mode: "creative" },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.material.requiredResearchTier).toBe("metallurgical");
    }
  });

  it("escalates very high magic, radioactivity, and void tags to higher research", () => {
    expect(
      requiredResearchTierForGeneratedMaterial(
        {
          ...BASE_STATS,
          magic: 90,
        },
        ["void"],
        { requiredResearchTier: "metallurgical" },
      ),
    ).toBe("void");
    expect(
      requiredResearchTierForGeneratedMaterial(
        {
          ...BASE_STATS,
          radioactivity: 90,
        },
        ["radioactive"],
        { requiredResearchTier: "metallurgical" },
      ),
    ).toBe("radioactive");
  });

  it("uses generated material tiers to control recursive crafting", () => {
    const registry = registryWith([fire]);
    const iron = materialOrThrow(registry, "element:iron");
    const crystal = materialOrThrow(registry, "element:silicon");
    const embersteelResult = combineMaterials(
      fire,
      iron,
      registry,
      DEFAULT_MATERIAL_CONFIG,
      { mode: "creative" },
    );

    expect(embersteelResult.ok).toBe(true);
    if (!embersteelResult.ok) {
      return;
    }

    const recursiveResult = combineMaterials(
      embersteelResult.material,
      crystal,
      registry,
      DEFAULT_MATERIAL_CONFIG,
      { mode: "survival", research: createMaterialResearchState() },
    );

    expect(recursiveResult).toMatchObject({
      ok: false,
      reason: "research_locked",
      requiredResearchTier: "metallurgical",
      message: "Requires Metallurgical Research",
    });
  });
});
