# Creative Catalog

## What It Does

The Creative Catalog is the source of creative item access. It lists registered items and discovered/generated material items without implying the player owns them. Clicking an item explicitly grants a stack into the real hotbar/backpack inventory through `grantItem(...)`.

Creative inventory should start empty by default unless `startingInventoryMode` is configured for a testing hotbar. Creative item access comes from the catalog, debug helpers, or explicit grants.

## Main Files

- `src/ui/CreativeCatalogPanel.ts` renders the catalog, categories, search, paging, and click-to-grant behavior.
- `src/game/Inventory.ts` exposes `grantItem(...)` and the inventory action button that opens the catalog in creative.
- `src/items/ItemRegistry.ts` provides static item definitions.
- `src/items/MaterialItemResolver.ts` resolves generated material catalog entries.
- `src/game/MaterialWorldController.ts` provides discovered materials for the Generated Materials category.
- `src/game/GamePanelWiring.ts` connects the panel to the active world and `PanelManager`.

## Data Flow

1. The Inventory panel shows the `Creative Catalog` button only in creative mode.
2. `GamePanelWiring.openCreativeCatalog()` opens `CreativeCatalogPanel` through `PanelManager`.
3. `CreativeCatalogPanel` lists static categories from `ITEM_DEFINITIONS`.
4. Generated Materials are computed from `MaterialWorldController.listDiscoveredMaterials()`.
5. Clicking a card calls `grantCreativeCatalogItem(...)`.
6. `grantCreativeCatalogItem(...)` calls `inventory.grantItem(item.id, count)`, where tools grant one item and stackables grant their max stack size.
7. Save state is still owned by the normal inventory save path.

## What Not To Do

- Do not pre-fill creative inventory with every item.
- Do not use `Inventory.addItem(...)` for catalog grants.
- Do not make catalog items count as owned until clicked.
- Do not show the Creative Catalog in survival.
- Do not duplicate generated material definitions into static item definitions.
- Do not bypass `MaterialWorldController` when listing generated materials.

## Adding Content Safely

- Add finite block/tool/material/workbench items to `ItemRegistry.ts`; they will appear in the catalog but not in owned inventory.
- Add a new catalog category by extending `CreativeCatalogCategory`, `CREATIVE_CATALOG_CATEGORIES`, and `creativeCatalogItemsForCategory(...)`.
- Keep page size bounded with `CREATIVE_CATALOG_PAGE_SIZE`.
- For generated material entries, rely on `itemIdForMaterial(...)` and `itemDefinitionFor(..., materialWorld)`, and keep unknown materials safe.
- For debug-only labels, use the existing `showDebugIds` hook.

## Tests That Protect It

- `src/ui/CreativeCatalogPanel.test.ts` covers survival hidden behavior, block/tool/generated listings, paging, search, grant counts, and catalog items not becoming owned automatically.
- `src/game/Inventory.test.ts` covers creative inventory starting empty and `grantItem(...)` behavior.
- `src/items/ItemRegistry.ts` and item tests protect static item resolution.
