import { describe, expect, it } from "vitest";

import type { ItemId } from "../items/ItemRegistry.ts";
import {
  CraftingController,
  type CraftingInventory,
} from "./CraftingController.ts";
import { recipeById, recipesForWorkbench } from "./RecipeRegistry.ts";

function createInventory(
  entries: readonly (readonly [ItemId, number])[],
  creative = false,
): CraftingInventory & Readonly<{ counts: Map<ItemId, number> }> {
  const counts = new Map<ItemId, number>(entries);

  return {
    counts,
    isCreative: () => creative,
    countItem: (itemId) =>
      creative ? Number.POSITIVE_INFINITY : (counts.get(itemId) ?? 0),
    addItem: (itemId, count) => {
      if (!creative) {
        counts.set(itemId, (counts.get(itemId) ?? 0) + count);
      }
      return true;
    },
    removeItem: (itemId, count) => {
      if (creative) {
        return true;
      }
      const available = counts.get(itemId) ?? 0;

      if (available < count) {
        return false;
      }

      counts.set(itemId, available - count);
      return true;
    },
  };
}

describe("crafting controller", () => {
  it("lists basic workbench recipes", () => {
    expect(recipesForWorkbench("basic").map((recipe) => recipe.id)).toEqual([
      "wood_to_planks",
      "planks_to_sticks",
      "wooden_pickaxe",
      "wooden_axe",
      "wooden_shovel",
      "basic_workbench",
      "metal_workbench_iron",
      "metal_workbench_copper",
      "magic_workbench",
      "organic_workbench",
      "crystal_workbench",
      "chemical_workbench",
      "assembler_workbench_iron",
      "assembler_workbench_copper",
      "element_combiner_station",
    ]);
  });

  it("disables recipes when missing ingredients", () => {
    const inventory = createInventory([]);
    const controller = new CraftingController(inventory);
    const recipe = recipeById("wood_to_planks")!;

    expect(controller.canCraft(recipe)).toBe(false);
  });

  it("crafts shapeless recipes and updates inventory", () => {
    const inventory = createInventory([["block:wood", 1]]);
    const controller = new CraftingController(inventory);

    expect(controller.craft("wood_to_planks")).toBe(true);
    expect(inventory.counts.get("block:wood")).toBe(0);
    expect(inventory.counts.get("block:planks")).toBe(4);
  });

  it("crafts material processing station block items", () => {
    const inventory = createInventory([
      ["material:crystal", 1],
      ["block:planks", 1],
      ["block:stone", 1],
    ]);
    const controller = new CraftingController(inventory);

    expect(controller.craft("element_combiner_station")).toBe(true);
    expect(inventory.counts.get("material:crystal")).toBe(0);
    expect(inventory.counts.get("block:element_combiner")).toBe(1);
  });

  it("does not consume ingredients in creative mode", () => {
    const inventory = createInventory([["block:wood", 1]], true);
    const controller = new CraftingController(inventory);

    expect(controller.craft("wood_to_planks")).toBe(true);
    expect(inventory.counts.get("block:wood")).toBe(1);
    expect(inventory.counts.get("block:planks")).toBeUndefined();
  });
});
