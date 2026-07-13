# Material Gameplay Integration

This document describes how procedural materials connect to the active Hexcraft game session without moving deterministic material logic into UI code.

## Runtime Ownership

`MaterialWorldController` is the runtime boundary for one active world session. It creates the per-world `MaterialRegistry`, registers the 118 base elements, restores generated materials, restores recipe history, restores discovered material ids, restores unlocked research tiers, and serializes the codex back into the world save.

`GameSessionFactory` creates one `MaterialWorldController` per loaded world and stores it on `ActiveGame` through `GameSession.ts`. Saving uses `captureGameSavePayload(...)`, which serializes the material codex and material storage with the rest of runtime state.

## Gameplay Entry Points

| System                  | Runtime file                               | Responsibility                                                                                                                                                                       |
| ----------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Discovery and combining | `src/game/MaterialDiscoveryController.ts`  | Consumes ingredients in survival, skips consumption in creative, calls `MaterialWorldController.combine(...)`, discovers successful results, adds result items, and requests a save. |
| Mining traces           | `src/game/MaterialDropRules.ts`            | Adds normal ore drops, discovers matching base elements, rolls deterministic biome/cave traces, and returns notifications.                                                           |
| Hazards                 | `src/game/MaterialHazards.ts`              | Computes survival-only damage and warning text for held radioactive, toxic, or very hot materials.                                                                                   |
| Storage                 | `src/game/MaterialStorage.ts`              | Stores generated material quantities outside the hotbar and serializes with world runtime state.                                                                                     |
| Creative testing        | `src/game/MaterialTestingKit.ts`           | Gives material items and starter sets when creative or debug access is allowed.                                                                                                      |
| Recipes                 | `src/crafting/GeneratedMaterialRecipes.ts` | Computes recipe availability from material capabilities instead of hardcoding every generated material.                                                                              |
| World event hooks       | `src/world/MaterialWorldEvents.ts`         | Emits deterministic future event hooks for rare, magic, radioactive, and unstable discoveries.                                                                                       |

## UI Boundaries

UI panels read runtime state and call controllers. They should not generate materials directly.

- `MaterialCodexPanel` lists discovered materials, capability grades, balance scores, visuals, storage presence, recipes, and debug give buttons.
- `MaterialCombinerPanel` lets the player choose materials and station type, then calls `MaterialDiscoveryController`.
- `MaterialResearchPanel` displays research tiers and calls `MaterialWorldController.unlockResearchTier(...)` for debug unlocks.
- `MaterialStoragePanel` displays and sorts material storage.

Production UI code should avoid calling pure generation functions such as `combineMaterials(...)`. Tests can still use pure material helpers for fixtures.

## Save and Load

Material persistence stays in the existing world save database. There is no second material database.

`WorldRuntimeStateSave` owns:

- `materialCodex`
- `materialStorage`
- `inventory`
- `equipment`
- `progression`
- `gameTime`
- `player`
- `worldId`

The codex stores generated materials, recipe results, discovered material ids, and unlocked research tiers. Base elements are loaded from code and are not duplicated into every save. Old saves without material codex or material storage are normalized by `WorldSaveTypes.ts`.

## Determinism

Material generation, unstable reaction outcomes, discovery traces, visuals, capabilities, balance scores, and recipe availability are deterministic from material ids, stats, tags, station type, config, and world/event seeds.

Avoid `Math.random()` in material systems. New deterministic systems should include tests for repeated-seed stability.

## Creative and Survival

Creative mode:

- Discovers all base elements for easy testing.
- Ignores research locks.
- Does not consume combiner ingredients.
- Ignores material hazard damage.
- Can use material debug give actions.

Survival mode:

- Uses configured starting discovery rules.
- Enforces research requirements.
- Consumes one of each parent material, or two for same-material combinations.
- Applies held-material hazard damage at configured intervals.
- Saves new discoveries and generated material state.

## Main Runtime Split

`main.ts` is intentionally tiny: it imports CSS, creates `GameApp`, and starts it. Shared runtime pieces are split into:

- `src/game/GameBootstrap.ts` for DOM bootstrap and renderer fallback creation.
- `src/game/GameApp.ts` for app boot, menu actions, settings, and world creation/loading.
- `src/game/GameSessionFactory.ts` for building `ActiveGame` from `LoadedWorldSave`.
- `src/game/GameSession.ts` for active session types and save payload capture.
- `src/game/GameLoop.ts` for frame-loop terrain streaming, timing, hazards, audio, entities, and debug snapshots.
- `src/game/GamePanelWiring.ts` for gameplay panel instances and session wiring.
- `src/game/GameSaveCoordinator.ts` for save queue, autosave, and page lifecycle saves.
- `src/game/GameRuntimeEvents.ts` for keybinds and pointer-lock escape behavior.
