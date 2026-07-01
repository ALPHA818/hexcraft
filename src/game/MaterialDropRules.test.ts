import { describe, expect, it } from "vitest";

import { TerrainMaterial } from "../geometry/terrainChunk.ts";
import { itemIdForMaterial, type ItemId } from "../items/ItemRegistry.ts";
import { BASE_ELEMENT_MATERIALS } from "../materials/BaseElements.ts";
import { MaterialRegistry } from "../materials/MaterialRegistry.ts";
import type { MaterialDefinition } from "../materials/MaterialTypes.ts";
import {
  applyMaterialDropRules,
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
          level: 498,
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
