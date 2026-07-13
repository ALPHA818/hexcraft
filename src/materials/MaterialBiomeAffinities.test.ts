import { describe, expect, it } from "vitest";

import {
  materialAffinitiesForBiome,
  materialAffinitiesForSource,
  materialAffinitiesForSources,
  materialTraceDiscoveryForEvent,
} from "./MaterialBiomeAffinities.ts";
import type { TerrainBiome } from "../geometry/terrainChunk.ts";

function materialIds(
  affinities: ReturnType<typeof materialAffinitiesForBiome>,
): readonly string[] {
  return affinities.map((affinity) => affinity.materialId);
}

describe("material biome affinities", () => {
  it("defines affinity for every biome", () => {
    const biomes = [
      "grassland",
      "forest",
      "desert",
      "tundra",
      "alpine",
      "snow",
      "beach",
      "swamp",
      "badlands",
    ] as const satisfies readonly TerrainBiome[];

    for (const biome of biomes) {
      expect(materialAffinitiesForBiome(biome).length).toBeGreaterThan(0);
    }
  });

  it("gives deserts silicon and sulfur affinity", () => {
    const ids = materialIds(materialAffinitiesForBiome("desert"));

    expect(ids).toContain("element:silicon");
    expect(ids).toContain("element:sulfur");
  });

  it("gives mountains iron, copper, and titanium affinity", () => {
    const ids = materialIds(materialAffinitiesForSource("mountain"));

    expect(ids).toEqual(
      expect.arrayContaining([
        "element:iron",
        "element:copper",
        "element:titanium",
      ]),
    );
  });

  it("gives snow and alpine frost-oriented affinity", () => {
    const snowIds = materialIds(materialAffinitiesForBiome("snow"));
    const alpine = materialAffinitiesForSources(["alpine", "mountain"]);

    expect(snowIds).toEqual(
      expect.arrayContaining(["element:oxygen", "element:hydrogen"]),
    );
    expect(alpine.some((affinity) => affinity.tags.includes("frost"))).toBe(
      true,
    );
  });

  it("gives caves crystal and uranium affinity", () => {
    const affinities = materialAffinitiesForSource("cave");
    const ids = materialIds(affinities);

    expect(ids).toContain("element:uranium");
    expect(
      affinities.some((affinity) => affinity.tags.includes("crystal")),
    ).toBe(true);
  });

  it("gives forests carbon, oxygen, and organic affinity", () => {
    const affinities = materialAffinitiesForBiome("forest");
    const ids = materialIds(affinities);

    expect(ids).toContain("element:carbon");
    expect(ids).toContain("element:oxygen");
    expect(
      affinities.some((affinity) => affinity.tags.includes("organic")),
    ).toBe(true);
  });

  it("uses the same seed for deterministic trace chances", () => {
    const attempts = Array.from({ length: 64 }, (_, index) => index);
    const traceSequence = attempts.map((index) =>
      materialTraceDiscoveryForEvent({
        sources: ["desert", "cave"],
        eventKey: `trace-test:${index}`,
        worldSeed: 1234,
        config: { materialTraceDiscoveryChance: 0.5 },
      }),
    );
    const repeatedTraceSequence = attempts.map((index) =>
      materialTraceDiscoveryForEvent({
        sources: ["desert", "cave"],
        eventKey: `trace-test:${index}`,
        worldSeed: 1234,
        config: { materialTraceDiscoveryChance: 0.5 },
      }),
    );

    expect(repeatedTraceSequence).toEqual(traceSequence);
    expect(traceSequence.some((trace) => trace !== null)).toBe(true);
    expect(traceSequence.some((trace) => trace === null)).toBe(true);
  });
});
