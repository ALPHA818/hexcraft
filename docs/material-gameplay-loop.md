# Material Gameplay Loop

## What It Does

The material gameplay loop connects world exploration, mining, material discovery, station-based combining, generated material storage, generated recipes, equipment/tool upgrades, hazards, and progression objectives. The pure material system remains deterministic and UI-independent; game controllers adapt it to one active world session.

The intended early loop is:

1. Collect basic resources.
2. Craft planks, sticks, tools, and a basic workbench.
3. Mine stone, coal, ores, and biome/cave traces.
4. Discover base elements such as carbon, silicon, sulfur, metals, and rare cave materials.
5. Craft/place an element combiner.
6. Combine discovered material items into generated materials.
7. Store generated materials at scale.
8. Use material capabilities to unlock generated recipes and tool upgrades.

## Main Files

- `src/game/MaterialWorldController.ts` owns one world session's material registry, discoveries, recipes, and research tiers.
- `src/game/MaterialDropRules.ts` connects mining/biome/cave/mountain context to deterministic trace discoveries.
- `src/materials/MaterialBiomeAffinities.ts` defines biome, cave, and mountain material affinity pools.
- `src/game/MaterialDiscoveryController.ts` consumes parent material items and calls `MaterialWorldController.combine(...)`.
- `src/ui/MaterialCombinerPanel.ts` is the UI for element combiner/stations.
- `src/game/MaterialStorage.ts` and `src/ui/MaterialStoragePanel.ts` store and manage generated material quantities.
- `src/crafting/GeneratedMaterialRecipes.ts` computes recipe availability from `MaterialCapabilities`.
- `src/game/WorkbenchController.ts` exposes generated recipes through the correct workbench type.
- `src/game/MaterialHazards.ts` applies survival-only hazards for held dangerous materials.
- `src/game/ProgressionController.ts` tracks the lightweight early-game path.
- `src/ui/ObjectiveTracker.ts` displays optional objectives and completion notifications.

## Data Flow

1. `GameSessionFactory` creates `MaterialWorldController` from `runtime.materialCodex`.
2. Mining calls `applyMaterialDropRules(...)` from `SurvivalController`.
3. Drop rules add normal drops and, when deterministic trace rolls succeed, discover base elements through `MaterialWorldController`/`MaterialRegistry`. Repeat discoveries are suppressed.
4. The combiner panel creates `MaterialDiscoveryController`, which checks inventory, research, unstable reaction results, and station type.
5. Successful combinations discover the result material, add a `generated-material:<materialId>` item, and save.
6. Material storage moves generated material items out of hotbar/backpack into `runtime.materialStorage`; stored materials do not count as held hazards.
7. Workbench recipes are computed from discovered material capabilities and inventory availability.
8. Progression objectives listen to item collection, crafting, material discovery, combining, storage, and tool upgrades.

## What Not To Do

- Do not call pure generation helpers directly from UI panels.
- Do not hardcode infinite material combinations.
- Do not add every generated material as a static item or block.
- Do not make material discovery nondeterministic.
- Do not flood inventory with repeat trace items for already-discovered base materials.
- Do not show discovery notifications repeatedly for the same material.
- Do not apply material hazard damage from material storage unless a future feature explicitly opts in.
- Do not let creative/survival rules diverge by changing inventory structure.
- Do not put material persistence outside the existing world save.

## Adding Content Safely

- Add new base affinity rules in `MaterialBiomeAffinities.ts` with deterministic tests.
- Add mining discovery behavior in `MaterialDropRules.ts` and verify normal drops still happen.
- Add new generated material usefulness through `MaterialCapabilities.ts` and `GeneratedMaterialRecipes.ts`, then expose it through `WorkbenchController`.
- Add new station behavior through `MaterialStations.ts`, `WorkbenchTypes.ts`, station blocks/items, and controller tests.
- Add progression objectives through `ProgressionController.ts` only when they are lightweight and optional.
- Add UI details by reading controller state, not by duplicating material logic.

## Tests That Protect It

- `src/materials/MaterialSystem.test.ts` covers deterministic material system integration.
- `src/materials/MaterialBiomeAffinities.test.ts` covers biome/cave/mountain affinity and deterministic traces.
- `src/game/MaterialDropRules.test.ts` covers ore discovery, biome traces, cave/radioactive traces, repeat suppression, dynamic material drops, and deterministic seed behavior.
- `src/game/MaterialWorldController.test.ts` covers combine/discover/serialize/reload behavior.
- `src/ui/MaterialCombinerPanel.test.ts` covers combining, survival/creative consumption, locked research, known recipes, and unstable outcomes.
- `src/game/MaterialStorage.test.ts` covers storage quantities, filtering, sorting, moves, and save/load.
- `src/crafting/GeneratedMaterialRecipes.test.ts` covers generated recipe availability from capabilities.
- `src/game/ProgressionController.test.ts` covers objectives and persistence.
