export const BLOCK_TEXTURE_TILE_SIZE = 64;
export const BLOCK_TEXTURE_TILE_COUNT = 23;
export const BLOCK_TEXTURE_ATLAS_WIDTH =
  BLOCK_TEXTURE_TILE_SIZE * BLOCK_TEXTURE_TILE_COUNT;
export const BLOCK_TEXTURE_ATLAS_HEIGHT = BLOCK_TEXTURE_TILE_SIZE;

export const enum BlockTexture {
  GrassTop = 0,
  GrassSide = 1,
  Dirt = 2,
  Stone = 3,
  Sand = 4,
  Snow = 5,
  AlpineRock = 6,
  DryGrass = 7,
  Water = 8,
  CaveStone = 9,
  Wood = 10,
  Leaves = 11,
  Planks = 12,
  CoalOre = 13,
  IronOre = 14,
  CopperOre = 15,
  Cactus = 16,
  Flower = 17,
  Mushroom = 18,
  DeepStone = 19,
  GoldOre = 20,
  CrystalOre = 21,
  Torch = 22,
}

export type TextureAtlasData = Readonly<{
  width: number;
  height: number;
  pixels: Uint8Array;
}>;

type HexCell = Readonly<{
  column: number;
  row: number;
  centerY: number;
  value: number;
  edge: number;
}>;

const TEXTURE_HEX_RADIUS = 4;
const TEXTURE_HEX_X_SPACING = Math.sqrt(3) * TEXTURE_HEX_RADIUS;
const TEXTURE_HEX_Y_SPACING = TEXTURE_HEX_RADIUS * 1.5;

function noise(x: number, y: number, seed: number): number {
  let value = Math.imul(x + seed * 17, 0x45d9f3b);
  value ^= Math.imul(y + seed * 31, 0x119de1f3);
  value ^= value >>> 16;
  value = Math.imul(value, 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

function smoothStep(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function sampleHexCell(x: number, y: number, seed: number): HexCell {
  const approximateRow = Math.round(
    (y - TEXTURE_HEX_RADIUS) / TEXTURE_HEX_Y_SPACING,
  );
  let nearestDistance = Number.POSITIVE_INFINITY;
  let secondDistance = Number.POSITIVE_INFINITY;
  let nearestColumn = 0;
  let nearestRow = 0;
  let nearestCenterY = 0;

  for (let row = approximateRow - 2; row <= approximateRow + 2; row += 1) {
    const centerY = TEXTURE_HEX_RADIUS + row * TEXTURE_HEX_Y_SPACING;
    const rowOffset = (row & 1) === 0 ? 0 : TEXTURE_HEX_X_SPACING / 2;
    const approximateColumn = Math.round(
      (x - TEXTURE_HEX_RADIUS - rowOffset) / TEXTURE_HEX_X_SPACING,
    );

    for (
      let column = approximateColumn - 2;
      column <= approximateColumn + 2;
      column += 1
    ) {
      const centerX =
        TEXTURE_HEX_RADIUS + rowOffset + column * TEXTURE_HEX_X_SPACING;
      const distance = Math.hypot(x - centerX, y - centerY);

      if (distance < nearestDistance) {
        secondDistance = nearestDistance;
        nearestDistance = distance;
        nearestColumn = column;
        nearestRow = row;
        nearestCenterY = centerY;
      } else if (distance < secondDistance) {
        secondDistance = distance;
      }
    }
  }

  return {
    column: nearestColumn,
    row: nearestRow,
    centerY: nearestCenterY,
    value: noise(nearestColumn, nearestRow, seed),
    edge: smoothStep((0.9 - (secondDistance - nearestDistance)) / 0.9),
  };
}

function setPixel(
  pixels: Uint8Array,
  tile: BlockTexture,
  x: number,
  y: number,
  red: number,
  green: number,
  blue: number,
  alpha = 255,
): void {
  const atlasX = tile * BLOCK_TEXTURE_TILE_SIZE + x;
  const index = (y * BLOCK_TEXTURE_ATLAS_WIDTH + atlasX) * 4;
  pixels[index] = Math.max(0, Math.min(255, Math.round(red)));
  pixels[index + 1] = Math.max(0, Math.min(255, Math.round(green)));
  pixels[index + 2] = Math.max(0, Math.min(255, Math.round(blue)));
  pixels[index + 3] = Math.max(0, Math.min(255, Math.round(alpha)));
}

export function createBlockTextureAtlas(): TextureAtlasData {
  const pixels = new Uint8Array(
    BLOCK_TEXTURE_ATLAS_WIDTH * BLOCK_TEXTURE_ATLAS_HEIGHT * 4,
  );

  for (let y = 0; y < BLOCK_TEXTURE_TILE_SIZE; y += 1) {
    for (let x = 0; x < BLOCK_TEXTURE_TILE_SIZE; x += 1) {
      const grassCell = sampleHexCell(x, y, 3);
      const grassAccent = noise(grassCell.column, grassCell.row, 41);
      let grassShade = grassCell.value * 34 - 16;

      if (grassAccent > 0.88) {
        grassShade -= 12;
      } else if (grassAccent < 0.1) {
        grassShade += 11;
      }
      grassShade -= grassCell.edge * 10;

      setPixel(
        pixels,
        BlockTexture.GrassTop,
        x,
        y,
        67 + grassShade * 0.42,
        145 + grassShade,
        42 + grassShade * 0.35,
      );

      const dirtCell = sampleHexCell(x, y, 11);
      const dirtShade = dirtCell.value * 32 - 15 - dirtCell.edge * 8;
      setPixel(
        pixels,
        BlockTexture.Dirt,
        x,
        y,
        119 + dirtShade,
        76 + dirtShade * 0.62,
        40 + dirtShade * 0.36,
      );

      const sideCell = sampleHexCell(x, y, 67);
      const grassEdge = 12 + noise(sideCell.column, sideCell.row, 29) * 7;
      if (sideCell.centerY < grassEdge) {
        const edgeShade = sideCell.value * 32 - 15 - sideCell.edge * 10;
        setPixel(
          pixels,
          BlockTexture.GrassSide,
          x,
          y,
          63 + edgeShade * 0.4,
          137 + edgeShade,
          38 + edgeShade * 0.3,
        );
      } else {
        const sideDirtShade =
          noise(sideCell.column, sideCell.row, 11) * 32 -
          15 -
          sideCell.edge * 8;
        setPixel(
          pixels,
          BlockTexture.GrassSide,
          x,
          y,
          118 + sideDirtShade,
          75 + sideDirtShade * 0.6,
          39 + sideDirtShade * 0.35,
        );
      }

      const stoneCell = sampleHexCell(x, y, 19);
      const stoneDetail = noise(stoneCell.column, stoneCell.row, 83);
      let stoneShade = stoneCell.value * 36 - 18;

      if (stoneDetail > 0.86) {
        stoneShade -= 14;
      } else if (stoneDetail < 0.12) {
        stoneShade += 12;
      }
      stoneShade -= stoneCell.edge * 9;

      setPixel(
        pixels,
        BlockTexture.Stone,
        x,
        y,
        116 + stoneShade,
        121 + stoneShade,
        119 + stoneShade * 0.96,
      );

      const sandCell = sampleHexCell(x, y, 103);
      const sandShade = sandCell.value * 26 - 12 - sandCell.edge * 6;
      setPixel(
        pixels,
        BlockTexture.Sand,
        x,
        y,
        211 + sandShade,
        185 + sandShade * 0.82,
        112 + sandShade * 0.5,
      );

      const snowCell = sampleHexCell(x, y, 127);
      const snowShade = snowCell.value * 18 - 8 - snowCell.edge * 5;
      setPixel(
        pixels,
        BlockTexture.Snow,
        x,
        y,
        226 + snowShade,
        239 + snowShade,
        242 + snowShade,
      );

      const alpineCell = sampleHexCell(x, y, 149);
      const alpineShade = alpineCell.value * 36 - 18 - alpineCell.edge * 8;
      setPixel(
        pixels,
        BlockTexture.AlpineRock,
        x,
        y,
        93 + alpineShade,
        101 + alpineShade,
        104 + alpineShade,
      );

      const dryCell = sampleHexCell(x, y, 173);
      const dryShade = dryCell.value * 30 - 14 - dryCell.edge * 7;
      setPixel(
        pixels,
        BlockTexture.DryGrass,
        x,
        y,
        151 + dryShade * 0.75,
        151 + dryShade,
        67 + dryShade * 0.42,
      );

      const waterCell = sampleHexCell(x, y, 197);
      const waterShade = waterCell.value * 24 - 11 - waterCell.edge * 4;
      setPixel(
        pixels,
        BlockTexture.Water,
        x,
        y,
        30 + waterShade * 0.25,
        111 + waterShade * 0.72,
        158 + waterShade,
        178,
      );

      const caveCell = sampleHexCell(x, y, 229);
      const caveShade = caveCell.value * 28 - 13 - caveCell.edge * 7;
      setPixel(
        pixels,
        BlockTexture.CaveStone,
        x,
        y,
        69 + caveShade,
        73 + caveShade,
        71 + caveShade,
      );

      const woodCell = sampleHexCell(x, y, 263);
      const woodRing = Math.sin(
        Math.hypot(x - 32, y - 32) * 0.65 + woodCell.value * 2,
      );
      const woodShade =
        woodCell.value * 24 - 11 + woodRing * 8 - woodCell.edge * 5;
      setPixel(
        pixels,
        BlockTexture.Wood,
        x,
        y,
        112 + woodShade,
        75 + woodShade * 0.65,
        38 + woodShade * 0.35,
      );

      const leafCell = sampleHexCell(x, y, 281);
      const leafShade = leafCell.value * 36 - 17 - leafCell.edge * 10;
      const leafSpeckle = noise(x, y, 331);
      const leafVein =
        Math.abs(((x + y * 2) % 17) - 8) < 1 ||
        Math.abs(((x * 2 - y) % 19) - 9) < 1;
      const leafHole =
        !leafVein &&
        (leafSpeckle > 0.9 || (leafCell.edge > 0.82 && leafCell.value < 0.34));
      setPixel(
        pixels,
        BlockTexture.Leaves,
        x,
        y,
        40 + leafShade * 0.32,
        112 + leafShade,
        46 + leafShade * 0.45,
        leafHole ? 0 : 255,
      );

      const plankRow = Math.floor(y / 12);
      const plankLine = y % 12 === 0;
      const plankNoise = noise(x, plankRow, 307) * 18 - 8;
      const plankShade = plankLine ? plankNoise - 16 : plankNoise;
      setPixel(
        pixels,
        BlockTexture.Planks,
        x,
        y,
        168 + plankShade,
        117 + plankShade * 0.7,
        60 + plankShade * 0.42,
      );

      const coalOreCell = sampleHexCell(x, y, 347);
      const coalOreSpeckle = noise(x, y, 349);
      const coalOreShade = coalOreCell.value * 32 - 15 - coalOreCell.edge * 7;
      const coalSpot = coalOreSpeckle > 0.74 || coalOreCell.value < 0.18;
      setPixel(
        pixels,
        BlockTexture.CoalOre,
        x,
        y,
        coalSpot ? 38 + coalOreShade * 0.22 : 104 + coalOreShade,
        coalSpot ? 39 + coalOreShade * 0.22 : 109 + coalOreShade,
        coalSpot ? 38 + coalOreShade * 0.22 : 107 + coalOreShade,
      );

      const ironOreCell = sampleHexCell(x, y, 367);
      const ironOreSpeckle = noise(x, y, 373);
      const ironOreShade = ironOreCell.value * 30 - 14 - ironOreCell.edge * 7;
      const ironSpot = ironOreSpeckle > 0.76 || ironOreCell.value < 0.16;
      setPixel(
        pixels,
        BlockTexture.IronOre,
        x,
        y,
        ironSpot ? 181 + ironOreShade * 0.6 : 105 + ironOreShade,
        ironSpot ? 108 + ironOreShade * 0.32 : 110 + ironOreShade,
        ironSpot ? 62 + ironOreShade * 0.2 : 108 + ironOreShade,
      );

      const copperOreCell = sampleHexCell(x, y, 389);
      const copperOreSpeckle = noise(x, y, 397);
      const copperOreShade =
        copperOreCell.value * 30 - 14 - copperOreCell.edge * 7;
      const copperSpot = copperOreSpeckle > 0.75 || copperOreCell.value < 0.15;
      setPixel(
        pixels,
        BlockTexture.CopperOre,
        x,
        y,
        copperSpot ? 192 + copperOreShade * 0.5 : 104 + copperOreShade,
        copperSpot ? 118 + copperOreShade * 0.45 : 110 + copperOreShade,
        copperSpot ? 72 + copperOreShade * 0.25 : 108 + copperOreShade,
      );

      const cactusRidge = Math.abs(((x + 6) % 18) - 9);
      const cactusNoise = noise(Math.floor(x / 3), y, 419) * 20 - 9;
      const cactusSpine = cactusRidge < 1.2 && y % 11 < 2;
      setPixel(
        pixels,
        BlockTexture.Cactus,
        x,
        y,
        cactusSpine ? 210 : 43 + cactusNoise * 0.35 - cactusRidge * 1.2,
        cactusSpine ? 226 : 129 + cactusNoise - cactusRidge * 2.1,
        cactusSpine ? 184 : 70 + cactusNoise * 0.42,
      );

      const flowerPetal =
        Math.hypot(x - 25, y - 24) < 12 ||
        Math.hypot(x - 39, y - 25) < 12 ||
        Math.hypot(x - 32, y - 17) < 11;
      const flowerCenter = Math.hypot(x - 32, y - 27) < 6;
      const flowerStem = Math.abs(x - 32) < 3 && y > 28;
      const flowerShade = noise(x, y, 431) * 18 - 8;
      if (flowerCenter) {
        setPixel(
          pixels,
          BlockTexture.Flower,
          x,
          y,
          235 + flowerShade * 0.32,
          180 + flowerShade * 0.25,
          39 + flowerShade * 0.2,
        );
      } else if (flowerPetal) {
        setPixel(
          pixels,
          BlockTexture.Flower,
          x,
          y,
          208 + flowerShade,
          74 + flowerShade * 0.32,
          162 + flowerShade * 0.82,
        );
      } else if (flowerStem) {
        setPixel(
          pixels,
          BlockTexture.Flower,
          x,
          y,
          54 + flowerShade * 0.28,
          132 + flowerShade,
          49 + flowerShade * 0.38,
        );
      } else {
        setPixel(
          pixels,
          BlockTexture.Flower,
          x,
          y,
          77 + flowerShade * 0.24,
          142 + flowerShade,
          58 + flowerShade * 0.4,
        );
      }

      const mushroomCap = Math.hypot((x - 32) / 1.2, y - 24) < 19 && y < 37;
      const mushroomStem = Math.abs(x - 32) < 8 && y >= 28;
      const mushroomSpot =
        mushroomCap &&
        (Math.hypot(x - 24, y - 22) < 4 ||
          Math.hypot(x - 39, y - 25) < 4 ||
          Math.hypot(x - 32, y - 17) < 3);
      const mushroomShade = noise(x, y, 457) * 20 - 9;
      if (mushroomSpot) {
        setPixel(
          pixels,
          BlockTexture.Mushroom,
          x,
          y,
          231 + mushroomShade * 0.25,
          217 + mushroomShade * 0.22,
          190 + mushroomShade * 0.18,
        );
      } else if (mushroomCap) {
        setPixel(
          pixels,
          BlockTexture.Mushroom,
          x,
          y,
          143 + mushroomShade,
          51 + mushroomShade * 0.34,
          39 + mushroomShade * 0.24,
        );
      } else if (mushroomStem) {
        setPixel(
          pixels,
          BlockTexture.Mushroom,
          x,
          y,
          187 + mushroomShade * 0.62,
          156 + mushroomShade * 0.48,
          118 + mushroomShade * 0.34,
        );
      } else {
        setPixel(
          pixels,
          BlockTexture.Mushroom,
          x,
          y,
          83 + mushroomShade * 0.28,
          91 + mushroomShade * 0.32,
          64 + mushroomShade * 0.22,
        );
      }

      const deepStoneCell = sampleHexCell(x, y, 479);
      const deepStoneDetail = noise(
        deepStoneCell.column,
        deepStoneCell.row,
        487,
      );
      let deepStoneShade =
        deepStoneCell.value * 34 - 17 - deepStoneCell.edge * 8;
      if (deepStoneDetail > 0.82) {
        deepStoneShade -= 10;
      }
      setPixel(
        pixels,
        BlockTexture.DeepStone,
        x,
        y,
        54 + deepStoneShade,
        59 + deepStoneShade,
        66 + deepStoneShade * 1.05,
      );

      const goldOreCell = sampleHexCell(x, y, 503);
      const goldOreSpeckle = noise(x, y, 509);
      const goldOreShade = goldOreCell.value * 30 - 14 - goldOreCell.edge * 7;
      const goldSpot = goldOreSpeckle > 0.78 || goldOreCell.value < 0.14;
      setPixel(
        pixels,
        BlockTexture.GoldOre,
        x,
        y,
        goldSpot ? 226 + goldOreShade * 0.38 : 91 + goldOreShade,
        goldSpot ? 174 + goldOreShade * 0.32 : 96 + goldOreShade,
        goldSpot ? 54 + goldOreShade * 0.12 : 94 + goldOreShade,
      );

      const crystalOreCell = sampleHexCell(x, y, 541);
      const crystalOreSpeckle = noise(x, y, 557);
      const crystalOreShade =
        crystalOreCell.value * 32 - 15 - crystalOreCell.edge * 7;
      const crystalSpot =
        crystalOreSpeckle > 0.8 || crystalOreCell.value < 0.12;
      setPixel(
        pixels,
        BlockTexture.CrystalOre,
        x,
        y,
        crystalSpot ? 124 + crystalOreShade * 0.42 : 61 + crystalOreShade,
        crystalSpot ? 218 + crystalOreShade * 0.46 : 66 + crystalOreShade,
        crystalSpot ? 238 + crystalOreShade * 0.5 : 75 + crystalOreShade,
      );

      const torchShaft = Math.abs(x - 32) < 7 && y > 16;
      const torchHead = Math.hypot(x - 32, y - 18) < 12;
      const torchFlame = Math.hypot((x - 32) / 0.8, y - 12) < 10;
      const torchGlow = Math.max(0, 1 - Math.hypot(x - 32, y - 18) / 34);
      const torchShade = noise(x, y, 601) * 18 - 8;
      if (torchFlame) {
        setPixel(
          pixels,
          BlockTexture.Torch,
          x,
          y,
          255,
          186 + torchShade * 0.25,
          54 + torchShade * 0.12,
        );
      } else if (torchHead) {
        setPixel(
          pixels,
          BlockTexture.Torch,
          x,
          y,
          94 + torchShade,
          55 + torchShade * 0.6,
          26 + torchShade * 0.3,
        );
      } else if (torchShaft) {
        setPixel(
          pixels,
          BlockTexture.Torch,
          x,
          y,
          128 + torchShade,
          82 + torchShade * 0.72,
          42 + torchShade * 0.42,
        );
      } else {
        setPixel(
          pixels,
          BlockTexture.Torch,
          x,
          y,
          45 + torchGlow * 80,
          30 + torchGlow * 48,
          18 + torchGlow * 14,
          255,
        );
      }
    }
  }

  return {
    width: BLOCK_TEXTURE_ATLAS_WIDTH,
    height: BLOCK_TEXTURE_ATLAS_HEIGHT,
    pixels,
  };
}

export function atlasUv(
  texture: BlockTexture,
  localU: number,
  localV: number,
): readonly [number, number] {
  const insetU = 0.5 + localU * (BLOCK_TEXTURE_TILE_SIZE - 1);
  const insetV = 0.5 + localV * (BLOCK_TEXTURE_TILE_SIZE - 1);

  return [
    (texture * BLOCK_TEXTURE_TILE_SIZE + insetU) / BLOCK_TEXTURE_ATLAS_WIDTH,
    insetV / BLOCK_TEXTURE_ATLAS_HEIGHT,
  ];
}
