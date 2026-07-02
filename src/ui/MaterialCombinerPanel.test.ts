import { describe, expect, it } from "vitest";

import {
  MaterialDiscoveryController,
  type MaterialDiscoveryInventory,
} from "../game/MaterialDiscoveryController.ts";
import { MaterialWorldController } from "../game/MaterialWorldController.ts";
import { itemIdForMaterial, type ItemId } from "../items/ItemRegistry.ts";
import {
  DEFAULT_MATERIAL_CONFIG,
  type MaterialConfig,
} from "../materials/MaterialConfig.ts";
import type {
  MaterialDefinition,
  MaterialStats,
} from "../materials/MaterialTypes.ts";
import {
  materialCombinerKnownResultLabel,
  materialOptionsForCombiner,
} from "./MaterialCombinerPanel.ts";

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

class TestInventory implements MaterialDiscoveryInventory {
  readonly counts = new Map<ItemId, number>();
  readonly removed: Array<readonly [ItemId, number]> = [];

  constructor(readonly creative = false) {}

  isCreative(): boolean {
    return this.creative;
  }

  countItem(itemId: ItemId): number {
    return this.creative
      ? Number.POSITIVE_INFINITY
      : (this.counts.get(itemId) ?? 0);
  }

  addItem(itemId: ItemId, amount = 1): boolean {
    if (this.creative) {
      return true;
    }

    this.counts.set(itemId, (this.counts.get(itemId) ?? 0) + amount);
    return true;
  }

  removeItem(itemId: ItemId, amount = 1): boolean {
    if (this.creative) {
      return true;
    }
    if (this.countItem(itemId) < amount) {
      return false;
    }

    this.removed.push([itemId, amount]);
    this.counts.set(itemId, this.countItem(itemId) - amount);
    return true;
  }

  setMaterial(materialId: string, count: number): void {
    this.counts.set(itemIdForMaterial(materialId), count);
  }
}

function testMaterial(
  id: string,
  name: string,
  tags: readonly string[] = [],
  stats: Partial<MaterialStats> = {},
): MaterialDefinition {
  return {
    id: `combiner-test:${id}`,
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

function materialWorldWith(
  materials: readonly MaterialDefinition[],
  mode: "creative" | "survival" = "creative",
  config: MaterialConfig = DEFAULT_MATERIAL_CONFIG,
): MaterialWorldController {
  const materialWorld = new MaterialWorldController({ mode, config });

  for (const material of materials) {
    materialWorld.registry.registerGeneratedMaterial(material);
    materialWorld.discoverMaterial(material.id);
  }

  return materialWorld;
}

function stablePairWorld(mode: "creative" | "survival" = "creative"): Readonly<{
  materialWorld: MaterialWorldController;
  dust: MaterialDefinition;
  clay: MaterialDefinition;
}> {
  const dust = testMaterial("dust", "Quiet Dust", ["earth"]);
  const clay = testMaterial("clay", "Plain Clay", ["clay"], {
    liquid: 18,
    density: 42,
  });

  return {
    dust,
    clay,
    materialWorld: materialWorldWith([dust, clay], mode),
  };
}

function discoveryController(
  materialWorld: MaterialWorldController,
  inventory: TestInventory,
): MaterialDiscoveryController {
  return new MaterialDiscoveryController({
    materialWorld,
    inventory,
  });
}

function unstableMaterials(): readonly [
  MaterialDefinition,
  MaterialDefinition,
] {
  return [
    testMaterial("blast-gas", "Blast Gas", ["gas", "air"], {
      density: 4,
      gas: 98,
      stability: 34,
    }),
    testMaterial("volatile-fire", "Volatile Fire", ["fire", "fuel"], {
      heat: 96,
      stability: 38,
    }),
  ];
}

function unstableConfig(seed: number): MaterialConfig {
  return {
    ...DEFAULT_MATERIAL_CONFIG,
    seed,
    unstableCombinationsCanFail: true,
  };
}

function firstUnstableFailureSeed(): number {
  const [gas, fire] = unstableMaterials();

  for (let seed = 0; seed < 256; seed += 1) {
    const materialWorld = materialWorldWith(
      [gas, fire],
      "creative",
      unstableConfig(seed),
    );
    const inventory = new TestInventory(true);
    const result = discoveryController(materialWorld, inventory).combine(
      gas.id,
      fire.id,
    );

    if (!result.ok && result.reason === "unstable_reaction") {
      return seed;
    }
  }

  throw new Error("No deterministic unstable material combiner failure found.");
}

describe("material combiner gameplay", () => {
  it("combines two known materials", () => {
    const { materialWorld, dust, clay } = stablePairWorld();
    const controller = discoveryController(
      materialWorld,
      new TestInventory(true),
    );
    const result = controller.combine(dust.id, clay.id);

    expect(result.ok).toBe(true);
    expect(
      materialOptionsForCombiner(controller).map((item) => item.material.id),
    ).toContain(dust.id);
  });

  it("returns the same material for a known recipe", () => {
    const { materialWorld, dust, clay } = stablePairWorld();
    const controller = discoveryController(
      materialWorld,
      new TestInventory(true),
    );
    const first = controller.combine(dust.id, clay.id);
    const second = controller.combine(dust.id, clay.id);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.material.id).toBe(first.material.id);
      expect(second.discovered).toBe(false);
      expect(
        materialCombinerKnownResultLabel(
          controller.getKnownResult(dust.id, clay.id),
        ),
      ).toBe(`Known result: ${first.material.name}`);
    }
  });

  it("creates a result for a new recipe", () => {
    const { materialWorld, dust, clay } = stablePairWorld();
    const controller = discoveryController(
      materialWorld,
      new TestInventory(true),
    );

    expect(controller.getKnownResult(dust.id, clay.id)).toBeNull();

    const result = controller.combine(dust.id, clay.id);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(materialWorld.getMaterialById(result.material.id)).toBe(
        result.material,
      );
      expect(controller.getKnownResult(dust.id, clay.id)?.id).toBe(
        result.material.id,
      );
    }
  });

  it("consumes parent material items in survival", () => {
    const { materialWorld, dust, clay } = stablePairWorld("survival");
    const inventory = new TestInventory(false);

    inventory.setMaterial(dust.id, 1);
    inventory.setMaterial(clay.id, 1);

    const result = discoveryController(materialWorld, inventory).combine(
      dust.id,
      clay.id,
    );

    expect(result.ok).toBe(true);
    expect(inventory.countItem(itemIdForMaterial(dust.id))).toBe(0);
    expect(inventory.countItem(itemIdForMaterial(clay.id))).toBe(0);
  });

  it("does not consume parent material items in creative", () => {
    const { materialWorld, dust, clay } = stablePairWorld("creative");
    const inventory = new TestInventory(true);
    const result = discoveryController(materialWorld, inventory).combine(
      dust.id,
      clay.id,
    );

    expect(result.ok).toBe(true);
    expect(inventory.removed).toEqual([]);
  });

  it("requires two items for same-material combinations in survival", () => {
    const dust = testMaterial("same-dust", "Same Dust", ["earth"]);
    const materialWorld = materialWorldWith([dust], "survival");
    const inventory = new TestInventory(false);
    const controller = discoveryController(materialWorld, inventory);

    inventory.setMaterial(dust.id, 1);
    expect(controller.combine(dust.id, dust.id)).toEqual(
      expect.objectContaining({
        ok: false,
        reason: "insufficient_items",
      }),
    );

    inventory.setMaterial(dust.id, 2);
    const result = controller.combine(dust.id, dust.id);

    expect(result.ok).toBe(true);
    expect(inventory.countItem(itemIdForMaterial(dust.id))).toBe(0);
  });

  it("adds the generated result item to inventory", () => {
    const { materialWorld, dust, clay } = stablePairWorld("survival");
    const inventory = new TestInventory(false);
    const controller = discoveryController(materialWorld, inventory);

    inventory.setMaterial(dust.id, 1);
    inventory.setMaterial(clay.id, 1);

    const result = controller.combine(dust.id, clay.id);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(inventory.countItem(result.itemId)).toBe(1);
    }
  });

  it("shows research lock failures", () => {
    const fire = testMaterial("fire", "Volatile Fire", ["fire", "fuel"], {
      heat: 96,
    });
    const materialWorld = materialWorldWith([fire], "survival");
    const inventory = new TestInventory(false);
    const controller = discoveryController(materialWorld, inventory);

    inventory.setMaterial(fire.id, 1);
    inventory.setMaterial("element:iron", 1);

    const result = controller.combine(fire.id, "element:iron");

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        reason: "research_locked",
        message: "Requires Metallurgical Research",
      }),
    );
  });

  it("handles unstable reaction failures", () => {
    const seed = firstUnstableFailureSeed();
    const [gas, fire] = unstableMaterials();
    const materialWorld = materialWorldWith(
      [gas, fire],
      "creative",
      unstableConfig(seed),
    );
    const result = discoveryController(
      materialWorld,
      new TestInventory(true),
    ).combine(gas.id, fire.id);

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        reason: "unstable_reaction",
      }),
    );
    expect(result.message.length).toBeGreaterThan(0);
    if (!result.ok) {
      expect(result.unstableOutcome?.terrainEffect).toBe("ui_only");
    }
  });
});
