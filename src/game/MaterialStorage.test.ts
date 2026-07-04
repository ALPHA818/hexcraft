import { describe, expect, it } from "vitest";

import { getDefaultGameSettings } from "./GameSettings.ts";
import {
  MaterialStorage,
  materialStorageEntries,
  materialStorageTags,
} from "./MaterialStorage.ts";
import { MemorySaveDatabase } from "../save/SaveDatabase.ts";
import { WorldSaveManager } from "../save/WorldSaveManager.ts";
import type {
  MaterialDefinition,
  MaterialStats,
} from "../materials/MaterialTypes.ts";

const BASE_STATS: MaterialStats = {
  stability: 70,
  hardness: 35,
  density: 35,
  heat: 20,
  conductivity: 20,
  toxicity: 0,
  radioactivity: 0,
  magic: 0,
  organic: 0,
  metal: 0,
  crystal: 0,
  gas: 0,
  liquid: 0,
};

function material(
  id: string,
  name: string,
  generation: number,
  rarity: MaterialDefinition["rarity"],
  tags: readonly string[],
): MaterialDefinition {
  return {
    id,
    name,
    generation,
    parents: ["element:iron", "element:carbon"],
    rarity,
    ...BASE_STATS,
    tags,
    discoveredAt: 1,
  };
}

const materials = [
  material("generated:g1:ember", "Embersteel", 1, "rare", ["metal", "fire"]),
  material("generated:g3:crystal", "Glass Quartz", 3, "epic", ["crystal"]),
  material("generated:g2:toxin", "Toxin Resin", 2, "uncommon", [
    "organic",
    "toxic",
  ]),
] as const;

const resolver = {
  getMaterialById: (materialId: string): MaterialDefinition | null =>
    materials.find((entry) => entry.id === materialId) ?? null,
};

describe("material storage", () => {
  it("stores many generated materials separately from hotbar inventory", () => {
    const storage = new MaterialStorage();

    expect(storage.addMaterial(materials[0].id, 40)).toBe(true);
    expect(storage.addMaterial(materials[1].id, 72)).toBe(true);
    expect(storage.addMaterial(materials[0].id, 4)).toBe(true);

    expect(storage.count(materials[0].id)).toBe(44);
    expect(storage.count(materials[1].id)).toBe(72);
    expect(storage.has(materials[2].id)).toBe(false);
    expect(storage.serialize().materials).toEqual([
      { materialId: materials[0].id, quantity: 44 },
      { materialId: materials[1].id, quantity: 72 },
    ]);
  });

  it("removes material quantities safely", () => {
    const storage = new MaterialStorage();

    storage.addMaterial(materials[0].id, 3);

    expect(storage.removeMaterial(materials[0].id, 2)).toBe(true);
    expect(storage.count(materials[0].id)).toBe(1);
    expect(storage.removeMaterial(materials[0].id, 2)).toBe(false);
    expect(storage.removeMaterial(materials[0].id, 1)).toBe(true);
    expect(storage.has(materials[0].id)).toBe(false);
  });

  it("normalizes saved storage and merges duplicate entries", () => {
    const storage = new MaterialStorage({
      materials: [
        { materialId: materials[0].id, quantity: 2 },
        { materialId: materials[0].id, quantity: 3 },
        { materialId: "", quantity: 50 },
        { materialId: materials[1].id, quantity: -1 },
      ],
    });

    expect(storage.serialize().materials).toEqual([
      { materialId: materials[0].id, quantity: 5 },
    ]);
  });

  it("sorts storage by name, generation, rarity, quantity, and tag", () => {
    const storage = new MaterialStorage();

    storage.addMaterial(materials[0].id, 5);
    storage.addMaterial(materials[1].id, 2);
    storage.addMaterial(materials[2].id, 9);

    expect(
      materialStorageEntries(storage, resolver, { sort: "name" }).map(
        (entry) => entry.materialId,
      ),
    ).toEqual([materials[0].id, materials[1].id, materials[2].id]);
    expect(
      materialStorageEntries(storage, resolver, { sort: "generation" })[0]
        ?.materialId,
    ).toBe(materials[1].id);
    expect(
      materialStorageEntries(storage, resolver, { sort: "rarity" })[0]
        ?.materialId,
    ).toBe(materials[1].id);
    expect(
      materialStorageEntries(storage, resolver, { sort: "quantity" })[0]
        ?.materialId,
    ).toBe(materials[2].id);
    expect(
      materialStorageEntries(storage, resolver, { sort: "tag" }).map(
        (entry) => entry.materialId,
      ),
    ).toEqual([materials[1].id, materials[0].id, materials[2].id]);
  });

  it("filters storage by material tag", () => {
    const storage = new MaterialStorage();

    storage.addMaterial(materials[0].id, 5);
    storage.addMaterial(materials[1].id, 2);

    expect(materialStorageTags(storage, resolver)).toEqual([
      "crystal",
      "fire",
      "metal",
    ]);
    expect(
      materialStorageEntries(storage, resolver, { tag: "metal" }).map(
        (entry) => entry.materialId,
      ),
    ).toEqual([materials[0].id]);
  });

  it("persists material storage through world save and load", async () => {
    const manager = new WorldSaveManager(new MemorySaveDatabase());
    const created = await manager.createWorld(getDefaultGameSettings(), 1000);
    const storage = new MaterialStorage();

    storage.addMaterial(materials[0].id, 12);

    await manager.saveWorld({
      metadata: created.metadata,
      player: created.runtime.player,
      inventory: created.runtime.inventory,
      gameTime: created.runtime.gameTime,
      materialCodex: created.runtime.materialCodex,
      materialStorage: storage.serialize(),
      terrainEditChunks: [],
    });

    const loaded = await manager.loadWorld(created.metadata.id);

    expect(loaded?.runtime.materialStorage.materials).toEqual([
      { materialId: materials[0].id, quantity: 12 },
    ]);
  });

  it("old saves without storage load with empty material storage", async () => {
    const database = new MemorySaveDatabase();
    const manager = new WorldSaveManager(database);
    const created = await manager.createWorld(getDefaultGameSettings(), 1000);

    await database.putWorldRuntimeState({
      ...created.runtime,
      materialStorage: undefined,
    } as unknown as typeof created.runtime);

    const loaded = await manager.loadWorld(created.metadata.id);

    expect(loaded?.runtime.materialStorage.materials).toEqual([]);
  });
});
