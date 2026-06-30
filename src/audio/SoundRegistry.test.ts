import { describe, expect, it } from "vitest";

import { TerrainMaterial } from "../geometry/terrainChunk.ts";
import {
  SOUND_DEFINITIONS,
  breakSoundForMaterial,
  normalizeAudioVolumeSettings,
  placeSoundForMaterial,
  soundDefinitionFor,
  stepSoundForMaterial,
} from "./SoundRegistry.ts";

describe("sound registry", () => {
  it("keeps sound ids unique", () => {
    const ids = new Set(SOUND_DEFINITIONS.map((sound) => sound.id));

    expect(ids.size).toBe(SOUND_DEFINITIONS.length);
  });

  it("maps block materials to step, place, and break sounds", () => {
    expect(stepSoundForMaterial(TerrainMaterial.Grass)).toBe(
      "block.step.grass",
    );
    expect(placeSoundForMaterial(TerrainMaterial.Stone)).toBe(
      "block.place.stone",
    );
    expect(breakSoundForMaterial(TerrainMaterial.Wood)).toBe(
      "block.break.wood",
    );
  });

  it("does not create block sounds for air", () => {
    expect(stepSoundForMaterial(TerrainMaterial.Air)).toBeNull();
    expect(placeSoundForMaterial(TerrainMaterial.Air)).toBeNull();
    expect(breakSoundForMaterial(TerrainMaterial.Air)).toBeNull();
  });

  it("normalizes volume settings", () => {
    expect(
      normalizeAudioVolumeSettings({
        master: 2,
        blocks: -1,
        player: 0.4,
      }),
    ).toMatchObject({
      master: 1,
      blocks: 0,
      player: 0.4,
    });
  });

  it("registers ui and weather placeholder sounds", () => {
    expect(soundDefinitionFor("ui.click")?.category).toBe("ui");
    expect(soundDefinitionFor("weather.rain")?.category).toBe("weather");
  });
});
