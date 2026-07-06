export type CloudLayerSample = Readonly<{
  worldU: number;
  worldV: number;
  wind: readonly [number, number];
  textureOffsetX: number;
  textureOffsetY: number;
  screenOffsetX: number;
  screenOffsetY: number;
  opacity: number;
}>;

export type CloudLayerSampleInput = Readonly<{
  seed: number;
  worldX: number;
  worldZ: number;
  timeSeconds: number;
  cloudCover: number;
  weatherIntensity?: number;
}>;

const CLOUD_TEXTURE_REPEAT_X = 928;
const CLOUD_TEXTURE_REPEAT_Y = 288;
const CLOUD_WORLD_SCALE = 0.92;
const CLOUD_WIND_SPEED = 0.82;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizedSeed(seed: number): number {
  return Number.isFinite(seed) ? Math.trunc(seed) : 1;
}

function seedUnit(seed: number, salt: number): number {
  let value = Math.imul(
    normalizedSeed(seed) ^ Math.imul(salt, 0x9e3779b1),
    0x85ebca6b,
  );
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;

  return (value >>> 0) / 0x1_0000_0000;
}

function wrapTextureOffset(value: number, repeat: number): number {
  return ((value % repeat) + repeat) % repeat;
}

export function cloudWindForSeed(seed: number): readonly [number, number] {
  const angle = seedUnit(seed, 37) * Math.PI * 2;
  const strength = 0.72 + seedUnit(seed, 41) * 0.56;

  return [Math.cos(angle) * strength, Math.sin(angle) * strength];
}

export function sampleCloudLayer(
  input: CloudLayerSampleInput,
): CloudLayerSample {
  const wind = cloudWindForSeed(input.seed);
  const windX = wind[0] * input.timeSeconds * CLOUD_WIND_SPEED;
  const windZ = wind[1] * input.timeSeconds * CLOUD_WIND_SPEED;
  const seedOffsetX = seedUnit(input.seed, 101) * CLOUD_TEXTURE_REPEAT_X;
  const seedOffsetY = seedUnit(input.seed, 103) * CLOUD_TEXTURE_REPEAT_Y;
  const worldU = (input.worldX + windX) * CLOUD_WORLD_SCALE + seedOffsetX;
  const worldV = (input.worldZ + windZ) * CLOUD_WORLD_SCALE + seedOffsetY;
  const textureOffsetX = -wrapTextureOffset(worldU, CLOUD_TEXTURE_REPEAT_X);
  const textureOffsetY = -wrapTextureOffset(worldV, CLOUD_TEXTURE_REPEAT_Y);
  const cover = clamp01(input.cloudCover);
  const intensity = clamp01(input.weatherIntensity ?? 0);

  return {
    worldU,
    worldV,
    wind,
    textureOffsetX,
    textureOffsetY,
    screenOffsetX: (textureOffsetX / CLOUD_TEXTURE_REPEAT_X) * 96,
    screenOffsetY: (textureOffsetY / CLOUD_TEXTURE_REPEAT_Y) * 24,
    opacity:
      cover <= 0.04 ? 0 : Math.pow(cover, 1.35) * (0.78 + intensity * 0.22),
  };
}
