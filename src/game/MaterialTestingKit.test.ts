import { describe, expect, it } from "vitest";

import { BASE_ELEMENT_COUNT } from "../materials/BaseElements.ts";
import { DEFAULT_MATERIAL_CONFIG } from "../materials/MaterialConfig.ts";
import { itemIdForMaterial, type ItemId } from "../items/ItemRegistry.ts";
import {
  BASIC_STARTING_ELEMENT_IDS,
  emptyMaterialCodexSave,
} from "../save/WorldSaveTypes.ts";
import { MaterialWorldController } from "./MaterialWorldController.ts";
import {
  canUseMaterialTestingKit,
  COMMON_STARTER_MATERIAL_IDS,
  MaterialTestingKit,
} from "./MaterialTestingKit.ts";

class TestInventory {
  readonly items = new Map<ItemId, number>();

  addItem(itemId: ItemId, amount = 1): boolean {
    this.items.set(itemId, (this.items.get(itemId) ?? 0) + amount);
    return true;
  }

  grantItem(itemId: ItemId, amount = 1): boolean {
    return this.addItem(itemId, amount);
  }
}

describe("material testing kit", () => {
  it("lets creative worlds discover all base elements even with basic config", () => {
    const controller = new MaterialWorldController({
      config: {
        ...DEFAULT_MATERIAL_CONFIG,
        startingElementMode: "basic",
      },
      mode: "creative",
    });

    expect(controller.serialize().discoveredMaterialIds).toHaveLength(
      BASE_ELEMENT_COUNT,
    );
  });

  it("lets loaded creative worlds access all base elements", () => {
    const controller = new MaterialWorldController({
      materialCodex: emptyMaterialCodexSave(["element:oxygen"]),
      mode: "creative",
    });

    expect(controller.hasDiscovered("element:oxygen")).toBe(true);
    expect(controller.hasDiscovered("element:gold")).toBe(true);
    expect(controller.serialize().discoveredMaterialIds).toHaveLength(
      BASE_ELEMENT_COUNT,
    );
  });

  it("gives a selected material item to inventory", () => {
    const materialWorld = new MaterialWorldController();
    const inventory = new TestInventory();
    const kit = new MaterialTestingKit({ materialWorld, inventory });
    const result = kit.giveMaterial("element:iron", 3);

    expect(result.ok).toBe(true);
    expect(result.itemId).toBe(itemIdForMaterial("element:iron"));
    expect(inventory.items.get(itemIdForMaterial("element:iron"))).toBe(3);
  });

  it("gives common starter element items", () => {
    const materialWorld = new MaterialWorldController();
    const inventory = new TestInventory();
    const kit = new MaterialTestingKit({ materialWorld, inventory });
    const result = kit.giveCommonStarterElements();

    expect(COMMON_STARTER_MATERIAL_IDS).toEqual(BASIC_STARTING_ELEMENT_IDS);
    expect(result.ok).toBe(true);
    expect(result.addedCount).toBe(BASIC_STARTING_ELEMENT_IDS.length);
    for (const materialId of BASIC_STARTING_ELEMENT_IDS) {
      expect(inventory.items.get(itemIdForMaterial(materialId))).toBe(1);
    }
  });

  it("does not expose testing actions in survival unless debug overlay is enabled", () => {
    expect(canUseMaterialTestingKit("creative", false)).toBe(true);
    expect(canUseMaterialTestingKit("survival", false)).toBe(false);
    expect(canUseMaterialTestingKit("survival", true)).toBe(true);
  });
});
