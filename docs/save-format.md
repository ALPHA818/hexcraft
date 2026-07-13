# Save Format

## What It Does

Hexcraft uses one world save system. Runtime state, material state, inventory, equipment, progression, game time, and terrain edits are stored through the existing save database. Do not create a second database for materials, inventory, storage, equipment, or progression.

## Main Files

- `src/save/WorldSaveTypes.ts` defines serialized types, defaults, migrations, and normalization.
- `src/save/WorldSaveManager.ts` creates, loads, saves, renames, deletes, and migrates worlds.
- `src/save/SaveDatabase.ts` owns IndexedDB and memory database implementations.
- `src/game/GameSaveCoordinator.ts` queues saves, autosaves, and page lifecycle saves.
- `src/game/GameSession.ts` defines `ActiveGame` and `captureGameSavePayload(...)`.
- `src/game/GameSessionFactory.ts` creates runtime controllers from `LoadedWorldSave`.
- `src/game/StartingInventory.ts` creates starter inventory only for new worlds.

## Data Flow

1. New worlds call `WorldSaveManager.createWorld(settings)`.
2. Metadata comes from `metadataFromSettings(...)`.
3. Runtime defaults come from `emptyRuntimeStateSave(...)`, plus configured starting inventory and starting material codex for new worlds.
4. Loading calls `runtimeStateWithDefaults(...)` and save migration/normalization helpers. Starter items are not reapplied to existing saves.
5. Runtime systems serialize through `captureGameSavePayload(...)`.
6. `GameSaveCoordinator.saveActiveGame()` queues writes through `WorldSaveManager.saveWorld(...)`.
7. `SaveDatabase` stores metadata, runtime state, and terrain edit chunks.

## Runtime State

Current runtime state includes:

- `worldId`
- `player`
- `inventory`
- `equipment`
- `progression`
- `gameTime`
- `materialCodex`
- `materialStorage`

Terrain edits are stored separately as terrain edit chunks. Dynamic material block metadata is stored with terrain edits, not in a separate block database.

## What Not To Do

- Do not create a second save database.
- Do not duplicate all base element definitions into saves.
- Do not overwrite existing saves with starter items on load.
- Do not assume optional old fields are present.
- Do not discard unknown item IDs unless a migration explicitly requires it.
- Do not put persistence ownership inside UI panels.
- Do not bypass `WorldSaveManager` for world runtime state.
- Do not store dynamic material block metadata outside terrain edit chunks.

## Adding Content Safely

- Add serialized types to `WorldSaveTypes.ts`.
- Add defaults and normalizers so old saves load safely.
- Add migration logic for legacy fields such as inventory `slots`, legacy terrain-material `items`, old material recipe shapes, or missing material storage.
- Add optional fields to `SaveWorldPayload` when save requests need partial compatibility.
- Include runtime serialization in `captureGameSavePayload(...)`.
- Initialize runtime controllers in `GameSessionFactory.ts` from normalized save data.
- Add migration tests before changing shape-sensitive runtime data.

## Tests That Protect It

- `src/save/WorldSaveManager.test.ts` covers new worlds, old saves, material codex/storage, inventory migration, dynamic material blocks, workbench blocks, unknown IDs, and runtime persistence.
- `src/game/Inventory.test.ts` covers inventory export/import and legacy inventory migration.
- `src/game/MaterialWorldController.test.ts` covers material codex serialization and reload.
- `src/game/MaterialStorage.test.ts` covers material storage persistence.
- `src/game/Equipment.test.ts` covers equipment persistence.
- `src/game/ProgressionController.test.ts` covers progression persistence.
- `src/world/DynamicMaterialBlocks.test.ts` covers dynamic material block metadata persistence.
