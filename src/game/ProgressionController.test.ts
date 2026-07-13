import { describe, expect, it } from "vitest";

import type { Recipe } from "../crafting/RecipeTypes.ts";
import { MemorySaveDatabase } from "../save/SaveDatabase.ts";
import { WorldSaveManager } from "../save/WorldSaveManager.ts";
import { getDefaultGameSettings } from "./GameSettings.ts";
import { ProgressionController } from "./ProgressionController.ts";

function shapelessRecipe(id: string, outputs: Recipe["outputs"]): Recipe {
  return {
    id,
    displayName: id,
    type: "shapeless",
    inputs: [],
    outputs,
    requiredWorkbench: "basic",
    workbenchType: "basic",
  };
}

describe("progression controller", () => {
  it("objective completes when item collected", () => {
    const progression = new ProgressionController({ mode: "survival" });

    expect(progression.recordItemCollected("block:wood", 1)).toBe(true);
    expect(progression.isComplete("collect_wood")).toBe(true);
    expect(progression.takeNotifications()).toEqual([
      "Objective complete: Collect wood",
    ]);
  });

  it("objective completes when recipe crafted", () => {
    const progression = new ProgressionController({ mode: "survival" });

    expect(
      progression.recordRecipeCrafted(
        shapelessRecipe("wood_to_planks", [
          { itemId: "block:planks", count: 4 },
        ]),
      ),
    ).toBe(true);
    expect(progression.isComplete("craft_planks")).toBe(true);
  });

  it("objective completes when material discovered", () => {
    const progression = new ProgressionController({ mode: "survival" });

    expect(progression.recordMaterialDiscovered("element:carbon")).toBe(true);
    expect(progression.isComplete("discover_carbon")).toBe(true);
  });

  it("completes generated material loop objectives", () => {
    const progression = new ProgressionController({ mode: "survival" });

    expect(progression.recordMaterialsCombined()).toBe(true);
    expect(
      progression.recordGeneratedMaterialStored("generated:g1:test", 1),
    ).toBe(true);
    expect(
      progression.recordRecipeCrafted(
        shapelessRecipe("modified-tool:tool:pickaxe:generated:g1:test", [
          {
            itemId: "modified-tool:tool:pickaxe:generated:g1:test",
            count: 1,
          },
        ]),
      ),
    ).toBe(true);

    expect(progression.isComplete("combine_first_materials")).toBe(true);
    expect(progression.isComplete("store_generated_material")).toBe(true);
    expect(progression.isComplete("upgrade_first_tool")).toBe(true);
  });

  it("objective progress persists", async () => {
    const manager = new WorldSaveManager(new MemorySaveDatabase());
    const save = await manager.createWorld(
      { ...getDefaultGameSettings(), gameMode: "survival" },
      1000,
    );
    const progression = new ProgressionController({
      mode: "survival",
      state: save.runtime.progression,
    });

    progression.recordItemCollected("block:wood", 1);
    progression.recordRecipeCrafted(
      shapelessRecipe("planks_to_sticks", [
        { itemId: "material:stick", count: 4 },
      ]),
    );
    progression.setHidden(true);

    await manager.saveWorld(
      {
        metadata: save.metadata,
        player: save.runtime.player,
        inventory: save.runtime.inventory,
        equipment: save.runtime.equipment,
        progression: progression.serialize(),
        gameTime: save.runtime.gameTime,
        materialCodex: save.runtime.materialCodex,
        materialStorage: save.runtime.materialStorage,
        terrainEditChunks: [],
      },
      2000,
    );

    const loaded = await manager.loadWorld(save.metadata.id);
    const reloaded = new ProgressionController({
      mode: "survival",
      state: loaded?.runtime.progression,
    });

    expect(reloaded.isComplete("collect_wood")).toBe(true);
    expect(reloaded.isComplete("craft_sticks")).toBe(true);
    expect(reloaded.isHidden()).toBe(true);
  });

  it("creative hides objectives by default", async () => {
    const progression = new ProgressionController({ mode: "creative" });
    const manager = new WorldSaveManager(new MemorySaveDatabase());
    const save = await manager.createWorld(
      { ...getDefaultGameSettings(), gameMode: "creative" },
      1000,
    );

    expect(progression.isHidden()).toBe(true);
    expect(save.runtime.progression.hidden).toBe(true);
  });
});
