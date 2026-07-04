import { describe, expect, it } from "vitest";

import {
  generatedMaterialRecipesForMaterial,
  GENERATED_MATERIAL_RECIPE_OUTPUTS,
} from "./GeneratedMaterialRecipes.ts";
import {
  itemIdForMaterial,
  modifiedToolItemId,
} from "../items/ItemRegistry.ts";
import type {
  MaterialDefinition,
  MaterialStats,
} from "../materials/MaterialTypes.ts";

const BASE_STATS: MaterialStats = {
  stability: 35,
  hardness: 15,
  density: 20,
  heat: 10,
  conductivity: 10,
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
  stats: Partial<MaterialStats>,
  tags: readonly string[] = [],
): MaterialDefinition {
  return {
    id,
    name: id
      .replace(/^generated:/, "")
      .replaceAll(/[-:]/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase()),
    generation: 1,
    parents: ["element:iron", "element:carbon"],
    rarity: "rare",
    ...BASE_STATS,
    ...stats,
    tags,
    discoveredAt: 1,
  };
}

function recipeKinds(material: MaterialDefinition): readonly string[] {
  return generatedMaterialRecipesForMaterial(material, {
    baseToolIds: ["tool:pickaxe"],
  }).map((recipe) => recipe.generatedRecipeKind);
}

describe("generated material recipes", () => {
  it("enables tool upgrades for high tool grade materials", () => {
    const material = testMaterial(
      "generated:hard-alloy",
      {
        stability: 88,
        hardness: 96,
        density: 76,
        conductivity: 64,
        metal: 96,
      },
      ["metal", "alloy", "forged"],
    );
    const recipes = generatedMaterialRecipesForMaterial(material, {
      baseToolIds: ["tool:pickaxe"],
    });

    expect(recipes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          generatedRecipeKind: "tool_upgrade",
          inputs: [
            { itemId: "tool:pickaxe", count: 1 },
            { itemId: itemIdForMaterial(material.id), count: 1 },
          ],
          outputs: [
            {
              itemId: modifiedToolItemId("tool:pickaxe", material.id),
              count: 1,
            },
          ],
        }),
      ]),
    );
  });

  it("enables stabilized block recipes for high building grade materials", () => {
    const material = testMaterial(
      "generated:fortress-stone",
      {
        stability: 98,
        hardness: 92,
        density: 86,
        metal: 18,
        crystal: 12,
      },
      ["building", "stone", "stable"],
    );
    const recipes = generatedMaterialRecipesForMaterial(material, {
      baseToolIds: [],
    });

    expect(recipeKinds(material)).toContain("stabilized_block");
    expect(recipes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          generatedRecipeKind: "stabilized_block",
          outputs: [{ itemId: itemIdForMaterial(material.id), count: 1 }],
        }),
      ]),
    );
  });

  it("enables magic core recipes for high magic focus materials", () => {
    const material = testMaterial(
      "generated:arcane-crystal",
      {
        stability: 82,
        conductivity: 66,
        magic: 98,
        crystal: 96,
      },
      ["magic", "arcane", "crystal", "focus"],
    );

    expect(generatedMaterialRecipesForMaterial(material)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          generatedRecipeKind: "magic_core",
          outputs: [
            { itemId: GENERATED_MATERIAL_RECIPE_OUTPUTS.magicCore, count: 1 },
          ],
        }),
      ]),
    );
  });

  it("enables fuel item recipes for high fuel grade materials", () => {
    const material = testMaterial(
      "generated:ember-gas",
      {
        stability: 42,
        heat: 98,
        organic: 86,
        gas: 82,
        density: 6,
      },
      ["fuel", "fire", "gas"],
    );

    expect(generatedMaterialRecipesForMaterial(material)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          generatedRecipeKind: "fuel_cell",
          outputs: [
            { itemId: GENERATED_MATERIAL_RECIPE_OUTPUTS.fuelCell, count: 1 },
          ],
        }),
      ]),
    );
  });

  it("enables explosive compound recipes for high explosive grade materials", () => {
    const material = testMaterial(
      "generated:blast-vapor",
      {
        stability: 12,
        heat: 98,
        toxicity: 58,
        gas: 99,
        density: 4,
      },
      ["explosive", "volatile", "fire", "gas", "unstable"],
    );

    expect(generatedMaterialRecipesForMaterial(material)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          generatedRecipeKind: "explosive_compound",
          outputs: [
            {
              itemId: GENERATED_MATERIAL_RECIPE_OUTPUTS.explosiveCompound,
              count: 1,
            },
          ],
        }),
      ]),
    );
  });

  it("enables circuit recipes for high conductor grade materials", () => {
    const material = testMaterial(
      "generated:copper-thread",
      {
        stability: 78,
        conductivity: 100,
        metal: 92,
        liquid: 18,
        crystal: 18,
      },
      ["conductive", "metal", "copper"],
    );

    expect(generatedMaterialRecipesForMaterial(material)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          generatedRecipeKind: "circuit",
          outputs: [
            { itemId: GENERATED_MATERIAL_RECIPE_OUTPUTS.circuit, count: 1 },
          ],
        }),
      ]),
    );
  });

  it("does not unlock advanced recipes for low quality materials", () => {
    const material = testMaterial("generated:muddy-slush", {}, ["mud"]);

    expect(generatedMaterialRecipesForMaterial(material)).toEqual([]);
  });
});
