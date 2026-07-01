import { describe, expect, it } from "vitest";

import { DEFAULT_MATERIAL_CONFIG } from "./MaterialConfig.ts";
import { combineMaterials } from "./MaterialCombiner.ts";
import { MaterialRegistry } from "./MaterialRegistry.ts";
import type {
  MaterialCombinationResult,
  MaterialDefinition,
  MaterialStats,
} from "./MaterialTypes.ts";

const BASE_TRAIT_STATS: MaterialStats = {
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
  stats: Partial<typeof BASE_TRAIT_STATS> = {},
): MaterialDefinition {
  return {
    id: `test:${id}`,
    name,
    generation: 0,
    parents: [],
    rarity: "common",
    ...BASE_TRAIT_STATS,
    ...stats,
    tags,
    discoveredAt: 0,
    description: `${name} is a test trait material.`,
  };
}

function baseRegistry(extraMaterials: readonly MaterialDefinition[] = []) {
  const registry = new MaterialRegistry();

  registry.registerBaseMaterials();
  for (const material of extraMaterials) {
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

function combineOrThrow(
  materialA: MaterialDefinition,
  materialB: MaterialDefinition,
  registry: MaterialRegistry,
): Extract<MaterialCombinationResult, { ok: true }>["material"] {
  const result = combineMaterials(
    materialA,
    materialB,
    registry,
    DEFAULT_MATERIAL_CONFIG,
  );

  if (!result.ok) {
    throw new Error(result.message);
  }

  return result.material;
}

const fire = traitMaterial("fire", "Fire", ["fire", "fuel"], {
  heat: 92,
  stability: 58,
});
const water = traitMaterial("water", "Water", ["water", "liquid"], {
  density: 28,
  heat: 8,
  liquid: 94,
});
const earth = traitMaterial("earth", "Earth", ["earth"], {
  density: 88,
  hardness: 76,
  stability: 86,
});
const crystal = traitMaterial("crystal", "Crystal", ["crystal"], {
  crystal: 92,
  hardness: 72,
});
const magic = traitMaterial("magic", "Magic", ["magic", "arcane"], {
  magic: 94,
  stability: 66,
});
const toxic = traitMaterial("toxic", "Toxic Essence", ["toxic"], {
  stability: 42,
  toxicity: 94,
});
const organic = traitMaterial("organic", "Organic Matter", ["organic"], {
  organic: 92,
  stability: 76,
});
const radioactive = traitMaterial(
  "radioactive",
  "Radioactive Core",
  ["radioactive", "unstable"],
  {
    radioactivity: 95,
    stability: 24,
  },
);
const gas = traitMaterial("gas", "Gas", ["gas", "air"], {
  density: 4,
  gas: 94,
});

describe("procedural material reactions", () => {
  it("Fire + Iron produces a forged fire metal result with a readable deterministic name", () => {
    const registry = baseRegistry([fire]);
    const iron = materialOrThrow(registry, "element:iron");
    const material = combineOrThrow(fire, iron, registry);

    expect(material.name).toBe("Embersteel");
    expect(material.name).not.toMatch(/^Material_\d+/);
    expect(material.tags).toEqual(
      expect.arrayContaining(["fire", "forged", "metal"]),
    );
  });

  it("Water + Earth produces a clay or mud style result", () => {
    const registry = baseRegistry([water, earth]);
    const material = combineOrThrow(water, earth, registry);

    expect(material.name).toMatch(/clay|mud/i);
    expect(material.tags).toEqual(
      expect.arrayContaining(["clay", "earth", "water"]),
    );
  });

  it("Crystal + Magic produces an enchanted arcane crystal style result", () => {
    const registry = baseRegistry([crystal, magic]);
    const material = combineOrThrow(crystal, magic, registry);

    expect(material.name).toMatch(/arcanite|arcane|enchanted/i);
    expect(material.name).toMatch(/crystal|spellglass/i);
    expect(material.tags).toEqual(
      expect.arrayContaining(["arcane", "crystal", "magic"]),
    );
  });

  it("Toxic + Organic produces a poison compound style result", () => {
    const registry = baseRegistry([toxic, organic]);
    const material = combineOrThrow(toxic, organic, registry);

    expect(material.name).toMatch(/poison|venom|toxic/i);
    expect(material.tags).toEqual(
      expect.arrayContaining(["organic", "poison", "toxic"]),
    );
  });

  it("Radioactive + Metal produces an unstable alloy style result", () => {
    const registry = baseRegistry([radioactive]);
    const iron = materialOrThrow(registry, "element:iron");
    const material = combineOrThrow(radioactive, iron, registry);

    expect(material.name).toMatch(/unstable|alloy|irradiated/i);
    expect(material.tags).toEqual(
      expect.arrayContaining(["alloy", "metal", "radioactive", "unstable"]),
    );
  });

  it("Gas + Fire produces an explosive compound style result", () => {
    const registry = baseRegistry([gas, fire]);
    const material = combineOrThrow(gas, fire, registry);

    expect(material.name).toMatch(/explosive|blast|ignition/i);
    expect(material.tags).toEqual(
      expect.arrayContaining(["explosive", "fire", "gas"]),
    );
  });

  it("Embersteel + Crystal produces a deterministic second-generation material", () => {
    const firstRegistry = baseRegistry([fire, crystal]);
    const secondRegistry = baseRegistry([fire, crystal]);
    const firstIron = materialOrThrow(firstRegistry, "element:iron");
    const secondIron = materialOrThrow(secondRegistry, "element:iron");
    const firstEmbersteel = combineOrThrow(fire, firstIron, firstRegistry);
    const secondEmbersteel = combineOrThrow(fire, secondIron, secondRegistry);
    const firstCrystal = materialOrThrow(firstRegistry, crystal.id);
    const secondCrystal = materialOrThrow(secondRegistry, crystal.id);
    const firstResult = combineOrThrow(
      firstEmbersteel,
      firstCrystal,
      firstRegistry,
    );
    const secondResult = combineOrThrow(
      secondEmbersteel,
      secondCrystal,
      secondRegistry,
    );

    expect(firstResult.generation).toBe(2);
    expect(firstResult.name).toBe(secondResult.name);
    expect(firstResult.id).toBe(secondResult.id);
    expect(firstResult.tags).toEqual(secondResult.tags);
    expect(firstResult.name).not.toMatch(/^Material_\d+/);
  });

  it("second-generation plus second-generation combinations work", () => {
    const registry = baseRegistry([fire, water, earth]);
    const iron = materialOrThrow(registry, "element:iron");
    const embersteel = combineOrThrow(fire, iron, registry);
    const clay = combineOrThrow(water, earth, registry);
    const material = combineOrThrow(embersteel, clay, registry);

    expect(material.generation).toBe(2);
    expect(material.parents).toEqual([clay.id, embersteel.id].sort());
    expect(material.name).not.toMatch(/^Material_\d+/);
  });

  it("results are stable across repeated calls", () => {
    const registry = baseRegistry([crystal, magic]);
    const first = combineOrThrow(crystal, magic, registry);
    const second = combineOrThrow(magic, crystal, registry);

    expect(second).toBe(first);
    expect(second.name).toBe(first.name);
    expect(second.id).toBe(first.id);
  });
});
