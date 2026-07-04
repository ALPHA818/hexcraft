import { describe, expect, it } from "vitest";

import { getDefaultGameSettings } from "../game/GameSettings.ts";
import { MaterialWorldController } from "../game/MaterialWorldController.ts";
import { MemorySaveDatabase } from "../save/SaveDatabase.ts";
import { WorldSaveManager } from "../save/WorldSaveManager.ts";
import type {
  MaterialDefinition,
  MaterialStats,
} from "../materials/MaterialTypes.ts";
import { materialResearchTierRows } from "./MaterialResearchPanel.ts";

const BASE_STATS: MaterialStats = {
  stability: 70,
  hardness: 35,
  density: 35,
  heat: 30,
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

function testMaterial(
  id: string,
  name: string,
  tags: readonly string[],
  stats: Partial<MaterialStats> = {},
): MaterialDefinition {
  return {
    id: `research-ui-test:${id}`,
    name,
    generation: 0,
    parents: [],
    rarity: "common",
    ...BASE_STATS,
    ...stats,
    tags,
    discoveredAt: 0,
  };
}

function survivalWorldWithFire(): Readonly<{
  materialWorld: MaterialWorldController;
  fire: MaterialDefinition;
}> {
  const materialWorld = new MaterialWorldController({ mode: "survival" });
  const fire = testMaterial("fire", "Volatile Fire", ["fire", "fuel"], {
    heat: 96,
  });

  materialWorld.registry.registerGeneratedMaterial(fire);
  materialWorld.discoverMaterial(fire.id);

  return { materialWorld, fire };
}

describe("material research panel helpers", () => {
  it("lists the current research tiers with lock state", () => {
    const rows = materialResearchTierRows(["metallurgical", "arcane"]);

    expect(rows.map((row) => row.label)).toEqual([
      "Primitive",
      "Chemical",
      "Metallurgical",
      "Crystalline",
      "Arcane",
      "Radioactive",
      "Void",
      "Celestial",
    ]);
    expect(rows.find((row) => row.tier === "metallurgical")).toMatchObject({
      unlocked: true,
    });
    expect(rows.find((row) => row.tier === "chemical")).toMatchObject({
      unlocked: false,
    });
  });

  it("blocks locked tiers for survival reactions", () => {
    const { materialWorld, fire } = survivalWorldWithFire();
    const preview = materialWorld.previewResearchRequirement(
      fire.id,
      "element:iron",
    );
    const result = materialWorld.combine(fire.id, "element:iron");

    expect(preview).toMatchObject({
      requiredResearchTier: "metallurgical",
      lockedResearchTier: "metallurgical",
      message: "Requires Metallurgical Research",
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "research_locked",
      requiredResearchTier: "metallurgical",
    });
  });

  it("allows survival reactions after unlocking the tier", () => {
    const { materialWorld, fire } = survivalWorldWithFire();

    expect(materialWorld.unlockResearchTier("metallurgical")).toBe(true);
    expect(
      materialWorld.previewResearchRequirement(fire.id, "element:iron"),
    ).toMatchObject({
      requiredResearchTier: "metallurgical",
      lockedResearchTier: null,
    });

    const result = materialWorld.combine(fire.id, "element:iron");

    expect(result.ok).toBe(true);
  });

  it("persists unlocked tiers through world save and load", async () => {
    const manager = new WorldSaveManager(new MemorySaveDatabase());
    const created = await manager.createWorld(
      { ...getDefaultGameSettings(), gameMode: "survival" },
      1000,
    );
    const materialWorld = new MaterialWorldController({
      materialCodex: created.runtime.materialCodex,
      mode: "survival",
    });

    materialWorld.unlockResearchTier("metallurgical");
    materialWorld.unlockResearchTier("radioactive");

    await manager.saveWorld(
      {
        metadata: created.metadata,
        player: created.runtime.player,
        inventory: created.runtime.inventory,
        gameTime: created.runtime.gameTime,
        materialCodex: materialWorld.serialize(),
        terrainEditChunks: [],
      },
      2000,
    );

    const loaded = await manager.loadWorld(created.metadata.id);
    const reloadedMaterialWorld = new MaterialWorldController({
      materialCodex: loaded?.runtime.materialCodex,
      mode: "survival",
    });

    expect(loaded?.runtime.materialCodex.unlockedResearchTiers).toEqual([
      "metallurgical",
      "radioactive",
    ]);
    expect(reloadedMaterialWorld.isResearchTierUnlocked("metallurgical")).toBe(
      true,
    );
    expect(reloadedMaterialWorld.isResearchTierUnlocked("radioactive")).toBe(
      true,
    );
  });
});
