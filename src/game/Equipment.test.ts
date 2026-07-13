import { describe, expect, it, vi, afterEach } from "vitest";

import {
  itemDefinitionFor,
  placeableMaterialForItem,
  type ItemId,
} from "../items/ItemRegistry.ts";
import { MemorySaveDatabase } from "../save/SaveDatabase.ts";
import { WorldSaveManager } from "../save/WorldSaveManager.ts";
import { getDefaultGameSettings } from "./GameSettings.ts";
import { Inventory } from "./Inventory.ts";
import {
  Equipment,
  type EquipmentInventory,
  type EquipmentSlotId,
} from "./Equipment.ts";

class TestEquipmentInventory implements EquipmentInventory {
  readonly counts = new Map<ItemId, number>();

  countItem(itemId: ItemId): number {
    return this.counts.get(itemId) ?? 0;
  }

  addItem(itemId: ItemId, count = 1): boolean {
    this.counts.set(itemId, this.countItem(itemId) + count);
    return true;
  }

  grantItem(itemId: ItemId, count = 1): boolean {
    return this.addItem(itemId, count);
  }

  removeItem(itemId: ItemId, count = 1): boolean {
    const available = this.countItem(itemId);

    if (available < count) {
      return false;
    }

    this.counts.set(itemId, available - count);
    return true;
  }

  set(itemId: ItemId, count: number): void {
    this.counts.set(itemId, count);
  }
}

function equipOrThrow(
  equipment: Equipment,
  slotId: EquipmentSlotId,
  itemId: ItemId,
  inventory: TestEquipmentInventory,
): void {
  if (!equipment.equipFromInventory(slotId, itemId, inventory)) {
    throw new Error(`Could not equip ${itemId}`);
  }
}

function createElementStub(): HTMLElement {
  return {
    addEventListener: vi.fn(),
    append: vi.fn(),
    classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
    replaceChildren: vi.fn(),
    setAttribute: vi.fn(),
    style: { setProperty: vi.fn() },
    title: "",
    tabIndex: 0,
  } as unknown as HTMLElement;
}

function stubInventoryDocument(): HTMLElement {
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
    createElement: vi.fn(() => createElementStub()),
    querySelector: vi.fn((selector: string) => elementMap.get(selector)),
  });

  return elements.inventoryActions;
}

function latestInventoryActionButtons(
  inventoryActions: HTMLElement,
): readonly HTMLButtonElement[] {
  return (vi.mocked(inventoryActions.replaceChildren).mock.calls.at(-1) ??
    []) as unknown as readonly HTMLButtonElement[];
}

function click(button: HTMLButtonElement): void {
  const listener = vi
    .mocked(button.addEventListener)
    .mock.calls.find(([type]) => type === "click")?.[1] as
    (() => void) | undefined;

  listener?.();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("equipment", () => {
  it("equips a valid item", () => {
    const inventory = new TestEquipmentInventory();
    const equipment = new Equipment();

    inventory.set("equipment:gloves", 1);

    expect(
      equipment.equipFromInventory("hands", "equipment:gloves", inventory),
    ).toBe(true);
    expect(equipment.slot("hands")?.itemId).toBe("equipment:gloves");
    expect(inventory.countItem("equipment:gloves")).toBe(0);
  });

  it("rejects invalid items", () => {
    const inventory = new TestEquipmentInventory();
    const equipment = new Equipment();

    inventory.set("tool:pickaxe", 1);
    inventory.set("equipment:goggles", 1);

    expect(
      equipment.equipFromInventory("hands", "tool:pickaxe", inventory),
    ).toBe(false);
    expect(
      equipment.equipFromInventory("hands", "equipment:goggles", inventory),
    ).toBe(false);
    expect(equipment.slot("hands")).toBeNull();
    expect(inventory.countItem("tool:pickaxe")).toBe(1);
    expect(inventory.countItem("equipment:goggles")).toBe(1);
  });

  it("keeps equipment items non-placeable", () => {
    expect(itemDefinitionFor("equipment:gloves")).toMatchObject({
      kind: "equipment",
      placeable: false,
    });
    expect(placeableMaterialForItem("equipment:gloves")).toBeNull();
  });

  it("unequips back into inventory", () => {
    const inventory = new TestEquipmentInventory();
    const equipment = new Equipment();

    inventory.set("equipment:respirator", 1);
    equipOrThrow(equipment, "head", "equipment:respirator", inventory);

    expect(equipment.unequipToInventory("head", inventory)).toBe(true);
    expect(equipment.slot("head")).toBeNull();
    expect(inventory.countItem("equipment:respirator")).toBe(1);
  });

  it("persists after save/load", async () => {
    const database = new MemorySaveDatabase();
    const manager = new WorldSaveManager(database);
    const save = await manager.createWorld(getDefaultGameSettings(), 1000);
    const inventory = new TestEquipmentInventory();
    const equipment = new Equipment();

    inventory.set("equipment:backpack", 1);
    equipOrThrow(equipment, "back", "equipment:backpack", inventory);

    await manager.saveWorld(
      {
        metadata: save.metadata,
        player: save.runtime.player,
        inventory: save.runtime.inventory,
        equipment: equipment.serialize(),
        materialCodex: save.runtime.materialCodex,
        materialStorage: save.runtime.materialStorage,
        gameTime: save.runtime.gameTime,
        terrainEditChunks: [],
      },
      2000,
    );

    const loaded = await manager.loadWorld(save.metadata.id);
    const loadedEquipment = new Equipment(loaded?.runtime.equipment);

    expect(loadedEquipment.slot("back")?.itemId).toBe("equipment:backpack");
  });

  it("opens equipment from the inventory button", () => {
    const inventoryActions = stubInventoryDocument();
    const openEquipment = vi.fn();

    new Inventory(
      "survival",
      () => {},
      null,
      null,
      () => {},
      () => {},
      () => {},
      openEquipment,
    );

    const button = latestInventoryActionButtons(inventoryActions).find(
      (candidate) => candidate.textContent === "Equipment",
    );

    expect(button).toBeDefined();
    click(button!);
    expect(openEquipment).toHaveBeenCalledOnce();
  });
});
