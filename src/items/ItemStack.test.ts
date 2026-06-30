import { describe, expect, it } from "vitest";

import { TerrainMaterial } from "../geometry/terrainChunk.ts";
import {
  blockItemIdForMaterial,
  equippedToolForItem,
  itemDefinitionFor,
  placeableMaterialForItem,
} from "./ItemRegistry.ts";
import {
  createItemStack,
  damageToolStack,
  normalizeItemStack,
  serializeItemStack,
} from "./ItemStack.ts";

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
});
