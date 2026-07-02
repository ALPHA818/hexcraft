import { describe, expect, it } from "vitest";

import { TerrainMaterial } from "../geometry/terrainChunk.ts";
import { blockBreakProgressPerSecond } from "../game/BlockBreakingController.ts";
import { MaterialRegistry } from "../materials/MaterialRegistry.ts";
import type {
  MaterialDefinition,
  MaterialStats,
} from "../materials/MaterialTypes.ts";
import { createItemStack, damageToolStack } from "./ItemStack.ts";
import {
  equippedToolForItem,
  itemDefinitionFor,
  materialIdFromModifiedToolItemId,
  modifiedToolItemId,
  modifiedToolPartsFromItemId,
  modifiedToolRecipeId,
  type ToolItemDefinition,
} from "./ItemRegistry.ts";
import { modifiedToolStatsForMaterial } from "./MaterialToolModifier.ts";

const BASE_STATS: MaterialStats = {
  stability: 72,
  hardness: 40,
  density: 40,
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
  name: string,
  stats: Partial<MaterialStats>,
  tags: readonly string[] = [],
): MaterialDefinition {
  return {
    id: `test:${id}`,
    name,
    generation: 1,
    parents: [],
    rarity: "common",
    ...BASE_STATS,
    ...stats,
    tags,
    discoveredAt: 1,
    description: `${name} is a test tool material.`,
  };
}

function registryWith(
  ...materials: readonly MaterialDefinition[]
): MaterialRegistry {
  const registry = new MaterialRegistry();

  registry.registerBaseMaterials();
  for (const material of materials) {
    registry.registerGeneratedMaterial(material);
  }

  return registry;
}

function basePickaxe(): ToolItemDefinition {
  const tool = itemDefinitionFor("tool:pickaxe");

  if (!tool || tool.kind !== "tool") {
    throw new Error("Missing base pickaxe.");
  }

  return tool;
}

describe("material tool modifiers", () => {
  it("parses modified tool ids with colon-heavy material ids", () => {
    const itemId = modifiedToolItemId("tool:pickaxe", "generated:g1:abc123");

    expect(itemId).toBe("modified-tool:tool:pickaxe:generated:g1:abc123");
    expect(modifiedToolPartsFromItemId(itemId)).toEqual({
      baseToolId: "tool:pickaxe",
      materialId: "generated:g1:abc123",
    });
    expect(materialIdFromModifiedToolItemId(itemId)).toBe(
      "generated:g1:abc123",
    );
    expect(modifiedToolRecipeId("tool:axe", "element:iron")).toBe(
      "assembler:tool:axe:element:iron",
    );
  });

  it("resolves modified tool display names", () => {
    const embersteel = testMaterial("embersteel", "Embersteel", {
      hardness: 82,
      heat: 80,
      metal: 88,
      conductivity: 72,
    });
    const registry = registryWith(embersteel);
    const itemId = modifiedToolItemId("tool:pickaxe", embersteel.id);
    const item = itemDefinitionFor(itemId, registry);

    expect(item).toMatchObject({
      id: itemId,
      kind: "tool",
      displayName: "Embersteel Pickaxe",
      shortName: "Pickaxe",
      maxStackSize: 1,
      placeable: false,
    });
  });

  it("modified tool stats are deterministic", () => {
    const arcanite = testMaterial("arcanite", "Arcanite Crystal", {
      crystal: 92,
      hardness: 76,
      magic: 88,
      stability: 78,
    });
    const first = modifiedToolStatsForMaterial(basePickaxe(), arcanite);
    const second = modifiedToolStatsForMaterial(basePickaxe(), arcanite);

    expect(second).toEqual(first);
    expect(first.displayName).toBe("Arcanite Crystal Pickaxe");
  });

  it("harder material increases durability", () => {
    const soft = testMaterial("soft", "Softmatter", {
      hardness: 8,
      density: 12,
    });
    const hard = testMaterial("hard", "Hardstone", {
      hardness: 92,
      density: 80,
    });
    const base = basePickaxe();

    expect(
      modifiedToolStatsForMaterial(base, hard).maxDurability,
    ).toBeGreaterThan(modifiedToolStatsForMaterial(base, soft).maxDurability);
  });

  it("hard material improves mining speed", () => {
    const soft = testMaterial("speed-soft", "Softmatter", {
      hardness: 8,
      density: 12,
    });
    const hard = testMaterial("speed-hard", "Hardstone", {
      hardness: 92,
      density: 80,
    });
    const base = basePickaxe();

    expect(
      modifiedToolStatsForMaterial(base, hard).tool.speedMultiplier,
    ).toBeGreaterThan(
      modifiedToolStatsForMaterial(base, soft).tool.speedMultiplier,
    );
  });

  it("metal material improves durability", () => {
    const ceramic = testMaterial("ceramic", "Ceramic", {
      hardness: 55,
      density: 50,
      metal: 0,
    });
    const alloy = testMaterial("alloy", "Dense Alloy", {
      hardness: 55,
      density: 50,
      metal: 95,
    });
    const base = basePickaxe();

    expect(
      modifiedToolStatsForMaterial(base, alloy).maxDurability,
    ).toBeGreaterThan(
      modifiedToolStatsForMaterial(base, ceramic).maxDurability,
    );
  });

  it("unstable material lowers durability or adds risk", () => {
    const stable = testMaterial("stable", "Stable Alloy", {
      hardness: 70,
      metal: 80,
      stability: 95,
    });
    const unstable = testMaterial("unstable", "Unstable Alloy", {
      hardness: 70,
      metal: 80,
      radioactivity: 95,
      stability: 8,
      toxicity: 50,
    });
    const stableStats = modifiedToolStatsForMaterial(basePickaxe(), stable);
    const unstableStats = modifiedToolStatsForMaterial(basePickaxe(), unstable);

    expect(unstableStats.modifier.instabilityRisk).toBeGreaterThan(
      stableStats.modifier.instabilityRisk,
    );
    expect(unstableStats.maxDurability).toBeLessThan(stableStats.maxDurability);
  });

  it("marks magic and dangerous material traits for future effects", () => {
    const arcanite = testMaterial("focus", "Arcanite Crystal", {
      crystal: 92,
      magic: 90,
      stability: 82,
    });
    const toxicMetal = testMaterial("danger", "Hot Radium", {
      metal: 80,
      radioactivity: 90,
      toxicity: 70,
      stability: 42,
    });
    const focusStats = modifiedToolStatsForMaterial(basePickaxe(), arcanite);
    const dangerStats = modifiedToolStatsForMaterial(basePickaxe(), toxicMetal);

    expect(focusStats.modifier.enchantPotential).toBeGreaterThan(0);
    expect(focusStats.tool.enchantPotential).toBe(
      focusStats.modifier.enchantPotential,
    );
    expect(dangerStats.modifier.dangerous).toBe(true);
    expect(dangerStats.tool.dangerous).toBe(true);
  });

  it("modified tools affect mining speed and use modified durability", () => {
    const voidforged = testMaterial("voidforged", "Voidforged", {
      conductivity: 90,
      hardness: 85,
      magic: 70,
      metal: 86,
      stability: 68,
    });
    const registry = registryWith(voidforged);
    const itemId = modifiedToolItemId("tool:pickaxe", voidforged.id);
    const item = itemDefinitionFor(itemId, registry);
    const tool = equippedToolForItem(itemId, registry);

    expect(item?.kind).toBe("tool");
    if (!item || item.kind !== "tool") {
      return;
    }

    expect(
      blockBreakProgressPerSecond(TerrainMaterial.Stone, tool),
    ).toBeGreaterThan(
      blockBreakProgressPerSecond(
        TerrainMaterial.Stone,
        equippedToolForItem("tool:pickaxe"),
      ),
    );

    const stack = createItemStack(itemId, 1, registry);
    const damaged = damageToolStack(stack, 1, registry);

    expect(stack.durability).toBe(item.maxDurability);
    expect(damaged?.durability).toBe(item.maxDurability - 1);
  });

  it("existing tools still work", () => {
    const pickaxe = itemDefinitionFor("tool:pickaxe");
    const stack = createItemStack("tool:pickaxe");

    expect(pickaxe).toMatchObject({
      kind: "tool",
      displayName: "Wooden Pickaxe",
      maxDurability: 48,
    });
    expect(equippedToolForItem("tool:pickaxe").kind).toBe("pickaxe");
    expect(stack).toEqual({
      itemId: "tool:pickaxe",
      count: 1,
      durability: 48,
    });
  });
});
