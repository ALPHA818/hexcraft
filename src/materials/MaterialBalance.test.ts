import { describe, expect, it } from "vitest";

import { DEFAULT_MATERIAL_CONFIG } from "./MaterialConfig.ts";
import { rarityForStats } from "./MaterialReactions.ts";
import {
  balanceGeneratedMaterialStats,
  materialBalanceScores,
  materialDangerScore,
  materialRarityRank,
  materialUsefulnessScore,
} from "./MaterialBalance.ts";
import type { MaterialDefinition, MaterialStats } from "./MaterialTypes.ts";

const BASE_STATS: MaterialStats = {
  stability: 62,
  hardness: 35,
  density: 35,
  heat: 20,
  conductivity: 18,
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
  overrides: Partial<MaterialDefinition> = {},
): MaterialDefinition {
  return {
    id,
    name: "Balance Test Material",
    generation: 1,
    parents: ["element:hydrogen", "element:carbon"],
    rarity: "common",
    ...BASE_STATS,
    tags: [],
    discoveredAt: 1,
    ...overrides,
  };
}

describe("material balance rules", () => {
  it("usually raises rarity as generation increases", () => {
    const stats = {
      magic: 8,
      radioactivity: 0,
      crystal: 10,
      metal: 6,
    };
    const early = rarityForStats(
      stats,
      "balance-rarity-test",
      DEFAULT_MATERIAL_CONFIG,
      null,
      0,
    );
    const recursive = rarityForStats(
      stats,
      "balance-rarity-test",
      DEFAULT_MATERIAL_CONFIG,
      null,
      7,
    );

    expect(materialRarityRank(recursive)).toBeGreaterThan(
      materialRarityRank(early),
    );
  });

  it("reduces stability for extreme generated stats", () => {
    const balanced = balanceGeneratedMaterialStats(
      {
        ...BASE_STATS,
        stability: 80,
        radioactivity: 96,
        magic: 84,
        gas: 88,
      },
      4,
      DEFAULT_MATERIAL_CONFIG,
      ["radioactive", "void"],
    );

    expect(balanced.stability).toBeLessThan(80);
  });

  it("increases danger for extreme radioactivity", () => {
    const baseline = testMaterial("generated:safe");
    const radioactive = testMaterial("generated:radioactive", {
      radioactivity: 94,
      tags: ["radioactive", "unstable"],
    });

    expect(materialDangerScore(radioactive)).toBeGreaterThan(
      materialDangerScore(baseline),
    );
  });

  it("increases usefulness for high hardness and metal", () => {
    const baseline = testMaterial("generated:plain");
    const hardMetal = testMaterial("generated:hard-metal", {
      stability: 78,
      hardness: 92,
      metal: 90,
      conductivity: 68,
      tags: ["metal", "hard", "alloy"],
    });

    expect(materialUsefulnessScore(hardMetal)).toBeGreaterThan(
      materialUsefulnessScore(baseline),
    );
  });

  it("increases danger when stability is low", () => {
    const stable = testMaterial("generated:stable", {
      stability: 88,
    });
    const unstable = testMaterial("generated:unstable", {
      stability: 12,
      tags: ["unstable"],
    });

    expect(materialDangerScore(unstable)).toBeGreaterThan(
      materialDangerScore(stable),
    );
  });

  it("computes deterministic value scores", () => {
    const material = testMaterial("generated:valuable", {
      generation: 5,
      rarity: "epic",
      hardness: 84,
      conductivity: 78,
      magic: 62,
      crystal: 74,
      tags: ["crystal", "magic", "conductive"],
    });

    expect(materialBalanceScores(material).valueScore).toBe(
      materialBalanceScores(material).valueScore,
    );
  });
});
