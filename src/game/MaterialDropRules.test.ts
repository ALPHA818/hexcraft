import { describe, expect, it } from "vitest";

import {
  TerrainMaterial,
  TERRAIN_DEPTH_BLOCKS,
} from "../geometry/terrainChunk.ts";
import { itemIdForMaterial, type ItemId } from "../items/ItemRegistry.ts";
import { BASE_ELEMENT_MATERIALS } from "../materials/BaseElements.ts";
import { MaterialRegistry } from "../materials/MaterialRegistry.ts";
import type { MaterialDefinition } from "../materials/MaterialTypes.ts";
import {
  applyMaterialDropRules,
  type MaterialDropDiscoveryContext,
  type MaterialDropInventory,
} from "./MaterialDropRules.ts";

function undiscoveredRegistry(): MaterialRegistry {
  const registry = new MaterialRegistry();

  registry.registerBaseMaterials(BASE_ELEMENT_MATERIALS, []);
  return registry;
}

function generatedMaterial(id = "generated:stable-stone"): MaterialDefinition {
  return {
    id,
    name: "Stable Stone",
    generation: 1,
    parents: ["element:silicon", "element:carbon"],
    rarity: "common",
    stability: 80,
    hardness: 70,
    density: 55,
    heat: 20,
    conductivity: 20,
    toxicity: 0,
    radioactivity: 0,
    magic: 10,
    organic: 0,
    metal: 20,
    crystal: 30,
    gas: 0,
    liquid: 0,
    tags: ["earth"],
    discoveredAt: 1,
  };
}

function createInventorySink(): MaterialDropInventory &
  Readonly<{
    blockDrops: Array<readonly [TerrainMaterial, number]>;
    itemDrops: Array<readonly [ItemId, number]>;
  }> {
  const blockDrops: Array<readonly [TerrainMaterial, number]> = [];
  const itemDrops: Array<readonly [ItemId, number]> = [];

  return {
    blockDrops,
    itemDrops,
    add: (material, quantity) => {
      blockDrops.push([material, quantity]);
    },
    addItem: (itemId, quantity) => {
      itemDrops.push([itemId, quantity]);
      return true;
    },
  };
}

function discoveredIds(registry: MaterialRegistry): readonly string[] {
  return registry
    .allDiscoveredMaterials()
    .filter((material) => material.generation === 0)
    .map((material) => material.id)
    .sort();
}

function traceCountsForContext(
  context: Omit<MaterialDropDiscoveryContext, "q" | "r">,
  attempts = 192,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (let index = 0; index < attempts; index += 1) {
    const registry = undiscoveredRegistry();
    const inventory = createInventorySink();
    const result = applyMaterialDropRules(
      TerrainMaterial.Stone,
      inventory,
      registry,
      {
        discoveryContext: {
          ...context,
          q: index,
          r: -index * 2,
          config: { materialTraceDiscoveryChance: 1, ...context.config },
        },
      },
    );

    for (const materialId of result.traceMaterialIds) {
      counts.set(materialId, (counts.get(materialId) ?? 0) + 1);
    }
  }

  return counts;
}

function countTrace(
  counts: ReadonlyMap<string, number>,
  materialId: string,
): number {
  return counts.get(materialId) ?? 0;
}

describe("material drop rules", () => {
  it("mining iron ore discovers iron", () => {
    const registry = undiscoveredRegistry();
    const inventory = createInventorySink();
    const result = applyMaterialDropRules(
      TerrainMaterial.IronOre,
      inventory,
      registry,
    );

    expect(discoveredIds(registry)).toEqual(["element:iron"]);
    expect(result.notifications).toEqual(["Discovered Iron"]);
    expect(inventory.itemDrops).toContainEqual(["material:raw_iron", 1]);
    expect(inventory.itemDrops).toContainEqual([
      itemIdForMaterial("element:iron"),
      1,
    ]);
  });

  it("mining coal ore discovers carbon", () => {
    const registry = undiscoveredRegistry();
    const inventory = createInventorySink();
    const result = applyMaterialDropRules(
      TerrainMaterial.CoalOre,
      inventory,
      registry,
    );

    expect(discoveredIds(registry)).toEqual(["element:carbon"]);
    expect(result.notifications).toEqual(["Discovered Carbon"]);
    expect(inventory.itemDrops).toContainEqual(["material:coal", 1]);
    expect(inventory.itemDrops).toContainEqual([
      itemIdForMaterial("element:carbon"),
      1,
    ]);
  });

  it("mining copper ore discovers copper", () => {
    const registry = undiscoveredRegistry();
    const inventory = createInventorySink();
    const result = applyMaterialDropRules(
      TerrainMaterial.CopperOre,
      inventory,
      registry,
    );

    expect(discoveredIds(registry)).toEqual(["element:copper"]);
    expect(result.notifications).toEqual(["Discovered Copper"]);
    expect(inventory.itemDrops).toContainEqual(["material:raw_copper", 1]);
    expect(inventory.itemDrops).toContainEqual([
      itemIdForMaterial("element:copper"),
      1,
    ]);
  });

  it("mining gold ore discovers gold", () => {
    const registry = undiscoveredRegistry();
    const inventory = createInventorySink();
    const result = applyMaterialDropRules(
      TerrainMaterial.GoldOre,
      inventory,
      registry,
    );

    expect(discoveredIds(registry)).toEqual(["element:gold"]);
    expect(result.notifications).toEqual(["Discovered Gold"]);
    expect(inventory.itemDrops).toContainEqual(["material:raw_gold", 1]);
    expect(inventory.itemDrops).toContainEqual([
      itemIdForMaterial("element:gold"),
      1,
    ]);
  });

  it("mining crystal ore discovers a crystal-associated material", () => {
    const registry = undiscoveredRegistry();
    const inventory = createInventorySink();
    const result = applyMaterialDropRules(
      TerrainMaterial.CrystalOre,
      inventory,
      registry,
    );

    expect(discoveredIds(registry)).toEqual(["element:silicon"]);
    expect(result.notifications).toEqual(["Discovered Silicon"]);
    expect(inventory.itemDrops).toContainEqual(["material:crystal", 1]);
    expect(inventory.itemDrops).toContainEqual([
      itemIdForMaterial("element:silicon"),
      1,
    ]);
  });

  it("repeat mining does not duplicate discovered material notifications", () => {
    const registry = undiscoveredRegistry();
    const firstInventory = createInventorySink();
    const secondInventory = createInventorySink();
    const first = applyMaterialDropRules(
      TerrainMaterial.IronOre,
      firstInventory,
      registry,
    );
    const second = applyMaterialDropRules(
      TerrainMaterial.IronOre,
      secondInventory,
      registry,
    );

    expect(first.notifications).toEqual(["Discovered Iron"]);
    expect(second.notifications).toEqual([]);
    expect(discoveredIds(registry)).toEqual(["element:iron"]);
    expect(secondInventory.itemDrops).toContainEqual([
      itemIdForMaterial("element:iron"),
      1,
    ]);
  });

  it("normal drops still happen for material and non-material blocks", () => {
    const registry = undiscoveredRegistry();
    const oreInventory = createInventorySink();
    const stoneInventory = createInventorySink();

    expect(
      applyMaterialDropRules(TerrainMaterial.IronOre, oreInventory, registry)
        .normalDropCount,
    ).toBe(1);
    expect(oreInventory.itemDrops).toContainEqual(["material:raw_iron", 1]);

    expect(
      applyMaterialDropRules(TerrainMaterial.Stone, stoneInventory, registry)
        .normalDropCount,
    ).toBe(1);
    expect(stoneInventory.blockDrops).toEqual([[TerrainMaterial.Stone, 1]]);
  });

  it("mining stone underground can discover a deterministic silicon trace", () => {
    const registry = undiscoveredRegistry();
    const inventory = createInventorySink();
    const result = applyMaterialDropRules(
      TerrainMaterial.Stone,
      inventory,
      registry,
      {
        discoveryContext: {
          q: 3,
          r: -2,
          level: TERRAIN_DEPTH_BLOCKS - 2,
          worldSeed: 77,
          config: { materialTraceDiscoveryChance: 1 },
        },
      },
    );

    expect(result.traceMaterialIds).toEqual(["element:silicon"]);
    expect(result.notifications).toEqual(["Found trace of Silicon"]);
    expect(inventory.itemDrops).toContainEqual([
      itemIdForMaterial("element:silicon"),
      1,
    ]);
  });

  it("mining with biome context can discover one rare material trace", () => {
    const registry = undiscoveredRegistry();
    const inventory = createInventorySink();
    const result = applyMaterialDropRules(
      TerrainMaterial.Stone,
      inventory,
      registry,
      {
        discoveryContext: {
          biome: "desert",
          q: 3,
          r: -2,
          level: TERRAIN_DEPTH_BLOCKS + 3,
          worldSeed: 77,
          config: { materialTraceDiscoveryChance: 1 },
        },
      },
    );

    expect(result.traceMaterialIds).toHaveLength(1);
    expect(["element:silicon", "element:sulfur", "element:sodium"]).toContain(
      result.traceMaterialIds[0],
    );
    expect(
      inventory.itemDrops.filter(([itemId]) =>
        itemId.startsWith("generated-material:"),
      ),
    ).toHaveLength(1);
    expect(result.notifications[0]).toMatch(/^Found trace of /);
  });

  it("desert trace rules favor silicon and sulfur", () => {
    const counts = traceCountsForContext({
      biome: "desert",
      level: TERRAIN_DEPTH_BLOCKS + 4,
      worldSeed: 902,
    });
    const siliconAndSulfur =
      countTrace(counts, "element:silicon") +
      countTrace(counts, "element:sulfur");

    expect(countTrace(counts, "element:silicon")).toBeGreaterThan(0);
    expect(countTrace(counts, "element:sulfur")).toBeGreaterThan(0);
    expect(siliconAndSulfur).toBeGreaterThan(
      countTrace(counts, "element:sodium"),
    );
  });

  it("cave trace rules favor crystal and radioactive discoveries", () => {
    const counts = traceCountsForContext({
      isCave: true,
      level: TERRAIN_DEPTH_BLOCKS + 8,
      worldSeed: 441,
    });
    const radioactive =
      countTrace(counts, "element:uranium") +
      countTrace(counts, "element:radium") +
      countTrace(counts, "element:thorium");

    expect(countTrace(counts, "element:silicon")).toBeGreaterThan(0);
    expect(radioactive).toBeGreaterThan(0);
    expect([...counts.keys()].sort()).toEqual(
      expect.arrayContaining(["element:silicon", "element:uranium"]),
    );
  });

  it("forest trace rules favor carbon and organic elements", () => {
    const counts = traceCountsForContext({
      biome: "forest",
      level: TERRAIN_DEPTH_BLOCKS + 4,
      worldSeed: 333,
    });
    const organic =
      countTrace(counts, "element:carbon") +
      countTrace(counts, "element:oxygen") +
      countTrace(counts, "element:nitrogen") +
      countTrace(counts, "element:phosphorus");

    expect(countTrace(counts, "element:carbon")).toBeGreaterThan(
      countTrace(counts, "element:sulfur"),
    );
    expect(organic).toBeGreaterThan(countTrace(counts, "element:sulfur"));
  });

  it("mountain trace rules favor iron, copper, and titanium", () => {
    const counts = traceCountsForContext({
      biome: "alpine",
      isMountain: true,
      level: TERRAIN_DEPTH_BLOCKS + 4,
      worldSeed: 515,
    });
    const mountainMetals =
      countTrace(counts, "element:iron") +
      countTrace(counts, "element:copper") +
      countTrace(counts, "element:titanium");

    expect(mountainMetals).toBeGreaterThan(0);
    expect(mountainMetals).toBeGreaterThan(
      countTrace(counts, "element:hydrogen"),
    );
  });

  it("repeat trace discovery does not duplicate item grants or notifications", () => {
    const registry = undiscoveredRegistry();
    const firstInventory = createInventorySink();
    const secondInventory = createInventorySink();
    const options = {
      discoveryContext: {
        biome: "desert" as const,
        q: 9,
        r: -4,
        level: TERRAIN_DEPTH_BLOCKS + 4,
        worldSeed: 909,
        config: { materialTraceDiscoveryChance: 1 },
      },
    };
    const first = applyMaterialDropRules(
      TerrainMaterial.Stone,
      firstInventory,
      registry,
      options,
    );
    const second = applyMaterialDropRules(
      TerrainMaterial.Stone,
      secondInventory,
      registry,
      options,
    );

    expect(first.traceMaterialIds).toHaveLength(1);
    expect(first.notifications).toHaveLength(1);
    expect(second.traceMaterialIds).toEqual([]);
    expect(second.notifications).toEqual([]);
    expect(
      secondInventory.itemDrops.filter(([itemId]) =>
        itemId.startsWith("generated-material:"),
      ),
    ).toEqual([]);
  });

  it("biome trace chance is deterministic for the same seed", () => {
    const attempts = Array.from({ length: 64 }, (_, index) => index);
    const traceSequence = attempts.map((index) => {
      const registry = undiscoveredRegistry();
      const inventory = createInventorySink();

      return applyMaterialDropRules(
        TerrainMaterial.Stone,
        inventory,
        registry,
        {
          discoveryContext: {
            biome: "desert",
            q: index,
            r: -index,
            level: TERRAIN_DEPTH_BLOCKS + 4,
            worldSeed: 512,
            config: { materialTraceDiscoveryChance: 0.5 },
          },
        },
      ).traceMaterialIds;
    });
    const repeatedTraceSequence = attempts.map((index) => {
      const registry = undiscoveredRegistry();
      const inventory = createInventorySink();

      return applyMaterialDropRules(
        TerrainMaterial.Stone,
        inventory,
        registry,
        {
          discoveryContext: {
            biome: "desert",
            q: index,
            r: -index,
            level: TERRAIN_DEPTH_BLOCKS + 4,
            worldSeed: 512,
            config: { materialTraceDiscoveryChance: 0.5 },
          },
        },
      ).traceMaterialIds;
    });

    expect(repeatedTraceSequence).toEqual(traceSequence);
    expect(traceSequence.some((traceIds) => traceIds.length > 0)).toBe(true);
    expect(traceSequence.some((traceIds) => traceIds.length === 0)).toBe(true);
  });

  it("cave affinity can discover a cave material trace", () => {
    const registry = undiscoveredRegistry();
    const inventory = createInventorySink();
    const result = applyMaterialDropRules(
      TerrainMaterial.Stone,
      inventory,
      registry,
      {
        discoveryContext: {
          isCave: true,
          q: 12,
          r: -4,
          level: TERRAIN_DEPTH_BLOCKS + 6,
          worldSeed: 91,
          config: { materialTraceDiscoveryChance: 1 },
        },
      },
    );

    expect(result.traceMaterialIds).toHaveLength(1);
    expect(["element:silicon", "element:uranium"]).toContain(
      result.traceMaterialIds[0],
    );
    expect(result.notifications[0]).toMatch(/^Found trace of /);
  });

  it("mining dynamic material returns the correct generated material item", () => {
    const registry = undiscoveredRegistry();
    const material = generatedMaterial();
    const inventory = createInventorySink();

    registry.registerGeneratedMaterial(material);

    const result = applyMaterialDropRules(
      TerrainMaterial.DynamicMaterial,
      inventory,
      registry,
      { dynamicMaterialId: material.id },
    );

    expect(result.materialItemIds).toEqual([itemIdForMaterial(material.id)]);
    expect(inventory.itemDrops).toEqual([[itemIdForMaterial(material.id), 1]]);
  });

  it("unknown dynamic material metadata is ignored safely", () => {
    const registry = undiscoveredRegistry();
    const inventory = createInventorySink();
    const result = applyMaterialDropRules(
      TerrainMaterial.DynamicMaterial,
      inventory,
      registry,
      { dynamicMaterialId: "generated:missing" },
    );

    expect(result.materialItemIds).toEqual([]);
    expect(inventory.itemDrops).toEqual([]);
  });
});
