import { describe, expect, it } from "vitest";

import type {
  MaterialDefinition,
  MaterialStats,
} from "../materials/MaterialTypes.ts";
import {
  evaluateMaterialWorldEvents,
  materialWorldEventsForDiscovery,
} from "./MaterialWorldEvents.ts";

const BASE_STATS: MaterialStats = {
  stability: 72,
  hardness: 30,
  density: 30,
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

function testMaterial(
  id: string,
  stats: Partial<MaterialStats>,
  tags: readonly string[] = [],
  generation = 1,
): MaterialDefinition {
  return {
    id,
    name: id.replace(/^generated:/, "").replaceAll(/[-:]/g, " "),
    generation,
    parents: generation > 0 ? ["element:iron", "element:carbon"] : [],
    rarity: generation > 0 ? "rare" : "common",
    ...BASE_STATS,
    ...stats,
    tags,
    discoveredAt: 1,
  };
}

describe("material world events", () => {
  it("unlocks radioactive cave hints from radioactive discoveries", () => {
    const material = testMaterial(
      "generated:irradiated-alloy",
      { radioactivity: 88, metal: 70 },
      ["radioactive", "metal"],
    );

    expect(materialWorldEventsForDiscovery(material)).toEqual([
      expect.objectContaining({
        id: "radioactive_cave_hint:generated:irradiated-alloy",
        kind: "radioactive_cave_hint",
        materialId: material.id,
        hintKey: "radioactive-caves",
        severity: "info",
      }),
    ]);
  });

  it("unlocks arcane biome hints from high magic discoveries", () => {
    const material = testMaterial(
      "generated:arcane-crystal",
      { magic: 92, crystal: 86 },
      ["magic", "arcane", "crystal"],
    );

    expect(materialWorldEventsForDiscovery(material)).toEqual([
      expect.objectContaining({
        kind: "arcane_biome_hint",
        hintKey: "arcane-biomes",
        message: "Arcane biome traces can now be hinted.",
      }),
    ]);
  });

  it("unlocks hazard warnings from unstable explosive discoveries", () => {
    const material = testMaterial(
      "generated:blast-vapor",
      { stability: 18, gas: 95, heat: 92 },
      ["unstable", "explosive", "volatile"],
    );

    expect(materialWorldEventsForDiscovery(material)).toEqual([
      expect.objectContaining({
        kind: "hazard_warning",
        hintKey: "unstable-material-hazards",
        severity: "warning",
      }),
    ]);
  });

  it("does not create world events for ordinary base discoveries", () => {
    const material = testMaterial("element:iron", { metal: 90 }, ["metal"], 0);

    expect(materialWorldEventsForDiscovery(material)).toEqual([]);
  });

  it("is deterministic and suppresses already-triggered events", () => {
    const material = testMaterial(
      "generated:arcane-reactor",
      { magic: 85, radioactivity: 85, stability: 25 },
      ["magic", "radioactive", "unstable"],
    );
    const first = evaluateMaterialWorldEvents(material);
    const repeated = evaluateMaterialWorldEvents(material);
    const afterState = evaluateMaterialWorldEvents(material, first.state);

    expect(repeated.events).toEqual(first.events);
    expect(first.events.map((event) => event.kind)).toEqual([
      "arcane_biome_hint",
      "hazard_warning",
      "radioactive_cave_hint",
    ]);
    expect(afterState.events).toEqual([]);
    expect(afterState.state).toEqual(first.state);
  });
});
