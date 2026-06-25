export const BLOCK_TEXTURE_TILE_SIZE = 64;
export const BLOCK_TEXTURE_TILE_COUNT = 13;
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
    const centerY =
      TEXTURE_HEX_RADIUS + row * TEXTURE_HEX_Y_SPACING;
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
        TEXTURE_HEX_RADIUS +
        rowOffset +
        column * TEXTURE_HEX_X_SPACING;
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
    edge: smoothStep(
      (0.9 - (secondDistance - nearestDistance)) / 0.9,
    ),
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
      const dirtShade =
        dirtCell.value * 32 - 15 - dirtCell.edge * 8;
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
      const grassEdge =
        12 + noise(sideCell.column, sideCell.row, 29) * 7;
      if (sideCell.centerY < grassEdge) {
        const edgeShade =
          sideCell.value * 32 - 15 - sideCell.edge * 10;
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
      const sandShade =
        sandCell.value * 26 - 12 - sandCell.edge * 6;
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
      const snowShade =
        snowCell.value * 18 - 8 - snowCell.edge * 5;
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
      const alpineShade =
        alpineCell.value * 36 - 18 - alpineCell.edge * 8;
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
      const dryShade =
        dryCell.value * 30 - 14 - dryCell.edge * 7;
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
      const waterShade =
        waterCell.value * 24 - 11 - waterCell.edge * 4;
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
      const caveShade =
        caveCell.value * 28 - 13 - caveCell.edge * 7;
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
        Math.hypot(x - 32, y - 32) * 0.65 +
          woodCell.value * 2,
      );
      const woodShade =
        woodCell.value * 24 -
        11 +
        woodRing * 8 -
        woodCell.edge * 5;
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
      const leafShade =
        leafCell.value * 36 - 17 - leafCell.edge * 10;
      const leafSpeckle = noise(x, y, 331);
      const leafVein =
        Math.abs(((x + y * 2) % 17) - 8) < 1 ||
        Math.abs(((x * 2 - y) % 19) - 9) < 1;
      const leafHole =
        !leafVein &&
        (leafSpeckle > 0.9 ||
          (leafCell.edge > 0.82 && leafCell.value < 0.34));
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
    (texture * BLOCK_TEXTURE_TILE_SIZE + insetU) /
      BLOCK_TEXTURE_ATLAS_WIDTH,
    insetV / BLOCK_TEXTURE_ATLAS_HEIGHT,
  ];
}
