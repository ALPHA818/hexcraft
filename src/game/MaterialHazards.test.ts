import { describe, expect, it } from "vitest";

import type {
  MaterialDefinition,
  MaterialStats,
} from "../materials/MaterialTypes.ts";
import {
  createMaterialHazardState,
  materialHazardsForMaterial,
  updateHeldMaterialHazards,
} from "./MaterialHazards.ts";

const BASE_STATS: MaterialStats = {
  stability: 75,
  hardness: 35,
  density: 35,
  heat: 22,
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
  stats: Partial<MaterialStats> = {},
  tags: readonly string[] = [],
): MaterialDefinition {
  return {
    id,
    name: id,
    generation: 1,
    parents: ["element:iron", "element:carbon"],
    rarity: "uncommon",
    ...BASE_STATS,
    ...stats,
    tags,
    discoveredAt: 0,
  };
}

describe("material hazards", () => {
  it("causes radioactive hazard damage and exposure in survival", () => {
    const material = testMaterial(
      "generated:hot-uranium",
      { radioactivity: 92 },
      ["radioactive"],
    );
    const state = createMaterialHazardState();
    const result = updateHeldMaterialHazards({
      mode: "survival",
      material,
      deltaSeconds: 1,
      state,
      config: { hazardDamageInterval: 1 },
    });

    expect(result.warnings).toContain("Radioactive material");
    expect(result.damage).toBeGreaterThan(0);
    expect(result.radiationExposureDelta).toBeGreaterThan(0);
    expect(state.radiationExposure).toBe(result.radiationExposure);
  });

  it("causes toxic hazard damage in survival", () => {
    const material = testMaterial("generated:venom-gel", { toxicity: 88 }, [
      "toxic",
      "poison",
    ]);
    const result = updateHeldMaterialHazards({
      mode: "survival",
      material,
      deltaSeconds: 1,
      state: createMaterialHazardState(),
      config: { hazardDamageInterval: 1 },
    });

    expect(result.warnings).toContain("Toxic material");
    expect(result.damage).toBeGreaterThan(0);
  });

  it("causes burning hazard damage for very hot unstabilized material", () => {
    const material = testMaterial("generated:ember-glass", { heat: 94 }, [
      "fire",
    ]);
    const stabilized = {
      ...material,
      id: "generated:stable-ember-glass",
      tags: ["fire", "stable"],
    };

    expect(
      materialHazardsForMaterial(material).map((hazard) => hazard.kind),
    ).toContain("hot");
    expect(
      materialHazardsForMaterial(stabilized).map((hazard) => hazard.kind),
    ).not.toContain("hot");
  });

  it("ignores hazard damage in creative", () => {
    const material = testMaterial(
      "generated:danger",
      { radioactivity: 95, toxicity: 95, heat: 95 },
      ["radioactive", "toxic", "fire"],
    );
    const result = updateHeldMaterialHazards({
      mode: "creative",
      material,
      deltaSeconds: 10,
      state: createMaterialHazardState(),
      config: { hazardDamageInterval: 1 },
    });

    expect(result.damage).toBe(0);
    expect(result.warnings).toEqual([]);
    expect(result.radiationExposureDelta).toBe(0);
  });

  it("respects the material hazard config toggle", () => {
    const material = testMaterial(
      "generated:disabled-rad",
      { radioactivity: 95 },
      ["radioactive"],
    );
    const result = updateHeldMaterialHazards({
      mode: "survival",
      material,
      deltaSeconds: 10,
      state: createMaterialHazardState(),
      config: { enableMaterialHazards: false, hazardDamageInterval: 1 },
    });

    expect(result.damage).toBe(0);
    expect(result.warnings).toEqual([]);
    expect(result.radiationExposureDelta).toBe(0);
  });

  it("does not flag safe materials", () => {
    const material = testMaterial("generated:plain-alloy");
    const result = updateHeldMaterialHazards({
      mode: "survival",
      material,
      deltaSeconds: 10,
      state: createMaterialHazardState(),
      config: { hazardDamageInterval: 1 },
    });

    expect(result.hazards).toEqual([]);
    expect(result.damage).toBe(0);
  });

  it("uses the hazard interval instead of damaging every frame", () => {
    const material = testMaterial("generated:slow-rad", { radioactivity: 90 }, [
      "radioactive",
    ]);
    const state = createMaterialHazardState();
    const first = updateHeldMaterialHazards({
      mode: "survival",
      material,
      deltaSeconds: 0.5,
      state,
      config: { hazardDamageInterval: 2 },
    });
    const second = updateHeldMaterialHazards({
      mode: "survival",
      material,
      deltaSeconds: 1.4,
      state,
      config: { hazardDamageInterval: 2 },
    });
    const third = updateHeldMaterialHazards({
      mode: "survival",
      material,
      deltaSeconds: 0.2,
      state,
      config: { hazardDamageInterval: 2 },
    });

    expect(first.damage).toBe(0);
    expect(second.damage).toBe(0);
    expect(third.damage).toBeGreaterThan(0);
  });
});
