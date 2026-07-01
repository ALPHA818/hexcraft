import { describe, expect, it } from "vitest";

import {
  DEFAULT_MATERIAL_CONFIG,
  type MaterialConfig,
} from "./MaterialConfig.ts";
import { combineMaterials } from "./MaterialCombiner.ts";
import {
  unstableReactionFailureChance,
  unstableReactionOutcome,
} from "./MaterialReactions.ts";
import { MaterialRegistry } from "./MaterialRegistry.ts";
import type {
  MaterialCombinationResult,
  MaterialDefinition,
  MaterialStats,
} from "./MaterialTypes.ts";

const BASE_STATS: MaterialStats = {
  stability: 82,
  hardness: 35,
  density: 35,
  heat: 24,
  conductivity: 12,
  toxicity: 0,
  radioactivity: 0,
  magic: 0,
  organic: 0,
  metal: 0,
  crystal: 0,
  gas: 0,
  liquid: 0,
};

function traitMaterial(
  id: string,
  name: string,
  tags: readonly string[],
  stats: Partial<MaterialStats> = {},
): MaterialDefinition {
  return {
    id: `unstable-test:${id}`,
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

const fire = traitMaterial("fire", "Volatile Fire", ["fire", "fuel"], {
  heat: 96,
  stability: 38,
});
const gas = traitMaterial("gas", "Blast Gas", ["gas", "air"], {
  density: 4,
  gas: 98,
  stability: 34,
});
const stableA = traitMaterial("stable-a", "Stable A", ["earth"], {
  stability: 92,
  density: 54,
});
const stableB = traitMaterial("stable-b", "Stable B", ["organic"], {
  stability: 88,
  organic: 36,
});

function registryWith(
  materials: readonly MaterialDefinition[] = [],
): MaterialRegistry {
  const registry = new MaterialRegistry();

  registry.registerBaseMaterials();
  for (const material of materials) {
    registry.registerGeneratedMaterial(material);
  }

  return registry;
}

function unstableConfig(seed: number, enabled = true): MaterialConfig {
  return {
    ...DEFAULT_MATERIAL_CONFIG,
    seed,
    unstableCombinationsCanFail: enabled,
  };
}

function combineGasAndFire(
  seed: number,
  enabled = true,
): MaterialCombinationResult {
  return combineMaterials(
    gas,
    fire,
    registryWith([gas, fire]),
    unstableConfig(seed, enabled),
  );
}

function firstFailingSeed(): number {
  for (let seed = 0; seed < 256; seed += 1) {
    if (combineGasAndFire(seed).ok === false) {
      return seed;
    }
  }

  throw new Error("No deterministic unstable failure seed found.");
}

describe("unstable material reactions", () => {
  it("lets valid combinations succeed when unstable failures are disabled", () => {
    const seed = firstFailingSeed();
    const result = combineGasAndFire(seed, false);

    expect(result.ok).toBe(true);
  });

  it("gives unstable pairs a failure chance", () => {
    const chance = unstableReactionFailureChance(
      {
        ...BASE_STATS,
        stability: 16,
        heat: 94,
        gas: 92,
      },
      ["unstable", "explosive", "gas", "fire"],
      unstableConfig(42),
    );

    expect(chance).toBeGreaterThan(0);
    expect(chance).toBeLessThanOrEqual(0.85);
  });

  it("lets stable pairs succeed even when unstable failures are enabled", () => {
    const result = combineMaterials(
      stableA,
      stableB,
      registryWith([stableA, stableB]),
      unstableConfig(12),
    );

    expect(result.ok).toBe(true);
  });

  it("produces deterministic failure outcomes from the seed", () => {
    const seed = firstFailingSeed();
    const first = combineGasAndFire(seed);
    const second = combineGasAndFire(seed);

    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
    if (!first.ok && !second.ok) {
      expect(first.reason).toBe("unstable_reaction");
      expect(first.message).toBe(second.message);
      expect(first.unstableOutcome).toEqual(second.unstableOutcome);
      expect(first.unstableOutcome?.consumesIngredients).toBe(true);
      expect(first.unstableOutcome?.terrainEffect).toBe("ui_only");
    }
  });

  it("can describe dangerous UI-only outcomes without terrain damage", () => {
    const stats = {
      ...BASE_STATS,
      stability: 10,
      toxicity: 96,
    };
    const tags = ["unstable", "toxic", "poison"];
    const outcome = Array.from({ length: 256 }, (_, seed) =>
      unstableReactionOutcome(
        "unstable-test",
        stats,
        tags,
        unstableConfig(seed),
      ),
    ).find((candidate) => candidate?.kind === "toxic_cloud");

    expect(outcome?.terrainEffect).toBe("ui_only");
    expect(outcome?.warningText).toContain("toxic");
  });
});
