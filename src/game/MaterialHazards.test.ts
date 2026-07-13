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
import { MaterialStorage } from "./MaterialStorage.ts";

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

  it("creates burning hot warning for held hot material", () => {
    const material = testMaterial("generated:hot-coal", { heat: 90 }, ["fire"]);
    const result = updateHeldMaterialHazards({
      mode: "survival",
      material,
      deltaSeconds: 1,
      state: createMaterialHazardState(),
      config: { hazardDamageInterval: 1 },
    });

    expect(result.warnings).toContain("Burning hot material");
    expect(result.damage).toBeGreaterThan(0);
  });

  it("creates unstable warning without immediate damage by itself", () => {
    const material = testMaterial(
      "generated:unstable-glass",
      { stability: 12 },
      ["unstable"],
    );
    const result = updateHeldMaterialHazards({
      mode: "survival",
      material,
      deltaSeconds: 1,
      state: createMaterialHazardState(),
      config: { hazardDamageInterval: 1 },
    });

    expect(result.warnings).toContain("Unstable material");
    expect(result.damage).toBe(0);
  });

  it("does not punish hazardous materials kept in storage", () => {
    const material = testMaterial(
      "generated:stored-uranium",
      { radioactivity: 95 },
      ["radioactive"],
    );
    const storage = new MaterialStorage();

    storage.addMaterial(material.id, 4);
    const result = updateHeldMaterialHazards({
      mode: "survival",
      material: null,
      deltaSeconds: 10,
      state: createMaterialHazardState(),
      config: { hazardDamageInterval: 1 },
    });

    expect(storage.count(material.id)).toBe(4);
    expect(result.warnings).toEqual([]);
    expect(result.damage).toBe(0);
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

  it("uses configured thresholds and protection placeholders", () => {
    const material = testMaterial(
      "generated:protected-rad",
      { radioactivity: 62 },
      [],
    );
    const unprotected = updateHeldMaterialHazards({
      mode: "survival",
      material,
      deltaSeconds: 1,
      state: createMaterialHazardState(),
      config: {
        hazardDamageInterval: 1,
        hazardRadioactivityThreshold: 60,
      },
    });
    const protectedResult = updateHeldMaterialHazards({
      mode: "survival",
      material,
      deltaSeconds: 1,
      state: createMaterialHazardState(),
      protection: { radioactive: 0.5 },
      config: {
        hazardDamageInterval: 1,
        hazardRadioactivityThreshold: 60,
      },
    });

    expect(unprotected.warnings).toContain("Radioactive material");
    expect(protectedResult.damage).toBeCloseTo(unprotected.damage * 0.5);
    expect(protectedResult.radiationExposureDelta).toBeCloseTo(
      unprotected.radiationExposureDelta * 0.5,
    );
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

  it("caps stalled-frame hazard damage to a readable tick", () => {
    const material = testMaterial("generated:lag-rad", { radioactivity: 90 }, [
      "radioactive",
    ]);
    const result = updateHeldMaterialHazards({
      mode: "survival",
      material,
      deltaSeconds: 30,
      state: createMaterialHazardState(),
      config: { hazardDamageInterval: 1 },
    });

    expect(result.damage).toBeLessThan(2);
    expect(result.radiationExposureDelta).toBe(4);
  });
});
