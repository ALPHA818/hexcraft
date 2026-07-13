import {
  HOTBAR_SLOT_COUNT,
  itemDefinitionFor,
  type ItemId,
} from "../items/ItemRegistry.ts";
import {
  createItemStack,
  serializeItemStack,
  type SerializedItemStack,
} from "../items/ItemStack.ts";
import type { SerializedInventory } from "../save/WorldSaveTypes.ts";
import type { GameMode } from "./gameMode.ts";

export type StartingInventoryMode =
  "none" | "survival_basic" | "creative_testing";

export type StartingInventoryStack = Readonly<{
  itemId: ItemId;
  count: number;
}>;

export const STARTING_INVENTORY_MODES = [
  "none",
  "survival_basic",
  "creative_testing",
] as const satisfies readonly StartingInventoryMode[];

export const BACKPACK_STARTING_SLOT_COUNT = 27;

export const SURVIVAL_BASIC_STARTER_ITEMS = [
  { itemId: "block:dirt", count: 16 },
  { itemId: "block:planks", count: 16 },
  { itemId: "material:stick", count: 8 },
  { itemId: "block:basic_workbench", count: 1 },
] as const satisfies readonly StartingInventoryStack[];

export const CREATIVE_TESTING_STARTER_ITEMS = [
  { itemId: "block:dirt", count: 64 },
  { itemId: "block:planks", count: 64 },
  { itemId: "material:stick", count: 64 },
  { itemId: "block:basic_workbench", count: 1 },
] as const satisfies readonly StartingInventoryStack[];

export function isStartingInventoryMode(
  value: unknown,
): value is StartingInventoryMode {
  return (
    value === "none" ||
    value === "survival_basic" ||
    value === "creative_testing"
  );
}

export function normalizeStartingInventoryMode(
  value: unknown,
  fallback: StartingInventoryMode,
): StartingInventoryMode {
  return isStartingInventoryMode(value) ? value : fallback;
}

export function defaultStartingInventoryMode(
  gameMode: GameMode,
): StartingInventoryMode {
  return gameMode === "survival" ? "survival_basic" : "none";
}

export function startingInventoryModeForSettings(
  settings: Readonly<{
    gameMode: GameMode;
    startingInventoryMode?: StartingInventoryMode;
  }>,
): StartingInventoryMode {
  return (
    settings.startingInventoryMode ??
    defaultStartingInventoryMode(settings.gameMode)
  );
}

export function starterItemsForMode(
  mode: StartingInventoryMode,
): readonly StartingInventoryStack[] {
  switch (mode) {
    case "none":
      return [];
    case "survival_basic":
      return SURVIVAL_BASIC_STARTER_ITEMS;
    case "creative_testing":
      return CREATIVE_TESTING_STARTER_ITEMS;
  }
}

export function createStartingInventory(
  mode: StartingInventoryMode,
): SerializedInventory {
  const hotbar: (SerializedItemStack | null)[] = Array.from(
    { length: HOTBAR_SLOT_COUNT },
    () => null,
  );
  const backpack: (SerializedItemStack | null)[] = Array.from(
    { length: BACKPACK_STARTING_SLOT_COUNT },
    () => null,
  );
  const slots = [hotbar, backpack];
  let slotIndex = 0;

  for (const starter of starterItemsForMode(mode)) {
    const item = itemDefinitionFor(starter.itemId);

    if (!item) {
      throw new Error(`Invalid starter inventory item: ${starter.itemId}`);
    }

    const stack = serializeItemStack(
      createItemStack(starter.itemId, starter.count),
    );

    if (!stack) {
      continue;
    }

    const targetSlots = slotIndex < HOTBAR_SLOT_COUNT ? slots[0]! : slots[1]!;
    const targetIndex =
      slotIndex < HOTBAR_SLOT_COUNT ? slotIndex : slotIndex - HOTBAR_SLOT_COUNT;

    if (targetIndex >= targetSlots.length) {
      throw new Error(`Starter inventory mode ${mode} does not fit.`);
    }

    targetSlots[targetIndex] = stack;
    slotIndex += 1;
  }

  return {
    selectedHotbarIndex: 0,
    hotbar,
    backpack,
  };
}
