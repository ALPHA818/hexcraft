import { afterEach, describe, expect, it, vi } from "vitest";

import { TerrainMaterial } from "../geometry/terrainChunk.ts";
import {
  itemDefinitionFor,
  itemIdForMaterial,
  modifiedToolItemId,
  modifiedToolRecipeId,
} from "../items/ItemRegistry.ts";
import { createItemStack } from "../items/ItemStack.ts";
import { combineMaterials } from "../materials/MaterialCombiner.ts";
import { MaterialRegistry } from "../materials/MaterialRegistry.ts";
import {
  materialVisualsForMaterial,
  UNKNOWN_MATERIAL_VISUALS,
} from "../materials/MaterialVisuals.ts";
import type { MaterialDefinition } from "../materials/MaterialTypes.ts";
import {
  applyGeneratedMaterialVisual,
  Inventory,
  inventoryVisualsForItem,
  minedDrop,
} from "./Inventory.ts";
import { MaterialStorage } from "./MaterialStorage.ts";

function createElementStub(): HTMLElement {
  return {
    addEventListener: vi.fn(),
    append: vi.fn(),
    classList: { add: vi.fn(), toggle: vi.fn() },
    replaceChildren: vi.fn(),
    style: { setProperty: vi.fn() },
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

function materialRegistry(): MaterialRegistry {
  const registry = new MaterialRegistry();

  registry.registerBaseMaterials();
  return registry;
}

function generatedMaterial(id: string, stability: number): MaterialDefinition {
  return {
    id,
    name: "Generated Block",
    generation: 1,
    parents: ["element:silicon", "element:carbon"],
    rarity: "common",
    stability,
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
    tags: ["earth"],
    discoveredAt: 1,
  };
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

  it("can add base element material items", () => {
    stubInventoryDocument();
    const registry = materialRegistry();
    const inventory = new Inventory("survival", () => {}, registry);
    const ironItemId = itemIdForMaterial("element:iron");

    expect(inventory.addItem(ironItemId, 3)).toBe(true);
    expect(inventory.countItem(ironItemId)).toBe(3);
    expect(
      inventory
        .exportState()
        .slots?.some((slot) => slot?.itemId === ironItemId && slot.count === 3),
    ).toBe(true);
  });

  it("can add generated material items and stacks them to 64", () => {
    stubInventoryDocument();
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
    const inventory = new Inventory("survival", () => {}, registry);

    expect(inventory.addItem(itemId, 65)).toBe(true);
    expect(inventory.countItem(itemId)).toBe(65);
    expect(
      inventory
        .exportState()
        .slots?.filter((slot) => slot?.itemId === itemId)
        .map((slot) => slot?.count),
    ).toEqual([64, 1]);
  });

  it("moves generated material items into material storage", () => {
    stubInventoryDocument();
    const registry = materialRegistry();
    const material = generatedMaterial("generated:stored-block", 82);
    const storage = new MaterialStorage();
    const onStorageChanged = vi.fn();

    registry.registerGeneratedMaterial(material);
    const inventory = new Inventory(
      "survival",
      () => {},
      registry,
      () => {},
      storage,
      onStorageChanged,
    );
    const itemId = itemIdForMaterial(material.id);

    expect(inventory.addItem(itemId, 3)).toBe(true);
    expect(inventory.storeGeneratedMaterialItem(itemId, 2)).toBe(true);
    expect(inventory.countItem(itemId)).toBe(1);
    expect(storage.count(material.id)).toBe(2);
    expect(onStorageChanged).toHaveBeenCalledOnce();
    expect(inventory.storeGeneratedMaterialItem("material:coal", 1)).toBe(
      false,
    );
  });

  it("renders generated material item swatches from visual data", () => {
    const registry = materialRegistry();
    const material = generatedMaterial("generated:visual-block", 82);

    registry.registerGeneratedMaterial(material);
    const item = itemDefinitionFor(itemIdForMaterial(material.id), registry);
    const element = createElementStub();
    const expected = materialVisualsForMaterial(material);

    expect(inventoryVisualsForItem(item)).toEqual(expected);
    applyGeneratedMaterialVisual(element, item);

    expect(element.classList.add).toHaveBeenCalledWith(
      "generated-material-visual",
    );
    expect(element.style.setProperty).toHaveBeenCalledWith(
      "--item-base-color",
      expected.baseColor,
    );
    expect(element.style.setProperty).toHaveBeenCalledWith(
      "--item-accent-color",
      expected.accentColor,
    );
  });

  it("uses fallback swatch visuals for unknown generated material items", () => {
    const registry = materialRegistry();
    const item = itemDefinitionFor(
      itemIdForMaterial("generated:missing-visual"),
      registry,
    );
    const element = createElementStub();

    expect(inventoryVisualsForItem(item)).toEqual(UNKNOWN_MATERIAL_VISUALS);
    applyGeneratedMaterialVisual(element, item);

    expect(element.style.setProperty).toHaveBeenCalledWith(
      "--item-base-color",
      UNKNOWN_MATERIAL_VISUALS.baseColor,
    );
    expect(element.style.setProperty).toHaveBeenCalledWith(
      "--item-accent-color",
      UNKNOWN_MATERIAL_VISUALS.accentColor,
    );
  });

  it("can visibly grant generated material items in creative mode", () => {
    stubInventoryDocument();
    const registry = materialRegistry();
    const material = generatedMaterial("generated:creative-grant", 82);

    registry.registerGeneratedMaterial(material);
    const inventory = new Inventory("creative", () => {}, registry);
    const itemId = itemIdForMaterial(material.id);

    expect(inventory.grantItem(itemId, 1)).toBe(true);
    expect(inventory.selectedItemId()).toBe(itemId);
  });

  it("assembles modified tools from a base tool and material item", () => {
    stubInventoryDocument();
    const registry = materialRegistry();
    const inventory = new Inventory("survival", () => {}, registry);
    const materialItemId = itemIdForMaterial("element:iron");
    const modifiedToolId = modifiedToolItemId("tool:pickaxe", "element:iron");

    expect(inventory.addItem(materialItemId, 1)).toBe(true);
    expect(
      inventory.craftRecipe(
        modifiedToolRecipeId("tool:pickaxe", "element:iron"),
      ),
    ).toBe(true);
    expect(inventory.countItem("tool:pickaxe")).toBe(0);
    expect(inventory.countItem(materialItemId)).toBe(0);
    expect(inventory.countItem(modifiedToolId)).toBe(1);
    expect(
      inventory
        .exportState()
        .slots?.some((slot) => slot?.itemId === modifiedToolId),
    ).toBe(true);
  });

  it("treats stabilized generated material items as placeable dynamic blocks", () => {
    stubInventoryDocument();
    const registry = materialRegistry();
    const material = generatedMaterial("generated:stable-block", 82);

    registry.registerGeneratedMaterial(material);
    const inventory = new Inventory("survival", () => {}, registry);
    const itemId = itemIdForMaterial(material.id);

    inventory.setSlot(0, { itemId, count: 1 });

    expect(inventory.selectedPlaceableMaterial()).toBe(
      TerrainMaterial.DynamicMaterial,
    );
    expect(inventory.selectedDynamicMaterialId()).toBe(material.id);
  });

  it("does not place unstable generated material items", () => {
    stubInventoryDocument();
    const registry = materialRegistry();
    const material = generatedMaterial("generated:unstable-block", 20);

    registry.registerGeneratedMaterial(material);
    const inventory = new Inventory("survival", () => {}, registry);

    inventory.setSlot(0, { itemId: itemIdForMaterial(material.id), count: 1 });

    expect(inventory.selectedPlaceableMaterial()).toBeNull();
    expect(inventory.selectedDynamicMaterialId()).toBeNull();
  });

  it("stores unknown generated material item ids safely", () => {
    stubInventoryDocument();
    const inventory = new Inventory("survival", () => {}, materialRegistry());
    const itemId = itemIdForMaterial("generated:missing");

    expect(inventory.addItem(itemId, 1)).toBe(true);
    expect(inventory.countItem(itemId)).toBe(1);
    expect(inventory.exportState().slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId,
          count: 1,
        }),
      ]),
    );
  });

  it("can save and load dynamic material item ids", () => {
    stubInventoryDocument();
    const registry = materialRegistry();
    const source = new Inventory("survival", () => {}, registry);
    const itemId = itemIdForMaterial("element:iron");

    expect(source.addItem(itemId, 7)).toBe(true);

    const state = source.exportState();
    const target = new Inventory("survival", () => {}, registry);

    target.importState(state);

    expect(target.exportState()).toEqual(state);
    expect(target.countItem(itemId)).toBe(7);
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
