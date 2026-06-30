import { describe, expect, it } from "vitest";

import { TerrainMaterial } from "../geometry/terrainChunk.ts";
import { GameTime } from "./GameTime.ts";
import {
  blockLightEmission,
  caveDarknessMultiplier,
  localTerrainLightMultiplier,
  sunlightForGameTime,
} from "./Lighting.ts";

describe("gameplay lighting", () => {
  it("keeps sunlight high during the day", () => {
    expect(
      sunlightForGameTime(new GameTime({ timeOfDay: 0.5 })),
    ).toBeGreaterThan(0.9);
  });

  it("keeps sunlight low at night", () => {
    expect(sunlightForGameTime(new GameTime({ timeOfDay: 0 }))).toBeLessThan(
      0.2,
    );
  });

  it("gives emissive blocks a light value", () => {
    expect(blockLightEmission(TerrainMaterial.CrystalOre)).toBeGreaterThan(0);
    expect(blockLightEmission(TerrainMaterial.Torch)).toBeGreaterThan(
      blockLightEmission(TerrainMaterial.CrystalOre),
    );
  });

  it("keeps air non-emissive", () => {
    expect(blockLightEmission(TerrainMaterial.Air)).toBe(0);
  });

  it("darkens caves when there is no sky exposure", () => {
    const surfaceLevel = 100;
    const shallowCave = caveDarknessMultiplier(95, surfaceLevel, 0);
    const deepCave = caveDarknessMultiplier(70, surfaceLevel, 0);
    const skyLit = localTerrainLightMultiplier({
      material: TerrainMaterial.Stone,
      level: surfaceLevel,
      surfaceLevel,
      hasSkyExposure: true,
    });

    expect(deepCave).toBeLessThan(shallowCave);
    expect(shallowCave).toBeLessThan(skyLit);
  });
});
