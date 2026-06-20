import { describe, expect, it } from "vitest";

import {
  atlasUv,
  BLOCK_TEXTURE_ATLAS_HEIGHT,
  BLOCK_TEXTURE_ATLAS_WIDTH,
  BlockTexture,
  createBlockTextureAtlas,
} from "./blockTextureAtlas.ts";

describe("block texture atlas", () => {
  it("generates thirteen opaque terrain and building tiles", () => {
    const atlas = createBlockTextureAtlas();

    expect(atlas.width).toBe(832);
    expect(atlas.height).toBe(64);
    expect(atlas.pixels).toHaveLength(
      BLOCK_TEXTURE_ATLAS_WIDTH * BLOCK_TEXTURE_ATLAS_HEIGHT * 4,
    );
    expect(atlas.pixels.every((value, index) => index % 4 !== 3 || value === 255))
      .toBe(true);
  });

  it("keeps UV coordinates inside the selected tile", () => {
    const [minimumU] = atlasUv(BlockTexture.Dirt, 0, 0);
    const [maximumU] = atlasUv(BlockTexture.Dirt, 1, 1);
    const tileMinimum = BlockTexture.Dirt / 13;
    const tileMaximum = (BlockTexture.Dirt + 1) / 13;

    expect(minimumU).toBeGreaterThan(tileMinimum);
    expect(maximumU).toBeLessThan(tileMaximum);
  });
});
