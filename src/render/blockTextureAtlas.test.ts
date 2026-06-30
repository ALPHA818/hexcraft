import { describe, expect, it } from "vitest";

import {
  atlasUv,
  BLOCK_TEXTURE_ATLAS_HEIGHT,
  BLOCK_TEXTURE_ATLAS_WIDTH,
  BlockTexture,
  BLOCK_TEXTURE_TILE_COUNT,
  createBlockTextureAtlas,
} from "./blockTextureAtlas.ts";

describe("block texture atlas", () => {
  it("generates terrain tiles with water and leaf transparency", () => {
    const atlas = createBlockTextureAtlas();
    const alphaAt = (tile: BlockTexture, x: number, y: number): number => {
      const atlasX = tile * 64 + x;
      return atlas.pixels[(y * BLOCK_TEXTURE_ATLAS_WIDTH + atlasX) * 4 + 3]!;
    };

    expect(atlas.width).toBe(BLOCK_TEXTURE_TILE_COUNT * 64);
    expect(atlas.height).toBe(64);
    expect(atlas.pixels).toHaveLength(
      BLOCK_TEXTURE_ATLAS_WIDTH * BLOCK_TEXTURE_ATLAS_HEIGHT * 4,
    );
    expect(alphaAt(BlockTexture.Dirt, 32, 32)).toBe(255);
    expect(alphaAt(BlockTexture.Water, 32, 32)).toBeLessThan(255);

    let transparentLeafPixels = 0;
    let opaqueLeafPixels = 0;
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        const alpha = alphaAt(BlockTexture.Leaves, x, y);
        transparentLeafPixels += alpha === 0 ? 1 : 0;
        opaqueLeafPixels += alpha === 255 ? 1 : 0;
      }
    }

    expect(transparentLeafPixels).toBeGreaterThan(0);
    expect(opaqueLeafPixels).toBeGreaterThan(0);
  });

  it("keeps UV coordinates inside the selected tile", () => {
    const [minimumU] = atlasUv(BlockTexture.Dirt, 0, 0);
    const [maximumU] = atlasUv(BlockTexture.Dirt, 1, 1);
    const tileMinimum = BlockTexture.Dirt / BLOCK_TEXTURE_TILE_COUNT;
    const tileMaximum = (BlockTexture.Dirt + 1) / BLOCK_TEXTURE_TILE_COUNT;

    expect(minimumU).toBeGreaterThan(tileMinimum);
    expect(maximumU).toBeLessThan(tileMaximum);
  });
});
