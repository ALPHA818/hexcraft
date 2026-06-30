import { describe, expect, it } from "vitest";

import {
  TERRAIN_DEPTH_BLOCKS,
  TerrainMaterial,
  type TerrainBiome,
} from "../geometry/terrainChunk.ts";
import { selectBiome } from "./Biomes.ts";
import {
  surfaceFeatureAt,
  type SurfaceFeatureProfile,
} from "./SurfaceFeatures.ts";
import {
  biomeAt,
  canOreReplaceMaterial,
  generateTerrainColumn,
  ORE_DEPTH_RULES,
  ORE_MATERIALS,
  oreMaterialAt,
  terrainHeightAt,
  terrainProfileAt,
  TERRAIN_GENERATION_CONFIG,
  undergroundStoneMaterialAt,
} from "./TerrainGenerator.ts";

function columnSignature(
  q: number,
  r: number,
  seed: number,
): readonly number[] {
  const column = generateTerrainColumn(q, r, seed);

  return [
    column.height,
    column.blocks?.length ?? 0,
    column.blocks?.[TERRAIN_DEPTH_BLOCKS - 1] ?? TerrainMaterial.Air,
    column.blocks?.[column.height - 1] ?? TerrainMaterial.Air,
    column.blocks?.[column.height] ?? TerrainMaterial.Air,
    column.caveAirCount ?? 0,
  ];
}

function forcedProfile(biome: TerrainBiome): SurfaceFeatureProfile {
  return {
    height: 14,
    waterLevel: 0,
    biome,
    river: false,
    mountain: false,
  };
}

describe("terrain generator", () => {
  it("generates identical terrain for the same seed", () => {
    const coordinates = [
      [0, 0],
      [17, -3],
      [-41, 22],
      [96, -128],
    ] as const;
    const first = coordinates.map(([q, r]) => columnSignature(q, r, 42));
    const repeated = coordinates.map(([q, r]) => columnSignature(q, r, 42));

    expect(repeated).toEqual(first);
  });

  it("generates different terrain for different seeds", () => {
    const coordinates = [
      [0, 0],
      [17, -3],
      [-41, 22],
      [96, -128],
    ] as const;
    const first = coordinates.map(([q, r]) => columnSignature(q, r, 42));
    const different = coordinates.map(([q, r]) => columnSignature(q, r, 43));

    expect(different).not.toEqual(first);
  });

  it("selects deterministic biomes", () => {
    const coordinates = [
      [-64, 12],
      [0, 0],
      [18, -24],
      [95, 31],
    ] as const;
    const first = coordinates.map(([q, r]) => biomeAt(q, r, 99));
    const repeated = coordinates.map(([q, r]) => biomeAt(q, r, 99));

    expect(repeated).toEqual(first);
  });

  it("supports beach, swamp, and badlands biome rules", () => {
    expect(
      selectBiome({
        height: 11,
        waterLevel: 11,
        temperature: 0.45,
        moisture: 0.5,
        riverStrength: 0.45,
        mountainStrength: 0,
      }),
    ).toBe("beach");
    expect(
      selectBiome({
        height: 11,
        waterLevel: 10,
        temperature: 0.48,
        moisture: 0.82,
        riverStrength: 0.18,
        mountainStrength: 0,
      }),
    ).toBe("swamp");
    expect(
      selectBiome({
        height: 15,
        waterLevel: 9,
        temperature: 0.56,
        moisture: 0.39,
        riverStrength: 0,
        mountainStrength: 0,
      }),
    ).toBe("badlands");
  });

  it("generates deterministic ore veins underground", () => {
    const collectOres = (
      seed: number,
    ): Array<readonly [number, number, number, TerrainMaterial]> => {
      const ores: Array<readonly [number, number, number, TerrainMaterial]> =
        [];

      for (let q = -12; q <= 12; q += 1) {
        for (let r = -12; r <= 12; r += 1) {
          const profile = terrainProfileAt(q, r, seed);
          const surfaceHeight = TERRAIN_DEPTH_BLOCKS + profile.height;

          for (let level = 4; level < surfaceHeight - 6; level += 1) {
            const ore = oreMaterialAt(q, r, level, surfaceHeight, seed);
            if (ore !== null) {
              ores.push([q, r, level, ore]);
            }
          }
        }
      }

      return ores;
    };

    const ores = collectOres(123);

    expect(ores.length).toBeGreaterThan(0);
    expect(collectOres(123)).toEqual(ores);
    expect(collectOres(124)).not.toEqual(ores);
  });

  it("generates all configured ore types within their depth bands", () => {
    const found = new Map<TerrainMaterial, readonly [number, number, number]>();

    for (let q = -40; q <= 40 && found.size < ORE_MATERIALS.length; q += 1) {
      for (let r = -40; r <= 40 && found.size < ORE_MATERIALS.length; r += 1) {
        const profile = terrainProfileAt(q, r, 42);
        const surfaceHeight = TERRAIN_DEPTH_BLOCKS + profile.height;

        for (
          let level = 4;
          level < surfaceHeight - 6 && found.size < ORE_MATERIALS.length;
          level += 1
        ) {
          const ore = oreMaterialAt(q, r, level, surfaceHeight, 42);
          if (ore !== null && !found.has(ore)) {
            found.set(ore, [q, r, level]);
          }
        }
      }
    }

    expect([...found.keys()].sort((a, b) => a - b)).toEqual(
      [...ORE_MATERIALS].sort((a, b) => a - b),
    );

    for (const [ore, [q, r, level]] of found) {
      const profile = terrainProfileAt(q, r, 42);
      const surfaceHeight = TERRAIN_DEPTH_BLOCKS + profile.height;
      const depthBelowSurface = surfaceHeight - level;
      const rule = ORE_DEPTH_RULES.find(
        (candidate) => candidate.material === ore,
      );

      expect(rule).toBeDefined();
      expect(depthBelowSurface).toBeGreaterThanOrEqual(
        rule?.minimumDepthBelowSurface ?? 0,
      );
      expect(depthBelowSurface).toBeLessThanOrEqual(
        rule?.maximumDepthBelowSurface ?? 0,
      );
    }
  });

  it("only allows ores to replace stone-family host blocks", () => {
    expect(canOreReplaceMaterial(TerrainMaterial.Stone)).toBe(true);
    expect(canOreReplaceMaterial(TerrainMaterial.DeepStone)).toBe(true);

    for (const material of [
      TerrainMaterial.Air,
      TerrainMaterial.Water,
      TerrainMaterial.Wood,
      TerrainMaterial.Leaves,
      TerrainMaterial.Grass,
      TerrainMaterial.Sand,
      TerrainMaterial.Snow,
    ]) {
      expect(canOreReplaceMaterial(material)).toBe(false);
    }
  });

  it("progresses from stone into deep stone with depth", () => {
    const surfaceHeight = TERRAIN_DEPTH_BLOCKS + 30;

    expect(
      undergroundStoneMaterialAt(0, 0, surfaceHeight - 20, surfaceHeight, 42),
    ).toBe(TerrainMaterial.Stone);
    expect(
      undergroundStoneMaterialAt(0, 0, surfaceHeight - 220, surfaceHeight, 42),
    ).toBe(TerrainMaterial.DeepStone);
  });

  it("generates deterministic surface features", () => {
    const profile = terrainProfileAt(-8, 19, 77);
    const first = surfaceFeatureAt(-8, 19, 77, profile);
    const repeated = surfaceFeatureAt(-8, 19, 77, profile);

    expect(repeated).toEqual(first);
  });

  it("can place cactus, flower, and mushroom features", () => {
    const findFeature = (
      biome: TerrainBiome,
      kind: "cactus" | "flower" | "mushroom",
    ): boolean => {
      const profile = forcedProfile(biome);

      for (let q = -80; q <= 80; q += 1) {
        for (let r = -80; r <= 80; r += 1) {
          if (surfaceFeatureAt(q, r, 42, profile).kind === kind) {
            return true;
          }
        }
      }

      return false;
    };

    expect(findFeature("desert", "cactus")).toBe(true);
    expect(findFeature("grassland", "flower")).toBe(true);
    expect(findFeature("forest", "mushroom")).toBe(true);
  });

  it("keeps terrain heights inside safe world limits", () => {
    for (let q = -128; q <= 128; q += 16) {
      for (let r = -128; r <= 128; r += 16) {
        const height = terrainHeightAt(q, r, 42);

        expect(height).toBeGreaterThanOrEqual(
          TERRAIN_DEPTH_BLOCKS + TERRAIN_GENERATION_CONFIG.localHeight.minimum,
        );
        expect(height).toBeLessThanOrEqual(
          TERRAIN_DEPTH_BLOCKS + TERRAIN_GENERATION_CONFIG.localHeight.maximum,
        );
      }
    }
  });
});
