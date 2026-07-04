import { describe, expect, it } from "vitest";

import { getDefaultGameSettings } from "../game/GameSettings.ts";
import {
  TERRAIN_DEPTH_BLOCKS,
  TerrainMaterial,
} from "../geometry/terrainChunk.ts";
import { DEFAULT_MATERIAL_CONFIG } from "../materials/MaterialConfig.ts";
import { BASE_ELEMENT_COUNT } from "../materials/BaseElements.ts";
import { combineMaterials } from "../materials/MaterialCombiner.ts";
import { MaterialRegistry } from "../materials/MaterialRegistry.ts";
import type { MaterialDefinition } from "../materials/MaterialTypes.ts";
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

  it("saves and loads dynamic material block metadata", async () => {
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

  it("serializes player position and inventory", async () => {
    const manager = createManager();
    const created = await manager.createWorld(getDefaultGameSettings(), 1000);
    const inventory: SerializedInventory = {
      selectedIndex: 2,
      slots: [
        { itemId: "block:dirt", count: 4 },
        { itemId: "tool:pickaxe", count: 1, durability: 47 },
        { itemId: "block:wood", count: 3 },
      ],
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
    expect(loaded?.runtime.inventory).toEqual(inventory);
    expect(loaded?.runtime.gameTime).toEqual({
      timeOfDay: 0.73,
      dayNumber: 9,
      paused: true,
    });
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
