import type { TerrainBiome } from "../geometry/terrainChunk.ts";
import { biomeWeatherWeightsFor } from "../world/Biomes.ts";
import type { WeatherKind } from "./Atmosphere.ts";

export const WEATHER_CELL_SIZE = 96;
export const WEATHER_CELL_TIME_BUCKET_SECONDS = 240;
const WEATHER_KINDS = [
  "clear",
  "cloudy",
  "rain",
  "storm",
  "snow",
  "fog",
  "sandstorm",
] as const satisfies readonly WeatherKind[];

export type WeatherCellInfluence = Readonly<{
  cellX: number;
  cellZ: number;
  centerX: number;
  centerZ: number;
  biome: TerrainBiome | null;
  weather: WeatherKind;
  intensity: number;
  cloudCover: number;
  fogDensity: number;
  weight: number;
}>;

export type WeatherCellSample = Readonly<{
  cellX: number;
  cellZ: number;
  centerX: number;
  centerZ: number;
  timeBucket: number;
  cellWeather: WeatherKind;
  weather: WeatherKind;
  localWeather: WeatherKind;
  intensity: number;
  cloudCover: number;
  fogDensity: number;
  blend: readonly WeatherCellInfluence[];
}>;

export type WeatherCellSampleInput = Readonly<{
  seed: number;
  worldX: number;
  worldZ: number;
  timeSeconds: number;
  baseWeather: WeatherKind;
  biome?: TerrainBiome | null;
  height?: number;
  enableWeather?: boolean;
  allowSandstorm?: boolean;
  cellSize?: number;
  biomeAtWorld?: (worldX: number, worldZ: number) => TerrainBiome | null;
}>;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizedSeed(seed: number): number {
  return Number.isFinite(seed) ? Math.trunc(seed) : 1;
}

function hashInt(
  seed: number,
  x: number,
  z: number,
  bucket: number,
  salt: number,
): number {
  let value = normalizedSeed(seed);

  value ^= Math.imul(Math.trunc(x), 0x9e3779b1);
  value ^= Math.imul(Math.trunc(z), 0x85ebca6b);
  value ^= Math.imul(Math.trunc(bucket), 0xc2b2ae35);
  value ^= Math.imul(Math.trunc(salt), 0x27d4eb2f);
  value = Math.imul(value ^ (value >>> 15), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  value ^= value >>> 16;

  return value >>> 0;
}

export function weatherCellRandom(
  seed: number,
  x: number,
  z: number,
  bucket: number,
  salt: number,
): number {
  return hashInt(seed, x, z, bucket, salt) / 0x1_0000_0000;
}

function baseWeatherIntensity(weather: WeatherKind): number {
  switch (weather) {
    case "clear":
      return 0;
    case "cloudy":
      return 0.24;
    case "rain":
      return 0.68;
    case "storm":
      return 1;
    case "snow":
      return 0.58;
    case "fog":
      return 0.82;
    case "sandstorm":
      return 0.92;
  }
}

function baseCloudCover(weather: WeatherKind): number {
  switch (weather) {
    case "clear":
      return 0.03;
    case "cloudy":
      return 0.74;
    case "rain":
      return 0.78;
    case "storm":
      return 0.96;
    case "snow":
      return 0.7;
    case "fog":
      return 0.52;
    case "sandstorm":
      return 0.82;
  }
}

function biomeAtCellCenter(
  input: WeatherCellSampleInput,
  centerX: number,
  centerZ: number,
): TerrainBiome | null {
  return input.biomeAtWorld?.(centerX, centerZ) ?? input.biome ?? null;
}

function biomeFogBias(biome: TerrainBiome | null | undefined): number {
  switch (biome) {
    case "swamp":
      return 0.2;
    case "forest":
      return 0.08;
    case "beach":
      return 0.06;
    case "tundra":
    case "snow":
      return 0.1;
    case "desert":
    case "badlands":
      return -0.08;
    case "alpine":
      return 0.04;
    case "grassland":
    case undefined:
    case null:
      return 0;
  }
}

function biomeWeatherBias(
  biome: TerrainBiome | null | undefined,
  weather: WeatherKind,
): number {
  switch (biome) {
    case "desert":
    case "badlands":
      return weather === "sandstorm"
        ? 0.3
        : weather === "rain" || weather === "snow" || weather === "fog"
          ? -0.2
          : 0;
    case "snow":
    case "tundra":
    case "alpine":
      return weather === "snow"
        ? 0.22
        : weather === "rain" || weather === "sandstorm"
          ? -0.12
          : 0;
    case "forest":
      return weather === "rain" || weather === "fog" ? 0.08 : 0;
    case "swamp":
      return weather === "fog"
        ? 0.24
        : weather === "rain"
          ? 0.14
          : weather === "clear"
            ? -0.08
            : 0;
    case "grassland":
    case "beach":
    case undefined:
    case null:
      return 0;
  }
}

function biomeWeatherVariant(
  baseWeather: WeatherKind,
  biome: TerrainBiome | null | undefined,
  roll: number,
  allowSandstorm: boolean,
): WeatherKind {
  const weights = biomeWeatherWeightsFor(biome);
  const weightedWeather = WEATHER_KINDS.map((weather) => ({
    weather,
    weight:
      weather === "sandstorm" && !allowSandstorm
        ? 0
        : weights[weather] * baseWeatherPreference(baseWeather, weather),
  }));
  const totalWeight = weightedWeather.reduce(
    (total, candidate) => total + candidate.weight,
    0,
  );

  if (totalWeight <= 0) {
    return baseWeather === "sandstorm" && !allowSandstorm
      ? "cloudy"
      : baseWeather;
  }

  let remaining = clamp01(roll) * totalWeight;

  for (const candidate of weightedWeather) {
    remaining -= candidate.weight;

    if (remaining <= 0) {
      return candidate.weather;
    }
  }

  return weightedWeather.at(-1)?.weather ?? "clear";
}

function baseWeatherPreference(
  baseWeather: WeatherKind,
  candidate: WeatherKind,
): number {
  if (baseWeather === candidate) {
    return 3;
  }

  switch (baseWeather) {
    case "clear":
      return candidate === "cloudy" ? 0.75 : candidate === "fog" ? 0.35 : 0.18;
    case "cloudy":
      return candidate === "clear"
        ? 0.8
        : candidate === "rain" || candidate === "fog" || candidate === "snow"
          ? 0.95
          : candidate === "sandstorm"
            ? 0.85
            : 0.45;
    case "rain":
      return candidate === "cloudy"
        ? 0.9
        : candidate === "storm"
          ? 1.2
          : candidate === "sandstorm" || candidate === "snow"
            ? 1.25
            : 0.4;
    case "storm":
      return candidate === "rain"
        ? 1.4
        : candidate === "sandstorm" || candidate === "snow"
          ? 1.1
          : candidate === "cloudy"
            ? 0.65
            : 0.35;
    case "snow":
      return candidate === "cloudy"
        ? 0.85
        : candidate === "fog"
          ? 0.55
          : candidate === "rain"
            ? 0.35
            : 0.18;
    case "fog":
      return candidate === "cloudy"
        ? 0.85
        : candidate === "rain"
          ? 0.7
          : candidate === "snow"
            ? 0.55
            : 0.25;
    case "sandstorm":
      return candidate === "clear" ? 0.75 : candidate === "cloudy" ? 0.7 : 0.22;
  }
}

function sampleWeatherCellInfluence(
  input: WeatherCellSampleInput,
  cellX: number,
  cellZ: number,
  timeBucket: number,
  cellSize: number,
  weight: number,
): WeatherCellInfluence {
  const centerX = (cellX + 0.5) * cellSize;
  const centerZ = (cellZ + 0.5) * cellSize;
  const biome = biomeAtCellCenter(input, centerX, centerZ);
  const weather =
    input.enableWeather === false
      ? "clear"
      : biomeWeatherVariant(
          input.baseWeather,
          biome,
          weatherCellRandom(input.seed, cellX, cellZ, timeBucket, 11),
          input.allowSandstorm === true,
        );
  const intensityNoise = weatherCellRandom(
    input.seed,
    cellX,
    cellZ,
    timeBucket,
    17,
  );
  const cloudNoise = weatherCellRandom(
    input.seed,
    cellX,
    cellZ,
    timeBucket,
    23,
  );
  const altitude = input.height ?? 0;
  const altitudeFog =
    altitude < 9 ? (9 - altitude) * 0.012 : altitude > 34 ? 0.08 : 0;
  const intensity = clamp01(
    baseWeatherIntensity(weather) * (0.72 + intensityNoise * 0.48),
  );
  const cloudCover = clamp01(
    baseCloudCover(weather) +
      biomeWeatherBias(biome, weather) * 0.18 +
      (cloudNoise - 0.5) * 0.18 +
      intensity * 0.08,
  );
  const fogDensity = clamp01(
    intensity * 0.42 + cloudCover * 0.2 + biomeFogBias(biome) + altitudeFog,
  );

  return {
    cellX,
    cellZ,
    centerX,
    centerZ,
    biome,
    weather,
    intensity,
    cloudCover,
    fogDensity,
    weight,
  };
}

function weatherBlendScore(influence: WeatherCellInfluence): number {
  const activeBias =
    influence.weather === "clear"
      ? 0
      : influence.weather === "cloudy"
        ? 0.06
        : influence.weather === "fog"
          ? 0.18
          : 0.24;

  return influence.weight * (influence.intensity + activeBias);
}

function localWeatherFromBlend(
  influences: readonly WeatherCellInfluence[],
): WeatherKind {
  let selected: WeatherKind = "clear";
  let selectedScore = 0;
  let cloudyScore = 0;

  for (const influence of influences) {
    if (influence.weather === "cloudy") {
      cloudyScore += influence.weight * (influence.cloudCover + 0.08);
    }

    const score = weatherBlendScore(influence);
    if (score > selectedScore) {
      selected = influence.weather;
      selectedScore = score;
    }
  }

  if (selectedScore >= 0.1 && selected !== "clear") {
    return selected;
  }

  return cloudyScore >= 0.52 ? "cloudy" : "clear";
}

function fractionalPart(value: number): number {
  return value - Math.floor(value);
}

export function sampleWeatherCell(
  input: WeatherCellSampleInput,
): WeatherCellSample {
  const cellSize = Math.max(8, input.cellSize ?? WEATHER_CELL_SIZE);
  const currentCellX = Math.floor(input.worldX / cellSize);
  const currentCellZ = Math.floor(input.worldZ / cellSize);
  const timeBucket = Math.floor(
    Math.max(0, input.timeSeconds) / WEATHER_CELL_TIME_BUCKET_SECONDS,
  );
  const centerX = (currentCellX + 0.5) * cellSize;
  const centerZ = (currentCellZ + 0.5) * cellSize;
  const interpolationX = input.worldX / cellSize - 0.5;
  const interpolationZ = input.worldZ / cellSize - 0.5;
  const baseCellX = Math.floor(interpolationX);
  const baseCellZ = Math.floor(interpolationZ);
  const amountX = fractionalPart(interpolationX);
  const amountZ = fractionalPart(interpolationZ);
  const rawInfluences = [
    { x: baseCellX, z: baseCellZ, weight: (1 - amountX) * (1 - amountZ) },
    { x: baseCellX + 1, z: baseCellZ, weight: amountX * (1 - amountZ) },
    { x: baseCellX, z: baseCellZ + 1, weight: (1 - amountX) * amountZ },
    { x: baseCellX + 1, z: baseCellZ + 1, weight: amountX * amountZ },
  ];
  const blend = rawInfluences
    .filter((cell) => cell.weight > 0.0001)
    .map((cell) =>
      sampleWeatherCellInfluence(
        input,
        cell.x,
        cell.z,
        timeBucket,
        cellSize,
        cell.weight,
      ),
    );
  const currentCell = sampleWeatherCellInfluence(
    input,
    currentCellX,
    currentCellZ,
    timeBucket,
    cellSize,
    1,
  );
  const intensity = clamp01(
    blend.reduce(
      (total, influence) => total + influence.intensity * influence.weight,
      0,
    ),
  );
  const cloudCover = clamp01(
    blend.reduce(
      (total, influence) => total + influence.cloudCover * influence.weight,
      0,
    ),
  );
  const fogDensity = clamp01(
    blend.reduce(
      (total, influence) => total + influence.fogDensity * influence.weight,
      0,
    ),
  );
  const localWeather = localWeatherFromBlend(blend);

  return {
    cellX: currentCellX,
    cellZ: currentCellZ,
    centerX,
    centerZ,
    timeBucket,
    cellWeather: currentCell.weather,
    weather: localWeather,
    localWeather,
    intensity,
    cloudCover,
    fogDensity,
    blend,
  };
}
