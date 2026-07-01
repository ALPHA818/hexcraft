import { describe, expect, it } from "vitest";

import { TerrainMaterial } from "../geometry/terrainChunk.ts";
import { combineMaterials } from "../materials/MaterialCombiner.ts";
import { MaterialRegistry } from "../materials/MaterialRegistry.ts";
import {
  blockItemIdForMaterial,
  equippedToolForItem,
  isGeneratedMaterialItemId,
  itemIdForMaterial,
  itemDefinitionFor,
  materialIdFromItemId,
  placeableMaterialForItem,
} from "./ItemRegistry.ts";
import {
  createItemStack,
  damageToolStack,
  normalizeItemStack,
  serializeItemStack,
} from "./ItemStack.ts";

function materialRegistry(): MaterialRegistry {
  const registry = new MaterialRegistry();

  registry.registerBaseMaterials();
  return registry;
}

describe("item stacks", () => {
  it("creates block and tool stacks", () => {
    const dirt = createItemStack("block:dirt", 8);
    const pickaxe = createItemStack("tool:pickaxe");
    const pickaxeDefinition = itemDefinitionFor("tool:pickaxe");

    expect(dirt).toEqual({ itemId: "block:dirt", count: 8 });
    expect(pickaxe.count).toBe(1);
    expect(pickaxe.durability).toBe(
      pickaxeDefinition?.kind === "tool"
        ? pickaxeDefinition.maxDurability
        : undefined,
    );
  });

  it("serializes and normalizes item stacks", () => {
    const stack = createItemStack("block:stone", 12);

    expect(normalizeItemStack(serializeItemStack(stack))).toEqual(stack);
    expect(normalizeItemStack({ itemId: "missing:item", count: 1 })).toBeNull();
  });

  it("damages tools and removes broken tools", () => {
    const pickaxe = createItemStack("tool:pickaxe");
    const damaged = damageToolStack(pickaxe, 1);

    expect(damaged?.durability).toBe((pickaxe.durability ?? 0) - 1);
    expect(damageToolStack(pickaxe, pickaxe.durability ?? 1)).toBeNull();
  });

  it("distinguishes placeable blocks from tools", () => {
    expect(blockItemIdForMaterial(TerrainMaterial.Dirt)).toBe("block:dirt");
    expect(placeableMaterialForItem("block:dirt")).toBe(TerrainMaterial.Dirt);
    expect(placeableMaterialForItem("tool:pickaxe")).toBeNull();
    expect(equippedToolForItem("tool:pickaxe").kind).toBe("pickaxe");
    expect(equippedToolForItem("block:dirt").kind).toBe("hand");
  });

  it("creates raw ore material stacks", () => {
    expect(createItemStack("material:coal", 3)).toEqual({
      itemId: "material:coal",
      count: 3,
    });
    expect(itemDefinitionFor("material:raw_iron")?.displayName).toBe(
      "Raw Iron",
    );
    expect(placeableMaterialForItem("material:crystal")).toBeNull();
  });

  it("creates base element material item stacks with registry lookup", () => {
    const registry = materialRegistry();
    const itemId = itemIdForMaterial("element:iron");
    const stack = createItemStack(itemId, 5, registry);

    expect(isGeneratedMaterialItemId(itemId)).toBe(true);
    expect(materialIdFromItemId(itemId)).toBe("element:iron");
    expect(stack).toEqual({ itemId, count: 5 });
    expect(itemDefinitionFor(itemId, registry)).toMatchObject({
      kind: "generated_material",
      displayName: "Iron",
      shortName: "Iron",
      maxStackSize: 64,
      placeable: false,
    });
  });

  it("creates generated material item stacks that cap at 64", () => {
    const registry = materialRegistry();
    const iron = registry.getMaterialById("element:iron");
    const carbon = registry.getMaterialById("element:carbon");

    expect(iron).not.toBeNull();
    expect(carbon).not.toBeNull();
    if (!iron || !carbon) {
      return;
    }

    const result = combineMaterials(iron, carbon, registry);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const itemId = itemIdForMaterial(result.material.id);
    const stack = createItemStack(itemId, 99, registry);

    expect(stack.count).toBe(64);
    expect(itemDefinitionFor(itemId, registry)?.displayName).toBe(
      result.material.name,
    );
    expect(normalizeItemStack(serializeItemStack(stack), registry)).toEqual(
      stack,
    );
  });

  it("handles unknown generated material item ids cleanly", () => {
    const registry = materialRegistry();
    const itemId = itemIdForMaterial("generated:missing");

    expect(itemDefinitionFor(itemId, registry)).toBeNull();
    expect(normalizeItemStack({ itemId, count: 1 }, registry)).toBeNull();
    expect(materialIdFromItemId("material:coal")).toBeNull();
  });
});
