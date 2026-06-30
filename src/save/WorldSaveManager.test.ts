import { describe, expect, it } from "vitest";

import { getDefaultGameSettings } from "../game/GameSettings.ts";
import {
  TERRAIN_DEPTH_BLOCKS,
  TerrainMaterial,
} from "../geometry/terrainChunk.ts";
import {
  generateTerrainColumn,
  InfiniteTerrain,
} from "../world/InfiniteTerrain.ts";
import { MemorySaveDatabase } from "./SaveDatabase.ts";
import {
  CURRENT_SAVE_VERSION,
  type SerializedInventory,
} from "./WorldSaveTypes.ts";
import { migrateWorldSaveData, WorldSaveManager } from "./WorldSaveManager.ts";

function createManager(): WorldSaveManager {
  return new WorldSaveManager(new MemorySaveDatabase());
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

    expect(migrateWorldSaveData(created)).toBe(created);
  });
});
