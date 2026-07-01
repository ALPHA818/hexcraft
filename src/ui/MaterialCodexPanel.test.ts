import { describe, expect, it } from "vitest";

import { combineMaterials } from "../materials/MaterialCombiner.ts";
import { MaterialRegistry } from "../materials/MaterialRegistry.ts";
import type { MaterialDefinition } from "../materials/MaterialTypes.ts";
import {
  discoveredMaterialsForCodex,
  materialCodexTags,
  materialStatsViewModel,
  topMaterialTags,
} from "./MaterialCodexPanel.ts";
import {
  materialBalanceRows,
  materialCapabilityRows,
  materialStatRows,
} from "./MaterialStatsView.ts";

function registryWithDiscovery(): Readonly<{
  registry: MaterialRegistry;
  iron: MaterialDefinition;
  carbon: MaterialDefinition;
  generated: MaterialDefinition;
}> {
  const registry = new MaterialRegistry();

  registry.registerBaseMaterials();
  const iron = registry.getMaterialById("element:iron");
  const carbon = registry.getMaterialById("element:carbon");

  if (!iron || !carbon) {
    throw new Error("Missing material codex test elements.");
  }

  const result = combineMaterials(iron, carbon, registry);

  if (!result.ok) {
    throw new Error(result.message);
  }

  return {
    registry,
    iron,
    carbon,
    generated: result.material,
  };
}

describe("material codex panel helpers", () => {
  it("searches discovered materials by name", () => {
    const { registry } = registryWithDiscovery();
    const materials = discoveredMaterialsForCodex(registry, "iron");

    expect(materials.some((material) => material.name === "Iron")).toBe(true);
  });

  it("filters discovered materials by tag", () => {
    const { registry } = registryWithDiscovery();
    const metals = discoveredMaterialsForCodex(registry, "", "metal");

    expect(metals.length).toBeGreaterThan(0);
    expect(
      metals.every((material) =>
        material.tags.some((tag) => tag.toLowerCase() === "metal"),
      ),
    ).toBe(true);
  });

  it("sorts discovered materials by generation", () => {
    const { registry, generated } = registryWithDiscovery();
    const materials = discoveredMaterialsForCodex(
      registry,
      "",
      "",
      "generation-desc",
    );

    expect(materials[0]?.generation).toBeGreaterThanOrEqual(
      generated.generation,
    );
  });

  it("shows recipe history and known children", () => {
    const { registry, iron, carbon, generated } = registryWithDiscovery();
    const generatedView = materialStatsViewModel(generated, registry);
    const ironView = materialStatsViewModel(iron, registry);

    expect(generatedView.parentNames).toEqual([carbon.name, iron.name]);
    expect(ironView.childResults).toEqual([
      expect.objectContaining({
        materialId: generated.id,
      }),
    ]);
  });

  it("returns top tags and stat rows for details display", () => {
    const { registry, iron } = registryWithDiscovery();

    expect(topMaterialTags(iron)).toHaveLength(3);
    expect(materialCodexTags(registry)).toContain("metal");
    expect(materialStatRows(iron).map(([label]) => label)).toContain(
      "Stability",
    );
    expect(materialStatRows(iron).map(([label]) => label)).toContain(
      "Organic %",
    );
    expect(materialCapabilityRows(iron).map(([label]) => label)).toContain(
      "Tool grade",
    );
    expect(
      materialCapabilityRows(iron).map(([, value]) => value),
    ).toContainEqual(expect.stringMatching(/\/100$/));
    expect(materialBalanceRows(iron).map(([label]) => label)).toContain(
      "Value score",
    );
  });
});
