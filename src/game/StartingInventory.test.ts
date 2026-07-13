import { describe, expect, it } from "vitest";

import { ITEM_DEFINITIONS, itemDefinitionFor } from "../items/ItemRegistry.ts";
import { MemorySaveDatabase } from "../save/SaveDatabase.ts";
import type { WorldRuntimeStateSave } from "../save/WorldSaveTypes.ts";
import { WorldSaveManager } from "../save/WorldSaveManager.ts";
import { getDefaultGameSettings } from "./GameSettings.ts";
import {
  BACKPACK_STARTING_SLOT_COUNT,
  createStartingInventory,
  defaultStartingInventoryMode,
  starterItemsForMode,
} from "./StartingInventory.ts";

function occupiedCount(
  inventory: ReturnType<typeof createStartingInventory>,
): number {
  return [...(inventory.hotbar ?? []), ...(inventory.backpack ?? [])].filter(
    Boolean,
  ).length;
}

describe("starting inventory", () => {
  it("new survival worlds receive configured starter items", async () => {
    const manager = new WorldSaveManager(new MemorySaveDatabase());
    const save = await manager.createWorld({
      ...getDefaultGameSettings(),
      gameMode: "survival",
    });

    expect(save.runtime.inventory.hotbar?.slice(0, 4)).toEqual([
      { itemId: "block:dirt", count: 16 },
      { itemId: "block:planks", count: 16 },
      { itemId: "material:stick", count: 8 },
      { itemId: "block:basic_workbench", count: 1 },
    ]);
    expect(save.runtime.inventory.backpack).toHaveLength(
      BACKPACK_STARTING_SLOT_COUNT,
    );
  });

  it("new creative worlds do not receive all items", async () => {
    const manager = new WorldSaveManager(new MemorySaveDatabase());
    const save = await manager.createWorld(getDefaultGameSettings());

    expect(defaultStartingInventoryMode("creative")).toBe("none");
    expect(occupiedCount(save.runtime.inventory)).toBe(0);
    expect(occupiedCount(save.runtime.inventory)).toBeLessThan(
      ITEM_DEFINITIONS.length,
    );
  });

  it("loading old saves does not apply starter items again", async () => {
    const database = new MemorySaveDatabase();
    const manager = new WorldSaveManager(database);
    const created = await manager.createWorld({
      ...getDefaultGameSettings(),
      gameMode: "survival",
    });

    await database.putWorldRuntimeState({
      worldId: created.metadata.id,
      player: { position: null },
      inventory: { selectedIndex: 0, items: [] },
      gameTime: created.runtime.gameTime,
      materialCodex: created.runtime.materialCodex,
      materialStorage: created.runtime.materialStorage,
    } as unknown as WorldRuntimeStateSave);

    const loaded = await manager.loadWorld(created.metadata.id);

    expect(occupiedCount(loaded!.runtime.inventory)).toBe(0);
  });

  it("starter items fit into hotbar and backpack", () => {
    const inventory = createStartingInventory("survival_basic");

    expect(inventory.hotbar).toHaveLength(9);
    expect(inventory.backpack).toHaveLength(BACKPACK_STARTING_SLOT_COUNT);
    expect(occupiedCount(inventory)).toBe(
      starterItemsForMode("survival_basic").length,
    );
  });

  it("starter inventory uses valid item registry ids", () => {
    for (const mode of ["survival_basic", "creative_testing"] as const) {
      for (const starter of starterItemsForMode(mode)) {
        expect(itemDefinitionFor(starter.itemId)).not.toBeNull();
      }
    }
  });

  it("creative testing mode gives only the configured test hotbar", () => {
    const inventory = createStartingInventory("creative_testing");

    expect(inventory.hotbar?.slice(0, 4)).toEqual([
      { itemId: "block:dirt", count: 64 },
      { itemId: "block:planks", count: 64 },
      { itemId: "material:stick", count: 64 },
      { itemId: "block:basic_workbench", count: 1 },
    ]);
    expect(occupiedCount(inventory)).toBe(4);
  });
});
