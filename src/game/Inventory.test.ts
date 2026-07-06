import { afterEach, describe, expect, it, vi } from "vitest";

import { TerrainMaterial } from "../geometry/terrainChunk.ts";
import {
  ITEM_DEFINITIONS,
  itemDefinitionFor,
  itemIdForMaterial,
  modifiedToolItemId,
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
    setAttribute: vi.fn(),
    style: { setProperty: vi.fn() },
    title: "",
    tabIndex: 0,
  } as unknown as HTMLElement;
}

function stubInventoryDocument(): {
  hotbar: HTMLElement;
  panel: HTMLElement;
  inventoryCounts: HTMLElement;
  inventoryActions: HTMLElement;
  heldStackPreview: HTMLElement;
  createdElements: HTMLElement[];
} {
  const createdElements: HTMLElement[] = [];
  const elements = {
    hotbar: createElementStub(),
    panel: createElementStub(),
    inventoryCounts: createElementStub(),
    inventoryActions: createElementStub(),
    heldStackPreview: createElementStub(),
  };
  const elementMap = new Map<string, HTMLElement>([
    ["#hotbar", elements.hotbar],
    ["#inventory-panel", elements.panel],
    ["#inventory-counts", elements.inventoryCounts],
    ["#inventory-actions", elements.inventoryActions],
    ["#inventory-cursor-stack", elements.heldStackPreview],
  ]);

  vi.stubGlobal("document", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    body: {
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
        toggle: vi.fn(),
      },
    },
    createElement: vi.fn(() => {
      const element = createElementStub();

      createdElements.push(element);
      return element;
    }),
    exitPointerLock: vi.fn(),
    pointerLockElement: null,
    querySelector: vi.fn((selector: string) => elementMap.get(selector)),
  });

  return { ...elements, createdElements };
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

function allSavedStacks(state: ReturnType<Inventory["exportState"]>) {
  return [...(state.hotbar ?? []), ...(state.backpack ?? [])];
}

function stackCountsFor(
  state: ReturnType<Inventory["exportState"]>,
  itemId: string,
): readonly number[] {
  return allSavedStacks(state)
    .filter((slot) => slot?.itemId === itemId)
    .map((slot) => slot?.count ?? 0);
}

function lastReplaceChildrenArgs(element: HTMLElement): readonly HTMLElement[] {
  return (vi.mocked(element.replaceChildren).mock.calls.at(-1) ??
    []) as unknown as readonly HTMLElement[];
}

function actionLabels(element: HTMLElement): readonly string[] {
  return lastReplaceChildrenArgs(element).map(
    (child) => child.textContent ?? "",
  );
}

function inventoryContainerGrid(
  elements: readonly HTMLElement[],
  label: string,
): HTMLElement | null {
  const container = elements.find((element) =>
    element.className.includes(`inventory-container-${label.toLowerCase()}`),
  );
  const appendArgs = container
    ? (vi.mocked(container.append).mock.calls.at(-1) ?? [])
    : [];

  return (appendArgs[1] as HTMLElement | undefined) ?? null;
}

function dispatchInventoryKey(event: Partial<KeyboardEvent>): void {
  const handler = vi
    .mocked(document.addEventListener)
    .mock.calls.find(([type]) => type === "keydown")?.[1] as
    ((event: KeyboardEvent) => void) | undefined;

  expect(handler).toBeTypeOf("function");
  handler?.({
    key: "",
    repeat: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...event,
  } as KeyboardEvent);
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

  it("new survival inventory has 9 hotbar slots and 27 backpack slots", () => {
    stubInventoryDocument();

    const inventory = new Inventory("survival");
    const state = inventory.exportState();

    expect(state.hotbar).toHaveLength(9);
    expect(state.backpack).toHaveLength(27);
  });

  it("new creative inventory has the same slot counts", () => {
    const elements = stubInventoryDocument();

    const inventory = new Inventory("creative");
    const state = inventory.exportState();

    expect(state.hotbar).toHaveLength(9);
    expect(state.backpack).toHaveLength(27);
    expect(elements.hotbar.replaceChildren).toHaveBeenCalled();
  });

  it("creative inventory does not automatically own every item definition", () => {
    stubInventoryDocument();
    const inventory = new Inventory("creative");

    expect(inventory.creativeCatalogItems()).toHaveLength(
      ITEM_DEFINITIONS.length,
    );
    expect(inventory.count(TerrainMaterial.Dirt)).toBe(0);
    expect(inventory.countItem("tool:pickaxe")).toBe(0);
  });

  it("survival inventory does not automatically own permanent blocks", () => {
    stubInventoryDocument();
    const inventory = new Inventory("survival");

    expect(inventory.count(TerrainMaterial.Dirt)).toBe(0);
    expect(inventory.count(TerrainMaterial.Stone)).toBe(0);
    expect(inventory.count(TerrainMaterial.Wood)).toBe(0);
    expect(inventory.count(TerrainMaterial.Planks)).toBe(0);
    expect(inventory.count(TerrainMaterial.Sand)).toBe(0);
  });

  it("inventory renders backpack and hotbar slot grids", () => {
    const elements = stubInventoryDocument();

    new Inventory("survival");

    const containers = lastReplaceChildrenArgs(elements.inventoryCounts);
    const hotbarGrid = inventoryContainerGrid(containers, "Hotbar");
    const backpackGrid = inventoryContainerGrid(containers, "Backpack");

    expect(hotbarGrid).not.toBeNull();
    expect(backpackGrid).not.toBeNull();
    expect(
      vi.mocked(hotbarGrid?.replaceChildren ?? vi.fn()).mock.calls.at(-1)
        ?.length,
    ).toBe(9);
    expect(
      vi.mocked(backpackGrid?.replaceChildren ?? vi.fn()).mock.calls.at(-1)
        ?.length,
    ).toBe(27);
  });

  it("recipe list is no longer rendered in inventory", () => {
    const elements = stubInventoryDocument();

    new Inventory("survival");

    expect(actionLabels(elements.inventoryActions)).not.toContain(
      "Material Combiner",
    );
    expect(actionLabels(elements.inventoryActions)).not.toContain(
      "Wood Planks",
    );
    expect(lastReplaceChildrenArgs(elements.inventoryActions)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          className: expect.stringContaining("recipe"),
        }),
      ]),
    );
  });

  it("creative catalog button appears only in creative", () => {
    const creativeElements = stubInventoryDocument();

    new Inventory("creative");

    expect(actionLabels(creativeElements.inventoryActions)).toContain(
      "Creative Catalog",
    );

    vi.unstubAllGlobals();

    const survivalElements = stubInventoryDocument();

    new Inventory("survival");

    expect(actionLabels(survivalElements.inventoryActions)).not.toContain(
      "Creative Catalog",
    );
  });

  it("material storage button appears when storage exists", () => {
    const elements = stubInventoryDocument();

    new Inventory(
      "survival",
      () => {},
      null,
      new MaterialStorage(),
      () => {},
      () => {},
    );

    expect(actionLabels(elements.inventoryActions)).toContain(
      "Material Storage",
    );
  });

  it("filter blocks shows block stacks from the backpack", () => {
    stubInventoryDocument();
    const inventory = new Inventory("creative");

    inventory.setBackpackSlot(0, createItemStack("block:dirt", 4));
    inventory.setBackpackSlot(1, createItemStack("tool:pickaxe"));
    inventory.setBackpackSlot(2, createItemStack("material:coal", 2));
    inventory.setBackpackFilter("blocks");

    expect(
      inventory.visibleBackpackStacks().map(({ stack }) => stack.itemId),
    ).toEqual(["block:dirt"]);
  });

  it("filter tools shows tool stacks from the backpack", () => {
    stubInventoryDocument();
    const inventory = new Inventory("creative");

    inventory.setBackpackSlot(0, createItemStack("block:stone", 4));
    inventory.setBackpackSlot(1, createItemStack("tool:axe"));
    inventory.setBackpackSlot(2, createItemStack("material:stick", 8));
    inventory.setBackpackFilter("tools");

    expect(
      inventory.visibleBackpackStacks().map(({ stack }) => stack.itemId),
    ).toEqual(["tool:axe"]);
  });

  it("filter generated materials uses dynamic material items", () => {
    stubInventoryDocument();
    const registry = materialRegistry();
    const material = generatedMaterial("generated:filter-crystal", 82);
    const generatedItemId = itemIdForMaterial(material.id);
    const inventory = new Inventory("creative", () => {}, registry);

    registry.registerGeneratedMaterial(material);
    inventory.setBackpackSlot(0, createItemStack("material:crystal", 1));
    inventory.setBackpackSlot(1, { itemId: generatedItemId, count: 3 });
    inventory.setBackpackFilter("generated-materials");

    expect(
      inventory.visibleBackpackStacks().map(({ stack }) => stack.itemId),
    ).toEqual([generatedItemId]);
  });

  it("searches backpack items by name and id", () => {
    stubInventoryDocument();
    const inventory = new Inventory("creative");

    inventory.setBackpackSlot(0, createItemStack("material:coal", 6));
    inventory.setBackpackSlot(1, createItemStack("material:raw_iron", 2));

    inventory.setBackpackSearch("raw iron");
    expect(
      inventory.visibleBackpackStacks().map(({ stack }) => stack.itemId),
    ).toEqual(["material:raw_iron"]);

    inventory.setBackpackSearch("material:coal");
    expect(
      inventory.visibleBackpackStacks().map(({ stack }) => stack.itemId),
    ).toEqual(["material:coal"]);
  });

  it("sorts backpack stacks by name", () => {
    stubInventoryDocument();
    const inventory = new Inventory("creative");

    inventory.setBackpackSlot(0, createItemStack("material:raw_iron", 1));
    inventory.setBackpackSlot(1, createItemStack("block:dirt", 1));
    inventory.setBackpackSlot(2, createItemStack("material:coal", 1));

    inventory.setBackpackSortMode("name");
    expect(inventory.sortBackpack()).toBe(true);

    expect(inventory.backpackSlot(0)?.itemId).toBe("material:coal");
    expect(inventory.backpackSlot(1)?.itemId).toBe("block:dirt");
    expect(inventory.backpackSlot(2)?.itemId).toBe("material:raw_iron");
  });

  it("sorts backpack stacks by count", () => {
    stubInventoryDocument();
    const inventory = new Inventory("creative");

    inventory.setBackpackSlot(0, createItemStack("block:dirt", 2));
    inventory.setBackpackSlot(1, createItemStack("material:coal", 12));
    inventory.setBackpackSlot(2, createItemStack("material:stick", 5));

    inventory.setBackpackSortMode("count");
    expect(inventory.sortBackpack()).toBe(true);

    expect(inventory.backpackSlot(0)).toMatchObject({
      itemId: "material:coal",
      count: 12,
    });
    expect(inventory.backpackSlot(1)).toMatchObject({
      itemId: "material:stick",
      count: 5,
    });
    expect(inventory.backpackSlot(2)).toMatchObject({
      itemId: "block:dirt",
      count: 2,
    });
  });

  it("sorting the backpack leaves the hotbar unchanged", () => {
    stubInventoryDocument();
    const inventory = new Inventory("creative");

    inventory.setSlot(0, createItemStack("block:stone", 9));
    inventory.setSlot(1, createItemStack("tool:pickaxe"));
    inventory.setBackpackSlot(0, createItemStack("material:raw_iron", 1));
    inventory.setBackpackSlot(1, createItemStack("material:coal", 1));

    inventory.setBackpackSortMode("name");
    inventory.sortBackpack();

    expect(inventory.slot(0)).toMatchObject({
      itemId: "block:stone",
      count: 9,
    });
    expect(inventory.slot(1)).toMatchObject({
      itemId: "tool:pickaxe",
      count: 1,
    });
    expect(inventory.backpackSlot(0)?.itemId).toBe("material:coal");
  });

  it("opening inventory notifies panel state without owning pointer lock", () => {
    const elements = stubInventoryDocument();
    const onOpenChange = vi.fn();
    const inventory = new Inventory("survival", onOpenChange);

    Object.defineProperty(document, "pointerLockElement", {
      configurable: true,
      value: elements.hotbar,
    });

    inventory.toggle();

    expect(document.exitPointerLock).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(elements.panel.hidden).toBe(false);
  });

  it("Escape closes inventory", () => {
    const elements = stubInventoryDocument();
    const onOpenChange = vi.fn();
    const inventory = new Inventory("survival", onOpenChange);

    inventory.toggle();
    dispatchInventoryKey({ code: "Escape" });

    expect(elements.panel.hidden).toBe(true);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("tracks selected hotbar items as blocks or tools", () => {
    stubInventoryDocument();
    const inventory = new Inventory("survival");

    expect(inventory.selectedItemId()).toBe("tool:pickaxe");
    expect(inventory.selectedPlaceableMaterial()).toBeNull();
    expect(inventory.selectedTool().kind).toBe("pickaxe");

    inventory.setSlot(4, createItemStack("block:dirt", 4));
    inventory.select(4);

    expect(inventory.selectedItemId()).toBe("block:dirt");
    expect(inventory.selectedPlaceableMaterial()).toBe(TerrainMaterial.Dirt);
    expect(inventory.selectedTool().kind).toBe("hand");
  });

  it("selected item comes from hotbar only", () => {
    stubInventoryDocument();
    const inventory = new Inventory("creative");

    inventory.setBackpackSlot(0, createItemStack("block:dirt", 1));

    expect(inventory.selectedItemId()).toBeNull();
    expect(inventory.selectedStackCount()).toBe(0);
    expect(inventory.selectedPlaceableMaterial()).toBeNull();

    inventory.setSlot(0, createItemStack("tool:pickaxe", 1));

    expect(inventory.selectedItemId()).toBe("tool:pickaxe");
  });

  it("consumes only the selected hotbar stack for placement", () => {
    stubInventoryDocument();
    const inventory = new Inventory("survival");

    inventory.setSlot(4, createItemStack("block:dirt", 2));
    inventory.setBackpackSlot(0, createItemStack("block:dirt", 9));
    inventory.select(4);

    expect(inventory.consumeSelectedStack()).toBe(true);
    expect(inventory.slot(4)).toMatchObject({
      itemId: "block:dirt",
      count: 1,
    });
    expect(inventory.backpackSlot(0)).toMatchObject({
      itemId: "block:dirt",
      count: 9,
    });
  });

  it("does not consume selected stacks in creative placement", () => {
    stubInventoryDocument();
    const inventory = new Inventory("creative");

    inventory.setSlot(0, createItemStack("block:stone", 3));

    expect(inventory.consumeSelectedStack()).toBe(true);
    expect(inventory.slot(0)).toMatchObject({
      itemId: "block:stone",
      count: 3,
    });
  });

  it("can restore a consumed selected placement stack", () => {
    stubInventoryDocument();
    const inventory = new Inventory("survival");

    inventory.setSlot(0, createItemStack("block:planks", 1));

    expect(inventory.consumeSelectedStack()).toBe(true);
    expect(inventory.slot(0)).toBeNull();
    expect(inventory.restoreSelectedStackItem("block:planks")).toBe(true);
    expect(inventory.slot(0)).toMatchObject({
      itemId: "block:planks",
      count: 1,
    });
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
    source.select(0);
    source.damageSelectedTool();

    const state = source.exportState();
    const target = new Inventory("survival");

    target.importState(state);

    expect(target.exportState()).toEqual(state);
    expect(target.count(TerrainMaterial.Wood)).toBe(3);
    expect(target.countItem("material:raw_iron")).toBe(2);
    expect(target.selectedTool().kind).toBe("pickaxe");
  });

  it("addItem fills existing stacks first", () => {
    stubInventoryDocument();
    const inventory = new Inventory("survival");

    inventory.setSlot(4, createItemStack("material:coal", 60));

    expect(inventory.addItem("material:coal", 10)).toBe(true);
    expect(inventory.slot(4)).toMatchObject({
      itemId: "material:coal",
      count: 64,
    });
    expect(
      [...stackCountsFor(inventory.exportState(), "material:coal")].sort(
        (a, b) => b - a,
      ),
    ).toEqual([64, 6]);
  });

  it("addItem fills hotbar and backpack empty slots", () => {
    stubInventoryDocument();
    const inventory = new Inventory("survival");

    expect(inventory.addItem("tool:shears", 8)).toBe(true);

    expect(
      inventory.exportState().hotbar?.filter((slot) => slot !== null),
    ).toHaveLength(9);
    expect(inventory.backpackSlot(0)?.itemId).toBe("tool:shears");
    expect(inventory.backpackSlot(1)?.itemId).toBe("tool:shears");
  });

  it("removeItem removes from hotbar and backpack", () => {
    stubInventoryDocument();
    const inventory = new Inventory("survival");

    inventory.addItem("tool:shears", 8);

    expect(inventory.removeItem("tool:shears", 7)).toBe(true);
    expect(inventory.countItem("tool:shears")).toBe(1);
    expect(inventory.backpackSlot(1)?.itemId).toBe("tool:shears");
  });

  it("moves a stack from backpack to hotbar", () => {
    stubInventoryDocument();
    const inventory = new Inventory("creative");

    inventory.setBackpackSlot(0, createItemStack("block:dirt", 12));

    expect(inventory.interactWithSlot("backpack", 0)).toBe(true);
    expect(inventory.heldStack()).toMatchObject({
      itemId: "block:dirt",
      count: 12,
    });
    expect(inventory.backpackSlot(0)).toBeNull();

    expect(inventory.interactWithSlot("hotbar", 2)).toBe(true);
    expect(inventory.heldStack()).toBeNull();
    expect(inventory.slot(2)).toMatchObject({
      itemId: "block:dirt",
      count: 12,
    });
  });

  it("moves a stack from hotbar to backpack", () => {
    stubInventoryDocument();
    const inventory = new Inventory("creative");

    inventory.setSlot(0, createItemStack("block:stone", 7));

    expect(inventory.interactWithSlot("hotbar", 0)).toBe(true);
    expect(inventory.slot(0)).toBeNull();
    expect(inventory.interactWithSlot("backpack", 3)).toBe(true);

    expect(inventory.heldStack()).toBeNull();
    expect(inventory.backpackSlot(3)).toMatchObject({
      itemId: "block:stone",
      count: 7,
    });
  });

  it("merges compatible stacks", () => {
    stubInventoryDocument();
    const inventory = new Inventory("creative");

    inventory.setSlot(0, createItemStack("material:coal", 60));
    inventory.setBackpackSlot(0, createItemStack("material:coal", 10));

    expect(inventory.interactWithSlot("backpack", 0)).toBe(true);
    expect(inventory.interactWithSlot("hotbar", 0)).toBe(true);

    expect(inventory.slot(0)).toMatchObject({
      itemId: "material:coal",
      count: 64,
    });
    expect(inventory.heldStack()).toMatchObject({
      itemId: "material:coal",
      count: 6,
    });

    expect(inventory.interactWithSlot("backpack", 1)).toBe(true);
    expect(inventory.backpackSlot(1)).toMatchObject({
      itemId: "material:coal",
      count: 6,
    });
    expect(inventory.heldStack()).toBeNull();
  });

  it("splits a stack with right click", () => {
    stubInventoryDocument();
    const inventory = new Inventory("creative");

    inventory.setBackpackSlot(0, createItemStack("block:planks", 9));

    expect(
      inventory.interactWithSlot("backpack", 0, {
        button: 2,
      }),
    ).toBe(true);

    expect(inventory.backpackSlot(0)).toMatchObject({
      itemId: "block:planks",
      count: 4,
    });
    expect(inventory.heldStack()).toMatchObject({
      itemId: "block:planks",
      count: 5,
    });
  });

  it("shift-click moves a stack between backpack and hotbar", () => {
    stubInventoryDocument();
    const inventory = new Inventory("creative");

    inventory.setBackpackSlot(0, createItemStack("block:sand", 8));

    expect(
      inventory.interactWithSlot("backpack", 0, {
        shiftKey: true,
      }),
    ).toBe(true);

    expect(inventory.backpackSlot(0)).toBeNull();
    expect(inventory.slot(0)).toMatchObject({
      itemId: "block:sand",
      count: 8,
    });

    expect(
      inventory.interactWithSlot("hotbar", 0, {
        shiftKey: true,
      }),
    ).toBe(true);
    expect(inventory.slot(0)).toBeNull();
    expect(inventory.backpackSlot(0)).toMatchObject({
      itemId: "block:sand",
      count: 8,
    });
  });

  it("tools do not stack when moved onto another tool", () => {
    stubInventoryDocument();
    const inventory = new Inventory("creative");

    inventory.setSlot(0, {
      itemId: "tool:pickaxe",
      count: 1,
      durability: 10,
    });
    inventory.setBackpackSlot(0, {
      itemId: "tool:pickaxe",
      count: 1,
      durability: 20,
    });

    expect(inventory.interactWithSlot("backpack", 0)).toBe(true);
    expect(inventory.interactWithSlot("hotbar", 0)).toBe(true);

    expect(inventory.slot(0)).toMatchObject({
      itemId: "tool:pickaxe",
      count: 1,
      durability: 20,
    });
    expect(inventory.heldStack()).toMatchObject({
      itemId: "tool:pickaxe",
      count: 1,
      durability: 10,
    });
  });

  it("generated material stacks merge correctly", () => {
    stubInventoryDocument();
    const registry = materialRegistry();
    const itemId = itemIdForMaterial("element:iron");
    const inventory = new Inventory("creative", () => {}, registry);

    inventory.setSlot(0, createItemStack(itemId, 60, registry));
    inventory.setBackpackSlot(0, createItemStack(itemId, 10, registry));

    expect(inventory.interactWithSlot("backpack", 0)).toBe(true);
    expect(inventory.interactWithSlot("hotbar", 0)).toBe(true);

    expect(inventory.slot(0)).toMatchObject({
      itemId,
      count: 64,
    });
    expect(inventory.heldStack()).toMatchObject({
      itemId,
      count: 6,
    });
  });

  it("modified tools remain unique and do not stack", () => {
    stubInventoryDocument();
    const registry = materialRegistry();
    const itemId = modifiedToolItemId("tool:pickaxe", "element:iron");
    const inventory = new Inventory("creative", () => {}, registry);

    inventory.setSlot(0, {
      itemId,
      count: 1,
      durability: 12,
    });
    inventory.setBackpackSlot(0, {
      itemId,
      count: 1,
      durability: 24,
    });

    expect(inventory.interactWithSlot("backpack", 0)).toBe(true);
    expect(inventory.interactWithSlot("hotbar", 0)).toBe(true);

    expect(inventory.slot(0)).toMatchObject({
      itemId,
      count: 1,
      durability: 24,
    });
    expect(inventory.heldStack()).toMatchObject({
      itemId,
      count: 1,
      durability: 12,
    });
  });

  it("renders a cursor-held stack visual", () => {
    const elements = stubInventoryDocument();
    const inventory = new Inventory("creative");

    inventory.setBackpackSlot(0, createItemStack("block:dirt", 3));
    inventory.interactWithSlot("backpack", 0);

    expect(elements.heldStackPreview.hidden).toBe(false);
    expect(elements.heldStackPreview.replaceChildren).toHaveBeenCalled();
  });

  it("returns held stacks safely when closing inventory", () => {
    const elements = stubInventoryDocument();
    const inventory = new Inventory("creative");

    inventory.setBackpackSlot(0, createItemStack("block:dirt", 11));
    inventory.toggle();
    inventory.interactWithSlot("backpack", 0);

    expect(inventory.heldStack()).toMatchObject({
      itemId: "block:dirt",
      count: 11,
    });

    inventory.hide();

    expect(inventory.heldStack()).toBeNull();
    expect(inventory.backpackSlot(0)).toMatchObject({
      itemId: "block:dirt",
      count: 11,
    });
    expect(elements.panel.hidden).toBe(true);
  });

  it("old save with slots migrates into the new hotbar", () => {
    stubInventoryDocument();
    const inventory = new Inventory("creative");

    inventory.importState({
      selectedIndex: 1,
      slots: [
        { itemId: "block:dirt", count: 5 },
        { itemId: "tool:pickaxe", count: 1 },
      ],
    });

    expect(inventory.exportState().selectedHotbarIndex).toBe(1);
    expect(inventory.slot(0)).toMatchObject({
      itemId: "block:dirt",
      count: 5,
    });
    expect(inventory.selectedItemId()).toBe("tool:pickaxe");
    expect(inventory.exportState().backpack).toEqual(
      Array.from({ length: 27 }, () => null),
    );
  });

  it("old save with terrain material counts migrates safely", () => {
    stubInventoryDocument();
    const inventory = new Inventory("creative");

    inventory.importState({
      selectedIndex: 0,
      items: [{ material: TerrainMaterial.Dirt, count: 3 }],
    });

    expect(inventory.count(TerrainMaterial.Dirt)).toBe(3);
    expect(inventory.slot(0)).toMatchObject({
      itemId: "block:dirt",
      count: 3,
    });
  });

  it("can add base element material items", () => {
    stubInventoryDocument();
    const registry = materialRegistry();
    const inventory = new Inventory("survival", () => {}, registry);
    const ironItemId = itemIdForMaterial("element:iron");

    expect(inventory.addItem(ironItemId, 3)).toBe(true);
    expect(inventory.countItem(ironItemId)).toBe(3);
    expect(
      allSavedStacks(inventory.exportState()).some(
        (slot) => slot?.itemId === ironItemId && slot.count === 3,
      ),
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
    expect(stackCountsFor(inventory.exportState(), itemId)).toEqual([64, 1]);
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

  it("generated material swatch still appears in rendered slots", () => {
    const elements = stubInventoryDocument();
    const registry = materialRegistry();
    const material = generatedMaterial("generated:rendered-visual", 82);

    registry.registerGeneratedMaterial(material);
    const inventory = new Inventory("survival", () => {}, registry);

    inventory.setSlot(0, {
      itemId: itemIdForMaterial(material.id),
      count: 1,
    });

    const renderedSlot = lastReplaceChildrenArgs(elements.hotbar)[0];

    expect(renderedSlot?.classList.add).toHaveBeenCalledWith(
      "generated-material-visual",
    );
    expect(renderedSlot?.style.setProperty).toHaveBeenCalledWith(
      "--item-base-color",
      materialVisualsForMaterial(material).baseColor,
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
    expect(allSavedStacks(inventory.exportState())).toEqual(
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

  it("does not expose crafting methods on inventory", () => {
    stubInventoryDocument();
    const inventory = new Inventory("survival");

    expect("craftRecipe" in inventory).toBe(false);
    expect("craftPlanks" in inventory).toBe(false);
  });
});
