import { describe, expect, it } from "vitest";

import { TerrainMaterial } from "../geometry/terrainChunk.ts";
import { applyMaterialDropRules } from "../game/MaterialDropRules.ts";
import { itemIdForMaterial, type ItemId } from "../items/ItemRegistry.ts";
import { MaterialRegistry } from "../materials/MaterialRegistry.ts";
import type {
  MaterialDefinition,
  MaterialStats,
} from "../materials/MaterialTypes.ts";
import { InfiniteTerrain } from "./InfiniteTerrain.ts";
import {
  dynamicMaterialBlockDisplayName,
  dynamicMaterialBlockDropItemId,
  dynamicMaterialBlockPlacement,
  dynamicMaterialVoxelKey,
  DYNAMIC_MATERIAL_BLOCK_DISPLAY_NAME,
  UNKNOWN_DYNAMIC_MATERIAL_BLOCK_DISPLAY_NAME,
} from "./DynamicMaterialBlocks.ts";
import { blockDefinitionFor } from "./blocks.ts";

const TEST_LEVEL = 535;

const BASE_STATS: MaterialStats = {
  stability: 82,
  hardness: 70,
  density: 60,
  heat: 20,
  conductivity: 20,
  toxicity: 0,
  radioactivity: 0,
  magic: 0,
  organic: 0,
  metal: 20,
  crystal: 20,
  gas: 0,
  liquid: 0,
};

function generatedMaterial(id = "generated:stable-block"): MaterialDefinition {
  return {
    id,
    name: "Embersteel",
    generation: 1,
    parents: ["element:iron", "element:carbon"],
    rarity: "uncommon",
    ...BASE_STATS,
    tags: ["metal", "fire"],
    discoveredAt: 1,
  };
}

function registryWith(material: MaterialDefinition): MaterialRegistry {
  const registry = new MaterialRegistry();

  registry.registerBaseMaterials();
  registry.registerGeneratedMaterial(material);
  return registry;
}

function inventorySink(): Readonly<{
  itemDrops: Array<readonly [ItemId, number]>;
  add: () => void;
  addItem: (itemId: ItemId, quantity: number) => boolean;
}> {
  const itemDrops: Array<readonly [ItemId, number]> = [];

  return {
    itemDrops,
    add: () => {},
    addItem: (itemId, quantity) => {
      itemDrops.push([itemId, quantity]);
      return true;
    },
  };
}

describe("dynamic material blocks", () => {
  it("registers one generic stabilized material block", () => {
    expect(blockDefinitionFor(TerrainMaterial.DynamicMaterial)).toMatchObject({
      id: "dynamic_material_block",
      displayName: DYNAMIC_MATERIAL_BLOCK_DISPLAY_NAME,
      placeable: true,
    });
  });

  it("places a dynamic material block and stores voxel metadata", () => {
    const terrain = new InfiniteTerrain(42, 4, 1);
    const material = generatedMaterial();
    const placement = dynamicMaterialBlockPlacement(material.id);
    const position = { q: 0, r: 0, level: TEST_LEVEL };

    terrain.update({ x: 0, z: 0 });
    expect(placement).not.toBeNull();
    if (!placement) {
      return;
    }

    terrain.setBlock(position, placement.material, placement.materialId);

    expect(terrain.materialAt(position.q, position.r, position.level)).toBe(
      TerrainMaterial.DynamicMaterial,
    );
    expect(terrain.dynamicMaterialIdAt(position)).toBe(material.id);
    expect(dynamicMaterialVoxelKey(position)).toBe("0,0,535");
  });

  it("mining removes metadata and returns the correct material item", () => {
    const terrain = new InfiniteTerrain(42, 4, 1);
    const material = generatedMaterial();
    const registry = registryWith(material);
    const position = { q: 0, r: 0, level: TEST_LEVEL };
    const inventory = inventorySink();

    terrain.update({ x: 0, z: 0 });
    terrain.setBlock(position, TerrainMaterial.DynamicMaterial, material.id);

    const materialId = terrain.dynamicMaterialIdAt(position);
    const result = applyMaterialDropRules(
      TerrainMaterial.DynamicMaterial,
      inventory,
      registry,
      { dynamicMaterialId: materialId },
    );

    terrain.setBlock(position, TerrainMaterial.Air);

    expect(result.materialItemIds).toEqual([itemIdForMaterial(material.id)]);
    expect(inventory.itemDrops).toEqual([[itemIdForMaterial(material.id), 1]]);
    expect(terrain.materialAt(position.q, position.r, position.level)).toBe(
      TerrainMaterial.Air,
    );
    expect(terrain.dynamicMaterialIdAt(position)).toBeNull();
  });

  it("preserves metadata through terrain edit save/load data", () => {
    const source = new InfiniteTerrain(42, 4, 1);
    const target = new InfiniteTerrain(42, 4, 1);
    const material = generatedMaterial("generated:persisted-block");
    const position = { q: 1, r: -1, level: TEST_LEVEL };

    source.update({ x: 0, z: 0 });
    source.setBlock(position, TerrainMaterial.DynamicMaterial, material.id);

    target.importTerrainEditChunks(source.exportTerrainEditChunks());

    expect(target.materialAt(position.q, position.r, position.level)).toBe(
      TerrainMaterial.DynamicMaterial,
    );
    expect(target.dynamicMaterialIdAt(position)).toBe(material.id);
  });

  it("uses material names for target display labels", () => {
    const material = generatedMaterial();
    const registry = registryWith(material);

    expect(dynamicMaterialBlockDisplayName(material.id, registry)).toBe(
      "Embersteel",
    );
    expect(dynamicMaterialBlockDisplayName(null, registry)).toBe(
      DYNAMIC_MATERIAL_BLOCK_DISPLAY_NAME,
    );
  });

  it("handles invalid metadata safely", () => {
    const registry = registryWith(generatedMaterial());

    expect(dynamicMaterialBlockDisplayName("generated:missing", registry)).toBe(
      UNKNOWN_DYNAMIC_MATERIAL_BLOCK_DISPLAY_NAME,
    );
    expect(
      dynamicMaterialBlockDropItemId("generated:missing", registry),
    ).toBeNull();
    expect(dynamicMaterialBlockPlacement("   ")).toBeNull();
  });
});
