import { describe, expect, it, vi } from "vitest";

import { getDefaultGameSettings } from "../game/GameSettings.ts";
import {
  TERRAIN_DEPTH_BLOCKS,
  TerrainMaterial,
} from "../geometry/terrainChunk.ts";
import {
  itemIdForMaterial,
  modifiedToolItemId,
} from "../items/ItemRegistry.ts";
import { MaterialCodex } from "../materials/MaterialCodex.ts";
import { DEFAULT_MATERIAL_CONFIG } from "../materials/MaterialConfig.ts";
import { BASE_ELEMENT_COUNT } from "../materials/BaseElements.ts";
import { combineMaterials } from "../materials/MaterialCombiner.ts";
import { MaterialRegistry } from "../materials/MaterialRegistry.ts";
import type { MaterialDefinition } from "../materials/MaterialTypes.ts";
import {
  dynamicMaterialBlockDisplayName,
  dynamicMaterialBlockDropItemId,
  UNKNOWN_DYNAMIC_MATERIAL_BLOCK_DISPLAY_NAME,
} from "../world/DynamicMaterialBlocks.ts";
import {
  generateTerrainColumn,
  InfiniteTerrain,
} from "../world/InfiniteTerrain.ts";
import { MemorySaveDatabase } from "./SaveDatabase.ts";
import {
  BASIC_STARTING_ELEMENT_IDS,
  CURRENT_SAVE_VERSION,
  createStartingMaterialCodex,
  materialRegistryFromSerializedCodex,
  serializeMaterialCodex,
  type SerializedInventory,
  type WorldRuntimeStateSave,
} from "./WorldSaveTypes.ts";
import { migrateWorldSaveData, WorldSaveManager } from "./WorldSaveManager.ts";

function createManager(): WorldSaveManager {
  return new WorldSaveManager(new MemorySaveDatabase());
}

function materialRegistry(): MaterialRegistry {
  const registry = new MaterialRegistry();

  registry.registerBaseMaterials();
  return registry;
}

function materialOrThrow(
  registry: MaterialRegistry,
  id: string,
): MaterialDefinition {
  const material = registry.getMaterialById(id);

  if (!material) {
    throw new Error(`Missing test material ${id}`);
  }

  return material;
}

describe("world save manager", () => {
  it("creates versioned world metadata", async () => {
    const settings = {
      ...getDefaultGameSettings(),
      worldName: "Save Test",
      worldSeed: 12345,
      gameMode: "survival" as const,
    };
    const save = await createManager().createWorld(settings, 1000);

    expect(save.metadata).toMatchObject({
      saveVersion: CURRENT_SAVE_VERSION,
      name: "Save Test",
      seed: 12345,
      gameMode: "survival",
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(save.metadata.id).not.toHaveLength(0);
  });

  it("new world gets material codex defaults", async () => {
    const save = await createManager().createWorld(
      getDefaultGameSettings(),
      1000,
    );

    expect(save.runtime.materialCodex.discoveredMaterialIds).toHaveLength(
      BASE_ELEMENT_COUNT,
    );
    expect(save.runtime.materialCodex.generatedMaterials).toEqual([]);
    expect(save.runtime.materialCodex.recipeResults).toEqual([]);
    expect(save.runtime.materialCodex.unlockedResearchTiers).toEqual([]);
    expect(save.runtime.materialStorage.materials).toEqual([]);
  });

  it("creates starting material codex with all base elements", () => {
    const codex = createStartingMaterialCodex(getDefaultGameSettings(), {
      ...DEFAULT_MATERIAL_CONFIG,
      startingElementMode: "all",
    });

    expect(codex.discoveredMaterialIds).toHaveLength(BASE_ELEMENT_COUNT);
    expect(codex.generatedMaterials).toEqual([]);
    expect(codex.recipeResults).toEqual([]);
    expect(codex.unlockedResearchTiers).toEqual([]);
  });

  it("creates starting material codex with basic starter elements", () => {
    const codex = createStartingMaterialCodex(
      { ...getDefaultGameSettings(), gameMode: "survival" },
      {
        ...DEFAULT_MATERIAL_CONFIG,
        startingElementMode: "basic",
      },
    );

    expect(codex.discoveredMaterialIds).toEqual(
      [...BASIC_STARTING_ELEMENT_IDS].sort(),
    );
    expect(codex.discoveredMaterialIds.length).toBeLessThan(BASE_ELEMENT_COUNT);
  });

  it("creates starting material codex with creativeAll mode", () => {
    const config = {
      ...DEFAULT_MATERIAL_CONFIG,
      startingElementMode: "creativeAll" as const,
    };
    const creative = createStartingMaterialCodex(
      { ...getDefaultGameSettings(), gameMode: "creative" },
      config,
    );
    const survival = createStartingMaterialCodex(
      { ...getDefaultGameSettings(), gameMode: "survival" },
      config,
    );

    expect(creative.discoveredMaterialIds).toHaveLength(BASE_ELEMENT_COUNT);
    expect(survival.discoveredMaterialIds).toEqual(
      [...BASIC_STARTING_ELEMENT_IDS].sort(),
    );
  });

  it("new world uses configured starting material mode", async () => {
    const manager = new WorldSaveManager(new MemorySaveDatabase(), {
      ...DEFAULT_MATERIAL_CONFIG,
      startingElementMode: "basic",
    });
    const save = await manager.createWorld(
      { ...getDefaultGameSettings(), gameMode: "survival" },
      1000,
    );

    expect(save.runtime.materialCodex.discoveredMaterialIds).toEqual(
      [...BASIC_STARTING_ELEMENT_IDS].sort(),
    );
  });

  it("old save without materialCodex loads safely", async () => {
    const database = new MemorySaveDatabase();
    const manager = new WorldSaveManager(database);
    const created = await manager.createWorld(getDefaultGameSettings(), 1000);

    await database.putWorldRuntimeState({
      worldId: created.metadata.id,
      player: { position: [1, 2, 3] },
      inventory: { selectedIndex: 0, items: [] },
      gameTime: created.runtime.gameTime,
    } as unknown as WorldRuntimeStateSave);

    const loaded = await manager.loadWorld(created.metadata.id);

    expect(loaded?.runtime.player.position).toEqual([1, 2, 3]);
    expect(loaded?.runtime.materialCodex.discoveredMaterialIds).toHaveLength(
      BASE_ELEMENT_COUNT,
    );
    expect(loaded?.runtime.materialCodex.generatedMaterials).toEqual([]);
  });

  it("old save without materialStorage loads safely", async () => {
    const database = new MemorySaveDatabase();
    const manager = new WorldSaveManager(database);
    const created = await manager.createWorld(getDefaultGameSettings(), 1000);

    await database.putWorldRuntimeState({
      worldId: created.metadata.id,
      player: { position: [2, 4, 6] },
      inventory: created.runtime.inventory,
      gameTime: created.runtime.gameTime,
      materialCodex: created.runtime.materialCodex,
    } as unknown as WorldRuntimeStateSave);

    const loaded = await manager.loadWorld(created.metadata.id);

    expect(loaded?.runtime.player.position).toEqual([2, 4, 6]);
    expect(loaded?.runtime.materialStorage.materials).toEqual([]);
  });

  it("migrates old hotbar-only saves with inventory.slots", async () => {
    const database = new MemorySaveDatabase();
    const manager = new WorldSaveManager(database);
    const created = await manager.createWorld(getDefaultGameSettings(), 1000);

    await database.putWorldRuntimeState({
      worldId: created.metadata.id,
      player: { position: null },
      inventory: {
        selectedIndex: 2,
        slots: [
          { itemId: "block:dirt", count: 4 },
          { itemId: "tool:pickaxe", count: 1, durability: 37 },
          { itemId: "block:wood", count: 3 },
          null,
          null,
          null,
          null,
          null,
          null,
          { itemId: "block:stone", count: 6 },
        ],
      },
      gameTime: created.runtime.gameTime,
    } as unknown as WorldRuntimeStateSave);

    const loaded = await manager.loadWorld(created.metadata.id);

    expect(loaded?.runtime.inventory.selectedHotbarIndex).toBe(2);
    expect(loaded?.runtime.inventory.hotbar).toHaveLength(9);
    expect(loaded?.runtime.inventory.backpack).toHaveLength(27);
    expect(loaded?.runtime.inventory.hotbar?.[0]).toEqual({
      itemId: "block:dirt",
      count: 4,
    });
    expect(loaded?.runtime.inventory.hotbar?.[1]).toEqual({
      itemId: "tool:pickaxe",
      count: 1,
      durability: 37,
    });
    expect(loaded?.runtime.inventory.hotbar?.[2]).toEqual({
      itemId: "block:wood",
      count: 3,
    });
    expect(loaded?.runtime.inventory.backpack?.[0]).toEqual({
      itemId: "block:stone",
      count: 6,
    });
  });

  it("migrates old terrain-material-count inventory saves", async () => {
    const database = new MemorySaveDatabase();
    const manager = new WorldSaveManager(database);
    const created = await manager.createWorld(getDefaultGameSettings(), 1000);

    await database.putWorldRuntimeState({
      worldId: created.metadata.id,
      player: { position: null },
      inventory: {
        selectedIndex: 1,
        items: [
          { material: TerrainMaterial.Dirt, count: 70 },
          { material: TerrainMaterial.Planks, count: 5 },
        ],
      },
      gameTime: created.runtime.gameTime,
    } as unknown as WorldRuntimeStateSave);

    const loaded = await manager.loadWorld(created.metadata.id);

    expect(loaded?.runtime.inventory.selectedHotbarIndex).toBe(1);
    expect(loaded?.runtime.inventory.hotbar?.[0]).toEqual({
      itemId: "block:dirt",
      count: 64,
    });
    expect(loaded?.runtime.inventory.hotbar?.[1]).toEqual({
      itemId: "block:dirt",
      count: 6,
    });
    expect(loaded?.runtime.inventory.hotbar?.[2]).toEqual({
      itemId: "block:planks",
      count: 5,
    });
    expect(loaded?.runtime.inventory.backpack).toHaveLength(27);
  });

  it("saves and loads terrain edits grouped by chunk", async () => {
    const manager = createManager();
    const created = await manager.createWorld(getDefaultGameSettings(), 1000);
    const terrain = new InfiniteTerrain(created.metadata.seed, 4, 1);

    terrain.update({ x: 0, z: 0 });
    terrain.setBlock(
      { q: 0, r: 0, level: TERRAIN_DEPTH_BLOCKS + 12 },
      TerrainMaterial.Planks,
    );
    terrain.setBlock({ q: 1, r: 0, level: 8 }, TerrainMaterial.Air);

    await manager.saveWorld(
      {
        metadata: created.metadata,
        player: { position: [1, 2, 3] },
        inventory: { selectedIndex: 0, items: [] },
        terrainEditChunks: terrain.exportTerrainEditChunks(),
      },
      2000,
    );

    const loaded = await manager.loadWorld(created.metadata.id);

    expect(loaded?.terrainEditChunks).toHaveLength(1);
    expect(loaded?.terrainEditChunks[0]?.edits).toEqual(
      expect.arrayContaining([
        [0, 0, TERRAIN_DEPTH_BLOCKS + 12, TerrainMaterial.Planks],
        [1, 0, 8, TerrainMaterial.Air],
      ]),
    );
  });

  it("applies saved edits over regenerated procedural terrain", async () => {
    const manager = createManager();
    const created = await manager.createWorld(
      { ...getDefaultGameSettings(), worldSeed: 9876 },
      1000,
    );
    const generated = generateTerrainColumn(0, 0, created.metadata.seed);
    const mineLevel = generated.blocks!.findIndex(
      (material) => material === TerrainMaterial.Stone,
    );
    const editedTerrain = new InfiniteTerrain(created.metadata.seed, 4, 1);

    expect(mineLevel).toBeGreaterThanOrEqual(0);
    editedTerrain.update({ x: 0, z: 0 });
    editedTerrain.setBlock(
      { q: 0, r: 0, level: mineLevel },
      TerrainMaterial.Air,
    );
    editedTerrain.setBlock(
      { q: 2, r: 0, level: TERRAIN_DEPTH_BLOCKS + 15 },
      TerrainMaterial.Wood,
    );

    await manager.saveWorld({
      metadata: created.metadata,
      player: { position: null },
      inventory: { selectedIndex: 0, items: [] },
      terrainEditChunks: editedTerrain.exportTerrainEditChunks(),
    });

    const loaded = await manager.loadWorld(created.metadata.id);
    const regenerated = new InfiniteTerrain(created.metadata.seed, 4, 1);

    regenerated.update({ x: 0, z: 0 });
    regenerated.importTerrainEditChunks(loaded?.terrainEditChunks ?? []);

    expect(regenerated.materialAt(0, 0, mineLevel)).toBe(TerrainMaterial.Air);
    expect(regenerated.materialAt(2, 0, TERRAIN_DEPTH_BLOCKS + 15)).toBe(
      TerrainMaterial.Wood,
    );
  });

  it("saves and loads stabilized dynamic material block metadata", async () => {
    const manager = createManager();
    const created = await manager.createWorld(getDefaultGameSettings(), 1000);
    const terrain = new InfiniteTerrain(created.metadata.seed, 4, 1);
    const position = { q: 0, r: 0, level: TERRAIN_DEPTH_BLOCKS + 16 };

    terrain.update({ x: 0, z: 0 });
    terrain.setBlock(
      position,
      TerrainMaterial.DynamicMaterial,
      "generated:saved-block",
    );

    await manager.saveWorld({
      metadata: created.metadata,
      player: { position: null },
      inventory: { selectedIndex: 0, items: [] },
      terrainEditChunks: terrain.exportTerrainEditChunks(),
    });

    const loaded = await manager.loadWorld(created.metadata.id);
    const regenerated = new InfiniteTerrain(created.metadata.seed, 4, 1);

    regenerated.importTerrainEditChunks(loaded?.terrainEditChunks ?? []);

    expect(regenerated.materialAt(position.q, position.r, position.level)).toBe(
      TerrainMaterial.DynamicMaterial,
    );
    expect(regenerated.dynamicMaterialIdAt(position)).toBe(
      "generated:saved-block",
    );
  });

  it("loads unknown dynamic material block metadata safely", async () => {
    const manager = createManager();
    const created = await manager.createWorld(getDefaultGameSettings(), 1000);
    const terrain = new InfiniteTerrain(created.metadata.seed, 4, 1);
    const position = { q: -2, r: 1, level: TERRAIN_DEPTH_BLOCKS + 14 };
    const unknownMaterialId = "generated:missing-block-material";
    const registry = materialRegistry();

    terrain.update({ x: 0, z: 0 });
    terrain.setBlock(
      position,
      TerrainMaterial.DynamicMaterial,
      unknownMaterialId,
    );

    await manager.saveWorld({
      metadata: created.metadata,
      player: { position: null },
      inventory: created.runtime.inventory,
      terrainEditChunks: terrain.exportTerrainEditChunks(),
    });

    const loaded = await manager.loadWorld(created.metadata.id);
    const regenerated = new InfiniteTerrain(
      created.metadata.seed,
      4,
      1,
      registry,
    );

    regenerated.importTerrainEditChunks(loaded?.terrainEditChunks ?? []);

    expect(regenerated.materialAt(position.q, position.r, position.level)).toBe(
      TerrainMaterial.DynamicMaterial,
    );
    expect(regenerated.dynamicMaterialIdAt(position)).toBe(unknownMaterialId);
    expect(
      dynamicMaterialBlockDisplayName(
        regenerated.dynamicMaterialIdAt(position),
        registry,
      ),
    ).toBe(UNKNOWN_DYNAMIC_MATERIAL_BLOCK_DISPLAY_NAME);
    expect(
      dynamicMaterialBlockDropItemId(
        regenerated.dynamicMaterialIdAt(position),
        registry,
      ),
    ).toBeNull();
  });

  it("saves and loads workbench block terrain edits", async () => {
    const manager = createManager();
    const created = await manager.createWorld(getDefaultGameSettings(), 1000);
    const terrain = new InfiniteTerrain(created.metadata.seed, 4, 1);
    const position = { q: 2, r: -1, level: TERRAIN_DEPTH_BLOCKS + 12 };

    terrain.update({ x: 0, z: 0 });
    terrain.setBlock(position, TerrainMaterial.BasicWorkbench);

    await manager.saveWorld({
      metadata: created.metadata,
      player: { position: null },
      inventory: created.runtime.inventory,
      terrainEditChunks: terrain.exportTerrainEditChunks(),
    });

    const loaded = await manager.loadWorld(created.metadata.id);
    const regenerated = new InfiniteTerrain(created.metadata.seed, 4, 1);

    regenerated.importTerrainEditChunks(loaded?.terrainEditChunks ?? []);

    expect(regenerated.materialAt(position.q, position.r, position.level)).toBe(
      TerrainMaterial.BasicWorkbench,
    );
  });

  it("serializes player position and new inventory shape", async () => {
    const manager = createManager();
    const created = await manager.createWorld(getDefaultGameSettings(), 1000);
    const inventory: SerializedInventory = {
      selectedHotbarIndex: 2,
      hotbar: [
        { itemId: "block:dirt", count: 4 },
        { itemId: "tool:pickaxe", count: 1, durability: 47 },
        { itemId: "block:wood", count: 3 },
      ],
      backpack: [{ itemId: "material:coal", count: 9 }],
    };

    await manager.saveWorld({
      metadata: created.metadata,
      player: { position: [4, 24, -8] },
      inventory,
      gameTime: { timeOfDay: 0.73, dayNumber: 9, paused: true },
      terrainEditChunks: [],
    });

    const loaded = await manager.loadWorld(created.metadata.id);

    expect(loaded?.runtime.player.position).toEqual([4, 24, -8]);
    expect(loaded?.runtime.inventory.selectedHotbarIndex).toBe(2);
    expect(loaded?.runtime.inventory.hotbar).toHaveLength(9);
    expect(loaded?.runtime.inventory.backpack).toHaveLength(27);
    expect(loaded?.runtime.inventory.hotbar?.slice(0, 3)).toEqual([
      { itemId: "block:dirt", count: 4 },
      { itemId: "tool:pickaxe", count: 1, durability: 47 },
      { itemId: "block:wood", count: 3 },
    ]);
    expect(loaded?.runtime.inventory.backpack?.[0]).toEqual({
      itemId: "material:coal",
      count: 9,
    });
    expect(loaded?.runtime.gameTime).toEqual({
      timeOfDay: 0.73,
      dayNumber: 9,
      paused: true,
    });
  });

  it("round-trips current game systems through save and load", async () => {
    const manager = createManager();
    const created = await manager.createWorld(getDefaultGameSettings(), 1000);
    const registry = materialRegistry();
    const iron = materialOrThrow(registry, "element:iron");
    const carbon = materialOrThrow(registry, "element:carbon");
    const result = combineMaterials(iron, carbon, registry);
    const terrain = new InfiniteTerrain(created.metadata.seed, 4, 1, registry);
    const dynamicBlockPosition = {
      q: 0,
      r: 0,
      level: TERRAIN_DEPTH_BLOCKS + 18,
    };
    const workbenchPosition = {
      q: 1,
      r: -1,
      level: TERRAIN_DEPTH_BLOCKS + 18,
    };

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const generatedMaterialId = result.material.id;
    const generatedItemId = itemIdForMaterial(generatedMaterialId);
    const modifiedItemId = modifiedToolItemId(
      "tool:pickaxe",
      generatedMaterialId,
    );
    const materialCodex = serializeMaterialCodex(registry, [
      "metallurgical",
      "crystalline",
    ]);

    terrain.update({ x: 0, z: 0 });
    terrain.setBlock(
      dynamicBlockPosition,
      TerrainMaterial.DynamicMaterial,
      generatedMaterialId,
    );
    terrain.setBlock(workbenchPosition, TerrainMaterial.AssemblerWorkbench);

    await manager.saveWorld({
      metadata: created.metadata,
      player: { position: [8, 32, -4] },
      inventory: {
        selectedHotbarIndex: 4,
        hotbar: [
          { itemId: "block:dirt", count: 11 },
          null,
          { itemId: modifiedItemId, count: 1, durability: 33 },
          null,
          { itemId: "block:basic_workbench", count: 1 },
        ],
        backpack: [
          { itemId: "block:stone", count: 12 },
          { itemId: generatedItemId, count: 5 },
        ],
      },
      materialCodex,
      materialStorage: {
        materials: [
          { materialId: generatedMaterialId, quantity: 9 },
          { materialId: "generated:unknown-storage", quantity: 3 },
        ],
      },
      terrainEditChunks: terrain.exportTerrainEditChunks(),
    });

    const loaded = await manager.loadWorld(created.metadata.id);

    expect(loaded?.runtime.player.position).toEqual([8, 32, -4]);
    expect(loaded?.runtime.inventory.selectedHotbarIndex).toBe(4);
    expect(loaded?.runtime.inventory.hotbar?.[0]).toEqual({
      itemId: "block:dirt",
      count: 11,
    });
    expect(loaded?.runtime.inventory.hotbar?.[2]).toEqual({
      itemId: modifiedItemId,
      count: 1,
      durability: 33,
    });
    expect(loaded?.runtime.inventory.hotbar?.[4]).toEqual({
      itemId: "block:basic_workbench",
      count: 1,
    });
    expect(loaded?.runtime.inventory.backpack?.[0]).toEqual({
      itemId: "block:stone",
      count: 12,
    });
    expect(loaded?.runtime.inventory.backpack?.[1]).toEqual({
      itemId: generatedItemId,
      count: 5,
    });
    expect(loaded?.runtime.materialStorage.materials).toHaveLength(2);
    expect(loaded?.runtime.materialStorage.materials).toEqual(
      expect.arrayContaining([
        { materialId: generatedMaterialId, quantity: 9 },
        { materialId: "generated:unknown-storage", quantity: 3 },
      ]),
    );
    expect(loaded?.runtime.materialCodex.discoveredMaterialIds).toContain(
      generatedMaterialId,
    );
    expect(loaded?.runtime.materialCodex.recipeResults).toEqual([
      expect.objectContaining({
        recipeKey: result.recipeKey,
        resultMaterialId: generatedMaterialId,
        stationType: "combiner",
      }),
    ]);
    expect(loaded?.runtime.materialCodex.unlockedResearchTiers).toEqual([
      "crystalline",
      "metallurgical",
    ]);

    const loadedRegistry = materialRegistryFromSerializedCodex(
      loaded?.runtime.materialCodex,
    );
    const loadedCodex = new MaterialCodex(loadedRegistry);
    const regenerated = new InfiniteTerrain(
      created.metadata.seed,
      4,
      1,
      loadedRegistry,
    );

    expect(loadedCodex.findById(generatedMaterialId)?.name).toBe(
      result.material.name,
    );
    expect(loadedCodex.discoveredMaterialIds()).toContain(generatedMaterialId);
    expect(loadedRegistry.getRecipeResult(iron.id, carbon.id)?.id).toBe(
      generatedMaterialId,
    );

    regenerated.importTerrainEditChunks(loaded?.terrainEditChunks ?? []);

    expect(
      regenerated.materialAt(
        workbenchPosition.q,
        workbenchPosition.r,
        workbenchPosition.level,
      ),
    ).toBe(TerrainMaterial.AssemblerWorkbench);
    expect(
      regenerated.materialAt(
        dynamicBlockPosition.q,
        dynamicBlockPosition.r,
        dynamicBlockPosition.level,
      ),
    ).toBe(TerrainMaterial.DynamicMaterial);
    expect(regenerated.dynamicMaterialIdAt(dynamicBlockPosition)).toBe(
      generatedMaterialId,
    );
    expect(
      dynamicMaterialBlockDropItemId(
        regenerated.dynamicMaterialIdAt(dynamicBlockPosition),
        loadedRegistry,
      ),
    ).toBe(generatedItemId);

    regenerated.setBlock(dynamicBlockPosition, TerrainMaterial.Air);

    expect(regenerated.dynamicMaterialIdAt(dynamicBlockPosition)).toBeNull();
  });

  it("saves and loads generated material items in backpack", async () => {
    const manager = createManager();
    const created = await manager.createWorld(getDefaultGameSettings(), 1000);
    const registry = materialRegistry();
    const copper = materialOrThrow(registry, "element:copper");
    const tin = materialOrThrow(registry, "element:tin");
    const result = combineMaterials(copper, tin, registry);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const itemId = itemIdForMaterial(result.material.id);

    await manager.saveWorld({
      metadata: created.metadata,
      player: { position: null },
      inventory: {
        selectedHotbarIndex: 0,
        hotbar: [],
        backpack: [{ itemId, count: 7 }],
      },
      materialCodex: serializeMaterialCodex(registry),
      materialStorage: {
        materials: [{ materialId: result.material.id, quantity: 2 }],
      },
      terrainEditChunks: [],
    });

    const loaded = await manager.loadWorld(created.metadata.id);

    expect(loaded?.runtime.inventory.backpack?.[0]).toEqual({
      itemId,
      count: 7,
    });
    expect(loaded?.runtime.materialCodex.generatedMaterials).toEqual([
      expect.objectContaining({
        id: result.material.id,
      }),
    ]);
    expect(loaded?.runtime.materialStorage.materials).toEqual([
      { materialId: result.material.id, quantity: 2 },
    ]);
  });

  it("saves and loads workbench block items", async () => {
    const manager = createManager();
    const created = await manager.createWorld(getDefaultGameSettings(), 1000);

    await manager.saveWorld({
      metadata: created.metadata,
      player: { position: null },
      inventory: {
        selectedHotbarIndex: 3,
        hotbar: [{ itemId: "block:basic_workbench", count: 1 }],
        backpack: [{ itemId: "block:assembler_workbench", count: 2 }],
      },
      terrainEditChunks: [],
    });

    const loaded = await manager.loadWorld(created.metadata.id);

    expect(loaded?.runtime.inventory.selectedHotbarIndex).toBe(3);
    expect(loaded?.runtime.inventory.hotbar?.[0]).toEqual({
      itemId: "block:basic_workbench",
      count: 1,
    });
    expect(loaded?.runtime.inventory.backpack?.[0]).toEqual({
      itemId: "block:assembler_workbench",
      count: 2,
    });
  });

  it("saves and loads modified tool item ids", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const manager = createManager();
    const created = await manager.createWorld(getDefaultGameSettings(), 1000);
    const itemId = modifiedToolItemId("tool:pickaxe", "element:iron");

    await manager.saveWorld({
      metadata: created.metadata,
      player: { position: null },
      inventory: {
        selectedHotbarIndex: 0,
        hotbar: [{ itemId, count: 1, durability: 41 }],
        backpack: [],
      },
      terrainEditChunks: [],
    });

    const loaded = await manager.loadWorld(created.metadata.id);

    expect(loaded?.runtime.inventory.hotbar?.[0]).toEqual({
      itemId,
      count: 1,
      durability: 41,
    });
    warn.mockRestore();
  });

  it("preserves unknown item and material ids without crashing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const manager = createManager();
    const created = await manager.createWorld(getDefaultGameSettings(), 1000);
    const missingMaterialItemId = itemIdForMaterial("generated:missing");

    await manager.saveWorld({
      metadata: created.metadata,
      player: { position: null },
      inventory: {
        selectedHotbarIndex: 0,
        hotbar: [{ itemId: "modded:item", count: 4 }],
        backpack: [{ itemId: missingMaterialItemId, count: 1 }],
      },
      terrainEditChunks: [],
    });

    const loaded = await manager.loadWorld(created.metadata.id);

    expect(loaded?.runtime.inventory.hotbar?.[0]).toEqual({
      itemId: "modded:item",
      count: 4,
    });
    expect(loaded?.runtime.inventory.backpack?.[0]).toEqual({
      itemId: missingMaterialItemId,
      count: 1,
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("modded:item"));
    warn.mockRestore();
  });

  it("generated material persists after save and load", async () => {
    const manager = createManager();
    const created = await manager.createWorld(getDefaultGameSettings(), 1000);
    const registry = materialRegistry();
    const copper = materialOrThrow(registry, "element:copper");
    const tin = materialOrThrow(registry, "element:tin");
    const result = combineMaterials(copper, tin, registry);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    await manager.saveWorld({
      metadata: created.metadata,
      player: { position: null },
      inventory: { selectedIndex: 0, items: [] },
      materialCodex: serializeMaterialCodex(registry),
      terrainEditChunks: [],
    });

    const loaded = await manager.loadWorld(created.metadata.id);
    const loadedRegistry = materialRegistryFromSerializedCodex(
      loaded?.runtime.materialCodex,
    );

    expect(loadedRegistry.getMaterialById(result.material.id)).toMatchObject({
      id: result.material.id,
      name: result.material.name,
      parents: result.material.parents,
    });
    expect(loaded?.runtime.materialCodex.discoveredMaterialIds).toContain(
      result.material.id,
    );
  });

  it("discovered base element persists after save and load", async () => {
    const manager = createManager();
    const created = await manager.createWorld(
      { ...getDefaultGameSettings(), gameMode: "survival" },
      1000,
    );
    const registry = new MaterialRegistry();

    registry.registerBaseMaterials(undefined, BASIC_STARTING_ELEMENT_IDS);
    expect(registry.discoverBaseMaterial("element:gold")).toBe(true);

    await manager.saveWorld({
      metadata: created.metadata,
      player: { position: null },
      inventory: { selectedIndex: 0, items: [] },
      materialCodex: serializeMaterialCodex(registry),
      terrainEditChunks: [],
    });

    const loaded = await manager.loadWorld(created.metadata.id);

    expect(loaded?.runtime.materialCodex.discoveredMaterialIds).toContain(
      "element:gold",
    );
    expect(loaded?.runtime.materialCodex.discoveredMaterialIds).toEqual(
      [...BASIC_STARTING_ELEMENT_IDS, "element:gold"].sort(),
    );
  });

  it("recipe history persists after save and load", async () => {
    const manager = createManager();
    const created = await manager.createWorld(getDefaultGameSettings(), 1000);
    const registry = materialRegistry();
    const iron = materialOrThrow(registry, "element:iron");
    const carbon = materialOrThrow(registry, "element:carbon");
    const result = combineMaterials(iron, carbon, registry);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    await manager.saveWorld({
      metadata: created.metadata,
      player: { position: null },
      inventory: { selectedIndex: 0, items: [] },
      materialCodex: serializeMaterialCodex(registry),
      terrainEditChunks: [],
    });

    const loaded = await manager.loadWorld(created.metadata.id);
    const loadedRegistry = materialRegistryFromSerializedCodex(
      loaded?.runtime.materialCodex,
    );

    expect(loaded?.runtime.materialCodex.recipeResults).toEqual([
      expect.objectContaining({
        recipeKey: result.recipeKey,
        parentAId: result.material.parents[0],
        parentBId: result.material.parents[1],
        resultMaterialId: result.material.id,
        stationType: "combiner",
      }),
    ]);
    expect(loadedRegistry.getRecipeResult(iron.id, carbon.id)?.id).toBe(
      result.material.id,
    );
  });

  it("duplicate generated material is not created after reload", async () => {
    const manager = createManager();
    const created = await manager.createWorld(getDefaultGameSettings(), 1000);
    const registry = materialRegistry();
    const iron = materialOrThrow(registry, "element:iron");
    const carbon = materialOrThrow(registry, "element:carbon");
    const result = combineMaterials(iron, carbon, registry);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    await manager.saveWorld({
      metadata: created.metadata,
      player: { position: null },
      inventory: { selectedIndex: 0, items: [] },
      materialCodex: serializeMaterialCodex(registry),
      terrainEditChunks: [],
    });

    const loaded = await manager.loadWorld(created.metadata.id);
    const loadedRegistry = materialRegistryFromSerializedCodex(
      loaded?.runtime.materialCodex,
    );
    const loadedIron = materialOrThrow(loadedRegistry, iron.id);
    const loadedCarbon = materialOrThrow(loadedRegistry, carbon.id);
    const generatedBefore = loadedRegistry
      .allMaterials()
      .filter((material) => material.generation > 0);
    const repeated = combineMaterials(loadedCarbon, loadedIron, loadedRegistry);
    const generatedAfter = loadedRegistry
      .allMaterials()
      .filter((material) => material.generation > 0);

    expect(repeated.ok).toBe(true);
    if (repeated.ok) {
      expect(repeated.discovered).toBe(false);
      expect(repeated.material.id).toBe(result.material.id);
    }
    expect(generatedAfter).toHaveLength(generatedBefore.length);
  });

  it("handles invalid saved generated material parent references safely", async () => {
    const manager = createManager();
    const created = await manager.createWorld(getDefaultGameSettings(), 1000);
    const registry = materialRegistry();
    const iron = materialOrThrow(registry, "element:iron");
    const carbon = materialOrThrow(registry, "element:carbon");
    const result = combineMaterials(iron, carbon, registry);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const codex = serializeMaterialCodex(registry);
    const generatedMaterial = codex.generatedMaterials[0];

    expect(generatedMaterial).toBeDefined();
    if (!generatedMaterial) {
      return;
    }

    const invalidMaterialId = "generated:invalid-parent";
    const invalidCodex = {
      ...codex,
      discoveredMaterialIds: [
        ...codex.discoveredMaterialIds.filter(
          (materialId) => materialId !== generatedMaterial.id,
        ),
        invalidMaterialId,
      ].sort(),
      generatedMaterials: [
        {
          ...generatedMaterial,
          id: invalidMaterialId,
          parents: ["element:iron", "missing:parent"],
        },
      ],
      recipeResults: [
        {
          recipeKey: result.recipeKey,
          parentAId: "element:iron",
          parentBId: "missing:parent",
          resultMaterialId: invalidMaterialId,
          stationType: "combiner" as const,
        },
      ],
    };

    await manager.saveWorld({
      metadata: created.metadata,
      player: { position: null },
      inventory: { selectedIndex: 0, items: [] },
      materialCodex: invalidCodex,
      terrainEditChunks: [],
    });

    const loaded = await manager.loadWorld(created.metadata.id);
    const loadedRegistry = materialRegistryFromSerializedCodex(
      loaded?.runtime.materialCodex,
    );

    expect(loadedRegistry.getMaterialById(invalidMaterialId)).toBeNull();
    expect(loadedRegistry.allRecipeResults()).toEqual([]);
  });

  it("supports multiple worlds, renaming, and deleting", async () => {
    const manager = createManager();
    const first = await manager.createWorld(
      { ...getDefaultGameSettings(), worldName: "First" },
      1000,
    );
    const second = await manager.createWorld(
      { ...getDefaultGameSettings(), worldName: "Second" },
      2000,
    );

    await manager.renameWorld(first.metadata.id, "Renamed", 3000);
    await manager.deleteWorld(second.metadata.id);

    const worlds = await manager.listWorlds();

    expect(worlds).toHaveLength(1);
    expect(worlds[0]?.id).toBe(first.metadata.id);
    expect(worlds[0]?.name).toBe("Renamed");
    expect(await manager.loadWorld(second.metadata.id)).toBeNull();
  });

  it("keeps current save data unchanged through the migration placeholder", async () => {
    const created = await createManager().createWorld(
      getDefaultGameSettings(),
      1000,
    );

    expect(migrateWorldSaveData(created)).toEqual(created);
  });
});
