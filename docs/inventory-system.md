# Inventory System

## What It Does

The player inventory is real storage, not a catalog of every registered item. It is split into a 9-slot hotbar and a 27-slot backpack. Both creative and survival use the same data shape and slot rendering. The gameplay differences are behavior rules: survival consumes and receives drops through `addItem`, while creative grants explicit stacks through catalog/debug paths and does not consume items when placing or crafting.

Equipment and material storage are separate systems. Equipment is not part of the hotbar or backpack. Material storage holds generated material quantities outside normal inventory slots, so large recursive-material collections do not crowd the backpack.

## Main Files

- `src/game/Inventory.ts` owns hotbar/backpack state, slot movement, selection, filtering, sorting, serialization, generated-material swatches, material storage quick actions, and the storage-focused inventory panel shell.
- `src/items/ItemRegistry.ts` defines static item definitions and dynamic item resolution entry points.
- `src/items/ItemStack.ts` normalizes, serializes, merges, and damages item stacks.
- `src/items/MaterialItemResolver.ts` resolves `generated-material:<materialId>` item definitions without adding generated materials to `ITEM_DEFINITIONS`.
- `src/items/ModifiedToolTypes.ts` and `src/items/MaterialToolModifier.ts` resolve modified tools.
- `src/game/StartingInventory.ts` applies configured starter items only when a new world is created.
- `src/game/Equipment.ts` stores equipped items separately from inventory.
- `src/game/MaterialStorage.ts` stores many generated materials separately from hotbar/backpack.
- `src/game/BlockPlacementRules.ts` and `src/game/SurvivalController.ts` read placement candidates from the selected hotbar slot.
- `src/save/WorldSaveTypes.ts` serializes inventory as `selectedHotbarIndex`, `hotbar`, and `backpack`, with legacy migration for older save shapes.

## Data Flow

1. New worlds use `StartingInventory.ts` to create starter stacks according to `startingInventoryMode`.
2. Loaded worlds pass normalized `runtime.inventory` into `Inventory.importState(...)`.
3. Runtime systems add items through `Inventory.addItem(...)` in survival or `Inventory.grantItem(...)` for creative/debug grants.
4. Placement reads only `Inventory.selectedItemId()`, `selectedStackCount()`, `selectedPlaceableMaterial()`, and `selectedDynamicMaterialId()` from the selected hotbar slot. Backpack stacks are not placeable until moved to the hotbar.
5. Saving calls `Inventory.exportState()` through `captureGameSavePayload(...)`.
6. Old save formats using `slots` or legacy terrain material `items` are normalized into hotbar/backpack by save/import helpers.

## What Not To Do

- Do not treat `ITEM_DEFINITIONS` as owned inventory.
- Do not add permanent creative or survival default items directly to `Inventory`.
- Do not let backpack items place blocks until they are moved to the hotbar.
- Do not add every generated material to `ITEM_DEFINITIONS`.
- Do not use `addItem(...)` as a creative catalog grant path. Use `grantItem(...)`.
- Do not put crafting recipes, workbench recipes, or material-combiner UI back into the inventory panel.
- Do not store equipment in hotbar/backpack slots once equipped.
- Do not apply starter inventory rules while loading an existing save.

## Adding Content Safely

- Add normal static items to `ItemRegistry.ts` only when they are finite game items.
- Add generated material behavior through `MaterialItemResolver.ts`, not static definitions.
- Add modified tool behavior through `ModifiedToolTypes.ts` and `MaterialToolModifier.ts`.
- Add starter items in `StartingInventory.ts`, not the `Inventory` constructor or creative mode defaults.
- For new item categories, update `InventoryFilter`, `inventoryItemMatchesFilter(...)`, sorting, and tests.
- Keep max stack size and placeability in the item definition.
- Ensure unknown item IDs from saves are preserved or safely normalized according to save tests.

## Tests That Protect It

- `src/game/Inventory.test.ts` covers hotbar/backpack structure, selected hotbar placement, dynamic item serialization, slot movement, filtering, sorting, material storage quick moves, generated swatches, and old save migration behavior.
- `src/game/StartingInventory.test.ts` covers starter inventory rules and validates item IDs.
- `src/items/ItemStack.test.ts` covers stack creation, normalization, merging, and tool durability.
- `src/game/Equipment.test.ts` covers equipment separation and save/load.
- `src/save/WorldSaveManager.test.ts` covers old/new inventory save migration and persistence.
