import type { TerrainBiome } from "../geometry/terrainChunk.ts";
import { DAY_NIGHT_CYCLE_SECONDS } from "../world/GameTime.ts";
import type { WeatherKind } from "./Atmosphere.ts";
import { sampleCloudLayer, type CloudLayerSample } from "./CloudLayer.ts";
import { sampleWeatherCell, type WeatherCellSample } from "./WeatherCells.ts";

export type AtmosphereObserver = Readonly<{
  position: readonly [number, number, number];
  direction?: readonly [number, number, number];
  biome?: TerrainBiome | null;
  biomeAtWorld?: (worldX: number, worldZ: number) => TerrainBiome | null;
}>;

export type AtmosphereObserverSnapshot = Readonly<{
  position: readonly [number, number, number];
  direction?: readonly [number, number, number];
  biome?: TerrainBiome | null;
}>;

export type CelestialSkySnapshot = Readonly<{
  timeSeconds: number;
  daylight: number;
  sunDirection: readonly [number, number, number];
  moonDirection: readonly [number, number, number];
  starVisibility: number;
  skyColor: readonly [number, number, number];
  horizonColor: readonly [number, number, number];
}>;

export type WorldAtmosphereSnapshot = Readonly<{
  observer: AtmosphereObserverSnapshot;
  celestial: CelestialSkySnapshot;
  weatherCell: WeatherCellSample;
  clouds: CloudLayerSample;
  weather: WeatherKind;
  weatherIntensity: number;
  cloudCover: number;
  fogDensity: number;
}>;

export type WorldAtmosphereOptions = Readonly<{
  seed: number;
}>;

export type WorldAtmosphereSampleInput = Readonly<{
  observer: AtmosphereObserver;
  timeSeconds: number;
  baseWeather: WeatherKind;
  enableWeather?: boolean;
  allowSandstorm?: boolean;
}>;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function mix(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function smoothStep(value: number): number {
  return value * value * (3 - 2 * value);
}

function mixColor(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  amount: number,
): [number, number, number] {
  return [
    mix(a[0], b[0], amount),
    mix(a[1], b[1], amount),
    mix(a[2], b[2], amount),
  ];
}

function directionFromOrbit(
  angle: number,
  sunHeight: number,
): [number, number, number] {
  const elevation = Math.max(0.12, Math.abs(sunHeight));
  const horizontal = Math.sqrt(Math.max(0, 1 - elevation * elevation));
  const azimuth = angle * 0.72;

  return [
    Math.cos(azimuth) * horizontal,
    -elevation,
    Math.sin(azimuth) * horizontal,
  ];
}

export function calculateCelestialSky(
  timeSeconds: number,
  cloudCover = 0,
): CelestialSkySnapshot {
  const dayPhase =
    ((timeSeconds % DAY_NIGHT_CYCLE_SECONDS) + DAY_NIGHT_CYCLE_SECONDS) /
    DAY_NIGHT_CYCLE_SECONDS;
  const sunAngle = dayPhase * Math.PI * 2 - Math.PI / 2;
  const sunHeight = Math.sin(sunAngle);
  const daylight = smoothStep(clamp01((sunHeight + 0.12) / 0.88));
  const night = smoothStep(clamp01((-sunHeight + 0.04) / 0.52));
  const twilight = Math.max(0, 1 - Math.abs(sunHeight + 0.01) / 0.3);
  const dayTop: [number, number, number] = [0.18, 0.46, 0.72];
  const dayHorizon: [number, number, number] = [0.76, 0.88, 0.9];
  const nightTop: [number, number, number] = [0.015, 0.025, 0.075];
  const nightHorizon: [number, number, number] = [0.08, 0.11, 0.18];
  const twilightTop: [number, number, number] = [0.19, 0.08, 0.27];
  const twilightHorizon: [number, number, number] = [1, 0.31, 0.12];
  const overcast: [number, number, number] = [0.25, 0.31, 0.35];
  let skyColor = mixColor(nightTop, dayTop, daylight);
  let horizonColor = mixColor(nightHorizon, dayHorizon, daylight);

  skyColor = mixColor(skyColor, twilightTop, twilight * 0.7);
  horizonColor = mixColor(horizonColor, twilightHorizon, twilight * 0.88);
  skyColor = mixColor(skyColor, overcast, clamp01(cloudCover) * 0.42);
  horizonColor = mixColor(horizonColor, overcast, clamp01(cloudCover) * 0.32);

  return {
    timeSeconds,
    daylight,
    sunDirection: directionFromOrbit(sunAngle, sunHeight),
    moonDirection: directionFromOrbit(sunAngle + Math.PI, -sunHeight),
    starVisibility: night * (1 - clamp01(cloudCover) * 0.86),
    skyColor,
    horizonColor,
  };
}

export class WorldAtmosphere {
  readonly #seed: number;

  constructor(options: WorldAtmosphereOptions) {
    this.#seed = Number.isFinite(options.seed) ? Math.trunc(options.seed) : 1;
  }

  snapshot(input: WorldAtmosphereSampleInput): WorldAtmosphereSnapshot {
    const [worldX, height, worldZ] = input.observer.position;
    const observer = {
      position: input.observer.position,
      direction: input.observer.direction,
      biome: input.observer.biome,
    };
    const weatherCell = sampleWeatherCell({
      seed: this.#seed,
      worldX,
      worldZ,
      timeSeconds: input.timeSeconds,
      baseWeather: input.baseWeather,
      biome: input.observer.biome,
      height,
      enableWeather: input.enableWeather,
      allowSandstorm: input.allowSandstorm,
      biomeAtWorld: input.observer.biomeAtWorld,
    });
    const cloudCover = weatherCell.cloudCover;
    const clouds = sampleCloudLayer({
      seed: this.#seed,
      worldX,
      worldZ,
      timeSeconds: input.timeSeconds,
      cloudCover,
      weatherIntensity: weatherCell.intensity,
    });
    const fogDensity = clamp01(
      weatherCell.fogDensity + (height < 8 ? (8 - height) * 0.018 : 0),
    );

    return {
      observer,
      celestial: calculateCelestialSky(input.timeSeconds, cloudCover),
      weatherCell,
      clouds,
      weather: weatherCell.weather,
      weatherIntensity: weatherCell.intensity,
      cloudCover,
      fogDensity,
    };
  }
}
