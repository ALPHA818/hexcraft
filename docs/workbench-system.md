# Workbench System

## What It Does

Crafting is performed through workbenches, not the inventory panel. Each recipe declares a required workbench. Survival crafting is station-based: players interact with placed workbench blocks to open the matching panel, and panels opened from placed blocks are locked to that workbench type. Creative/debug can open testing workbench panels for development.

Procedural material combination is separate from normal crafting. The element combiner opens `MaterialCombinerPanel`, while other workbenches open `WorkbenchPanel`.

## Main Files

- `src/crafting/WorkbenchTypes.ts` defines workbench types and labels.
- `src/crafting/RecipeRegistry.ts` contains finite static recipes and their required workbenches.
- `src/crafting/GeneratedMaterialRecipes.ts` computes dynamic recipes from material capabilities.
- `src/game/WorkbenchController.ts` owns crafting interactions, dynamic recipe inclusion, workbench/research/capability gates, and inventory API calls.
- `src/ui/WorkbenchPanel.ts` renders recipes for a selected workbench.
- `src/ui/MaterialCombinerPanel.ts` handles procedural material combinations.
- `src/game/SurvivalController.ts` opens panels when a placed station/workbench is interacted with.
- `src/game/BlockPlacementRules.ts` maps placed station/workbench blocks to interactions and keeps non-station right-click behavior as normal placement.
- `src/world/blocks.ts` and `src/items/ItemRegistry.ts` register placeable workbench blocks/items.

## Data Flow

1. Static recipes are registered in `RECIPE_REGISTRY`.
2. Generated material recipes are computed by `GeneratedMaterialRecipes.ts` from discovered materials and material capabilities.
3. `WorkbenchController.recipesForWorkbench(type)` returns recipes for the selected station and applies research/capability gates.
4. `WorkbenchPanel` displays recipe availability, missing ingredients, and locked requirements, then calls `WorkbenchController.craft(recipeId, workbenchType)`.
5. Survival crafting consumes inputs through `Inventory.removeItem(...)` and adds outputs through `Inventory.addItem(...)`.
6. Creative crafting grants outputs and skips consumption through the same controller path.
7. Successful crafts call progression/save hooks through `WorkbenchControllerOptions`.

## What Not To Do

- Do not render crafting recipes inside `Inventory.ts`.
- Do not let advanced survival recipes craft without interacting with the correct placed station.
- Do not put procedural material combination into `WorkbenchPanel`; element combining belongs in `MaterialCombinerPanel`.
- Do not hardcode generated recipes per material.
- Do not bypass `WorkbenchController` when crafting from UI.
- Do not make tools equipment; tools remain hotbar/backpack items for now.
- Do not let a survival panel opened from one placed workbench switch to recipes for another workbench type.

## Adding Content Safely

- Add new finite recipes to `RecipeRegistry.ts` with `requiredWorkbench`.
- Add new workbench types to `WorkbenchTypes.ts`, block/item definitions, placement interactions, and panel labels together.
- Add generated material recipes by capability in `GeneratedMaterialRecipes.ts`.
- Add recipe gates with `requiredResearchTier` or `requiredMaterialCapabilities`.
- Keep survival/creative differences inside controller/inventory APIs.
- Add tests for recipe visibility, wrong workbench behavior, missing requirements, consumption, and creative bypass.

## Tests That Protect It

- `src/ui/WorkbenchPanel.test.ts` covers workbench filtering, tab locks, crafting UI behavior, and element combiner entry.
- `src/game/WorkbenchController.ts` is exercised by panel and recipe tests for consumption and gates.
- `src/crafting/GeneratedMaterialRecipes.test.ts` covers dynamic recipe generation from capabilities.
- `src/game/BlockPlacementRules.test.ts` covers station/workbench interaction mapping.
- `src/game/Inventory.test.ts` verifies inventory remains storage-only.
