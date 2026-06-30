import type { GameTime } from "./GameTime.ts";
import { blockDefinitionFor } from "./blocks.ts";

export const MAX_BLOCK_LIGHT = 15;

export type TerrainLightInput = Readonly<{
  material: number;
  level: number;
  surfaceLevel: number;
  hasSkyExposure: boolean;
}>;

export type RendererLightingInput = Readonly<{
  ambient: number;
  daylight: number;
  weatherIntensity: number;
}>;

export type RendererLightingValues = readonly [
  sunlight: number,
  minimumAmbient: number,
  fogStart: number,
  fogEnd: number,
];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function blockLightEmission(numericId: number): number {
  return clamp(
    blockDefinitionFor(numericId).lightEmission ?? 0,
    0,
    MAX_BLOCK_LIGHT,
  );
}

export function isEmissiveBlock(numericId: number): boolean {
  return blockLightEmission(numericId) > 0;
}

export function sunlightFromDaylight(daylight: number): number {
  return 0.08 + clamp01(daylight) * 0.92;
}

export function sunlightForGameTime(
  gameTime: Pick<GameTime, "daylight">,
): number {
  return sunlightFromDaylight(gameTime.daylight);
}

export function approximateSkyExposure(
  level: number,
  surfaceLevel: number,
  hasSkyExposure: boolean,
): number {
  const depth = Math.max(0, surfaceLevel - level);
  const depthExposure = Math.max(0, 1 - depth / 14);

  if (hasSkyExposure) {
    return Math.max(0.72, depthExposure);
  }

  return depthExposure * 0.38;
}

export function caveDarknessMultiplier(
  level: number,
  surfaceLevel: number,
  skyExposure: number,
): number {
  const depth = Math.max(0, surfaceLevel - level);
  const depthDarkening = Math.min(0.58, depth * 0.018);
  const exposure = clamp01(skyExposure);
  const light = 0.34 + exposure * 0.66 - depthDarkening;

  return clamp(light, 0.2, 1);
}

export function localTerrainLightMultiplier(input: TerrainLightInput): number {
  const skyExposure = approximateSkyExposure(
    input.level,
    input.surfaceLevel,
    input.hasSkyExposure,
  );
  const caveLight = caveDarknessMultiplier(
    input.level,
    input.surfaceLevel,
    skyExposure,
  );
  const emission = blockLightEmission(input.material) / MAX_BLOCK_LIGHT;

  return clamp(Math.max(caveLight, 0.28 + emission * 0.88), 0.2, 1.2);
}

export function rendererLightingValues(
  input: RendererLightingInput,
): RendererLightingValues {
  const weather = clamp01(input.weatherIntensity);
  const sunlight =
    sunlightFromDaylight(input.daylight) * (0.88 - weather * 0.24);
  const minimumAmbient = clamp(input.ambient * 0.42, 0.035, 0.18);
  const fogStart = 32 - weather * 13;
  const fogEnd = 47 - weather * 4;

  return [sunlight, minimumAmbient, fogStart, fogEnd];
}
