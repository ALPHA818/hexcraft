import { afterEach, describe, expect, it, vi } from "vitest";

import { TerrainMaterial } from "../geometry/terrainChunk.ts";
import { createItemStack } from "../items/ItemStack.ts";
import { Inventory, minedDrop } from "./Inventory.ts";

function createElementStub(): HTMLElement {
  return {
    addEventListener: vi.fn(),
    append: vi.fn(),
    classList: { add: vi.fn(), toggle: vi.fn() },
    replaceChildren: vi.fn(),
  } as unknown as HTMLElement;
}

function stubInventoryDocument(): {
  hotbar: HTMLElement;
  panel: HTMLElement;
  inventoryCounts: HTMLElement;
  recipeList: HTMLElement;
} {
  const elements = {
    hotbar: createElementStub(),
    panel: createElementStub(),
    inventoryCounts: createElementStub(),
    recipeList: createElementStub(),
  };
  const elementMap = new Map<string, HTMLElement>([
    ["#hotbar", elements.hotbar],
    ["#inventory-panel", elements.panel],
    ["#inventory-counts", elements.inventoryCounts],
    ["#inventory-recipes", elements.recipeList],
  ]);

  vi.stubGlobal("document", {
    addEventListener: vi.fn(),
    createElement: vi.fn(() => createElementStub()),
    querySelector: vi.fn((selector: string) => elementMap.get(selector)),
  });

  return elements;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("survival inventory drops", () => {
  it("turns surface blocks into placeable materials", () => {
    expect(minedDrop(TerrainMaterial.Grass)).toBe(TerrainMaterial.Dirt);
    expect(minedDrop(TerrainMaterial.AlpineRock)).toBe(TerrainMaterial.Stone);
    expect(minedDrop(TerrainMaterial.Wood)).toBe(TerrainMaterial.Wood);
  });

  it("does not collect water or leaves", () => {
    expect(minedDrop(TerrainMaterial.Water)).toBeNull();
    expect(minedDrop(TerrainMaterial.Leaves)).toBeNull();
  });

  it("shows unlimited hotbar blocks in creative mode", () => {
    const elements = stubInventoryDocument();

    const inventory = new Inventory("creative");

    expect(inventory.count(TerrainMaterial.Dirt)).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(elements.hotbar.replaceChildren).toHaveBeenCalled();
  });

  it("renders inventory recipes from recipe data", () => {
    const elements = stubInventoryDocument();

    new Inventory("survival");

    expect(elements.recipeList.replaceChildren).toHaveBeenCalled();
    expect(
      vi.mocked(elements.recipeList.replaceChildren).mock.calls.at(-1)?.length,
    ).toBeGreaterThanOrEqual(5);
  });

  it("tracks selected hotbar items as blocks or tools", () => {
    stubInventoryDocument();
    const inventory = new Inventory("survival");

    expect(inventory.selectedItemId()).toBe("block:dirt");
    expect(inventory.selectedPlaceableMaterial()).toBe(TerrainMaterial.Dirt);
    expect(inventory.selectedTool().kind).toBe("hand");

    inventory.select(1);

    expect(inventory.selectedItemId()).toBe("tool:pickaxe");
    expect(inventory.selectedPlaceableMaterial()).toBeNull();
    expect(inventory.selectedTool().kind).toBe("pickaxe");
  });

  it("decreases tool durability and removes broken tools in survival", () => {
    stubInventoryDocument();
    const inventory = new Inventory("survival");

    inventory.select(1);
    const startingDurability = inventory.selectedStack()?.durability ?? 0;

    inventory.damageSelectedTool();

    expect(inventory.selectedStack()?.durability).toBe(startingDurability - 1);

    inventory.setSlot(1, createItemStack("tool:pickaxe"));
    inventory.damageSelectedTool(startingDurability);

    expect(inventory.slot(1)).toBeNull();
  });

  it("does not damage tools in creative mode", () => {
    stubInventoryDocument();
    const inventory = new Inventory("creative");

    inventory.select(5);
    const stack = inventory.selectedStack();

    inventory.damageSelectedTool(100);

    expect(inventory.selectedStack()).toEqual(stack);
  });

  it("round-trips inventory state for saves", () => {
    stubInventoryDocument();
    const source = new Inventory("survival");

    source.add(TerrainMaterial.Wood, 3);
    source.addItem("material:raw_iron", 2);
    source.select(1);
    source.damageSelectedTool();

    const state = source.exportState();
    const target = new Inventory("survival");

    target.importState(state);

    expect(target.exportState()).toEqual(state);
    expect(target.count(TerrainMaterial.Wood)).toBe(3);
    expect(target.countItem("material:raw_iron")).toBe(2);
    expect(target.selectedTool().kind).toBe("pickaxe");
  });

  it("crafts planks, sticks, and wooden tools from recipes", () => {
    stubInventoryDocument();
    const inventory = new Inventory("survival");

    inventory.add(TerrainMaterial.Wood, 1);

    expect(inventory.craftPlanks()).toBe(true);
    expect(inventory.count(TerrainMaterial.Wood)).toBe(0);
    expect(inventory.count(TerrainMaterial.Planks)).toBe(4);

    expect(inventory.craftRecipe("planks_to_sticks")).toBe(true);
    expect(inventory.count(TerrainMaterial.Planks)).toBe(2);
    expect(inventory.countItem("material:stick")).toBe(4);

    expect(inventory.craftRecipe("wooden_shovel")).toBe(true);
    expect(inventory.count(TerrainMaterial.Planks)).toBe(1);
    expect(inventory.countItem("material:stick")).toBe(2);
    expect(
      inventory
        .exportState()
        .slots?.some((slot) => slot?.itemId === "tool:shovel"),
    ).toBe(true);
  });

  it("does not consume ingredients when crafting in creative mode", () => {
    stubInventoryDocument();
    const inventory = new Inventory("creative");
    const before = inventory.exportState();

    expect(inventory.craftRecipe("wood_to_planks")).toBe(true);
    expect(inventory.exportState()).toEqual(before);
  });
});
