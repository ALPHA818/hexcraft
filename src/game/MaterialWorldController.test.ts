import { describe, expect, it } from "vitest";

import { BASE_ELEMENT_COUNT } from "../materials/BaseElements.ts";
import { DEFAULT_MATERIAL_CONFIG } from "../materials/MaterialConfig.ts";
import {
  BASIC_STARTING_ELEMENT_IDS,
  emptyMaterialCodexSave,
} from "../save/WorldSaveTypes.ts";
import { MaterialWorldController } from "./MaterialWorldController.ts";

const EXPECTED_BASIC_STARTING_ELEMENT_IDS = [
  "element:carbon",
  "element:chlorine",
  "element:copper",
  "element:hydrogen",
  "element:iron",
  "element:nitrogen",
  "element:oxygen",
  "element:silicon",
  "element:sodium",
  "element:sulfur",
];

describe("material world controller", () => {
  it("creates a registry with all base elements for the active world", () => {
    const controller = new MaterialWorldController();

    expect(controller.registry.allMaterials()).toHaveLength(BASE_ELEMENT_COUNT);
    expect(controller.getMaterialById("element:oxygen")).toMatchObject({
      id: "element:oxygen",
      generation: 0,
    });
    expect(controller.hasDiscovered("element:oxygen")).toBe(true);
  });

  it("discovers all base elements in all starting mode", () => {
    const controller = new MaterialWorldController({
      config: {
        ...DEFAULT_MATERIAL_CONFIG,
        startingElementMode: "all",
      },
      mode: "survival",
    });

    expect(controller.serialize().discoveredMaterialIds).toHaveLength(
      BASE_ELEMENT_COUNT,
    );
  });

  it("discovers only basic starter elements in basic starting mode", () => {
    const controller = new MaterialWorldController({
      config: {
        ...DEFAULT_MATERIAL_CONFIG,
        startingElementMode: "basic",
      },
      mode: "survival",
    });

    expect([...BASIC_STARTING_ELEMENT_IDS].sort()).toEqual(
      EXPECTED_BASIC_STARTING_ELEMENT_IDS,
    );
    expect(controller.serialize().discoveredMaterialIds).toEqual(
      EXPECTED_BASIC_STARTING_ELEMENT_IDS,
    );
  });

  it("discovers all base elements for creativeAll creative worlds", () => {
    const controller = new MaterialWorldController({
      config: {
        ...DEFAULT_MATERIAL_CONFIG,
        startingElementMode: "creativeAll",
      },
      mode: "creative",
    });

    expect(controller.serialize().discoveredMaterialIds).toHaveLength(
      BASE_ELEMENT_COUNT,
    );
  });

  it("discovers only starter elements for creativeAll survival worlds", () => {
    const controller = new MaterialWorldController({
      config: {
        ...DEFAULT_MATERIAL_CONFIG,
        startingElementMode: "creativeAll",
      },
      mode: "survival",
    });

    expect(controller.serialize().discoveredMaterialIds).toEqual(
      [...BASIC_STARTING_ELEMENT_IDS].sort(),
    );
  });

  it("loads discovered material ids and research tiers from save data", () => {
    const controller = new MaterialWorldController({
      materialCodex: emptyMaterialCodexSave(
        ["element:oxygen"],
        ["metallurgical"],
      ),
      mode: "survival",
    });

    expect(controller.registry.allMaterials()).toHaveLength(BASE_ELEMENT_COUNT);
    expect(controller.hasDiscovered("element:oxygen")).toBe(true);
    expect(controller.hasDiscovered("element:hydrogen")).toBe(false);
    expect(controller.serialize().unlockedResearchTiers).toEqual([
      "metallurgical",
    ]);
  });

  it("discovers base materials without duplicating discoveries", () => {
    const controller = new MaterialWorldController({
      materialCodex: emptyMaterialCodexSave(BASIC_STARTING_ELEMENT_IDS),
      mode: "survival",
    });

    expect(controller.hasDiscovered("element:gold")).toBe(false);
    expect(controller.discoverMaterial("element:gold")).toBe(true);
    expect(controller.discoverMaterial("element:gold")).toBe(false);
    expect(controller.discoverMaterial("missing:material")).toBe(false);
    expect(controller.hasDiscovered("element:gold")).toBe(true);
    expect(controller.serialize().discoveredMaterialIds).toContain(
      "element:gold",
    );
  });

  it("preserves discovered base materials after serialize and reload", () => {
    const controller = new MaterialWorldController({
      config: {
        ...DEFAULT_MATERIAL_CONFIG,
        startingElementMode: "basic",
      },
      mode: "survival",
    });

    expect(controller.discoverMaterial("element:gold")).toBe(true);

    const reloaded = new MaterialWorldController({
      materialCodex: controller.serialize(),
      mode: "survival",
    });

    expect(reloaded.serialize().discoveredMaterialIds).toEqual(
      [...BASIC_STARTING_ELEMENT_IDS, "element:gold"].sort(),
    );
  });

  it("combines, records recipes, serializes, and reloads generated materials", () => {
    const controller = new MaterialWorldController();
    const result = controller.combine(
      "element:copper",
      "element:tin",
      "combiner",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const knownResult = controller.getKnownResult(
      "element:tin",
      "element:copper",
      "combiner",
    );
    const recipe = controller.getRecipeForMaterial(result.material.id);

    expect(knownResult?.id).toBe(result.material.id);
    expect(recipe).toMatchObject({
      recipeKey: result.recipeKey,
      parentAId: result.material.parents[0],
      parentBId: result.material.parents[1],
      resultMaterialId: result.material.id,
      stationType: "combiner",
    });
    expect(controller.listDiscoveredMaterials()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: result.material.id }),
      ]),
    );

    const reloaded = new MaterialWorldController({
      materialCodex: controller.serialize(),
    });
    const directReload = new MaterialWorldController(controller.serialize());

    expect(reloaded.getMaterialById(result.material.id)).toMatchObject({
      id: result.material.id,
      name: result.material.name,
      parents: result.material.parents,
    });
    expect(directReload.getMaterialById(result.material.id)?.id).toBe(
      result.material.id,
    );
    expect(
      reloaded.getKnownResult("element:copper", "element:tin", "combiner")?.id,
    ).toBe(result.material.id);
    expect(reloaded.getRecipeForMaterial(result.material.id)).toMatchObject({
      recipeKey: result.recipeKey,
      resultMaterialId: result.material.id,
    });
  });

  it("can manually discover generated materials before reload", () => {
    const controller = new MaterialWorldController({
      config: {
        ...DEFAULT_MATERIAL_CONFIG,
        instantDiscovery: false,
      },
    });
    const result = controller.combine(
      "element:copper",
      "element:tin",
      "combiner",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(controller.hasDiscovered(result.material.id)).toBe(false);

    expect(controller.discoverMaterial(result.material.id)).toBe(true);
    expect(controller.hasDiscovered(result.material.id)).toBe(true);

    const serialized = controller.serialize();
    const reloaded = new MaterialWorldController({
      materialCodex: serialized,
      config: {
        ...DEFAULT_MATERIAL_CONFIG,
        instantDiscovery: false,
      },
    });

    expect(serialized.generatedMaterials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: result.material.id }),
      ]),
    );
    expect(serialized.discoveredMaterialIds).toContain(result.material.id);
    expect(reloaded.hasDiscovered(result.material.id)).toBe(true);
  });

  it("handles invalid ids cleanly", () => {
    const controller = new MaterialWorldController();

    expect(controller.getMaterialById("missing:material")).toBeNull();
    expect(controller.getRecipeForMaterial("missing:material")).toBeNull();
    expect(
      controller.getKnownResult("missing:material", "element:iron", "combiner"),
    ).toBeNull();
    expect(
      controller.combine("missing:material", "element:iron", "combiner"),
    ).toMatchObject({
      ok: false,
      reason: "missing_parent",
    });
  });
});
