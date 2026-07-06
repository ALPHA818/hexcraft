import { describe, expect, it } from "vitest";

import type { AtmosphereState } from "./Atmosphere.ts";
import { sampleCloudLayer } from "./CloudLayer.ts";
import { sampleWeatherCell, WEATHER_CELL_SIZE } from "./WeatherCells.ts";
import { WorldAtmosphere } from "./WorldAtmosphere.ts";
import { WorldWeatherParticles } from "./WorldWeatherParticles.ts";
import type { TerrainBiome } from "../geometry/terrainChunk.ts";
import type { WeatherKind } from "./Atmosphere.ts";

function countCellWeather(
  biome: TerrainBiome,
  weather: WeatherKind,
  options: Readonly<{
    seed: number;
    baseWeather: WeatherKind;
    allowSandstorm?: boolean;
  }>,
): number {
  let count = 0;

  for (let x = -10; x <= 10; x += 1) {
    for (let z = -10; z <= 10; z += 1) {
      const sample = sampleWeatherCell({
        seed: options.seed,
        worldX: (x + 0.5) * WEATHER_CELL_SIZE,
        worldZ: (z + 0.5) * WEATHER_CELL_SIZE,
        timeSeconds: 640,
        baseWeather: options.baseWeather,
        biome,
        height: 14,
        allowSandstorm: options.allowSandstorm,
      });

      if (sample.cellWeather === weather) {
        count += 1;
      }
    }
  }

  return count;
}

function findBlendPair(): Readonly<{
  seed: number;
  left: ReturnType<typeof sampleWeatherCell>;
  right: ReturnType<typeof sampleWeatherCell>;
  middle: ReturnType<typeof sampleWeatherCell>;
}> {
  const cellSize = WEATHER_CELL_SIZE;

  for (let seed = 1; seed < 100; seed += 1) {
    for (let cellX = -6; cellX < 6; cellX += 1) {
      const boundaryX = (cellX + 1) * cellSize;
      const biomeAtWorld = (worldX: number): TerrainBiome =>
        worldX < boundaryX ? "swamp" : "grassland";
      const input = {
        seed,
        worldZ: 0.5 * cellSize,
        timeSeconds: 720,
        baseWeather: "cloudy" as const,
        height: 12,
        biomeAtWorld,
      };
      const left = sampleWeatherCell({
        ...input,
        worldX: (cellX + 0.5) * cellSize,
      });
      const right = sampleWeatherCell({
        ...input,
        worldX: (cellX + 1.5) * cellSize,
      });

      if (
        left.cellWeather === right.cellWeather ||
        Math.abs(left.intensity - right.intensity) < 0.05
      ) {
        continue;
      }

      return {
        seed,
        left,
        right,
        middle: sampleWeatherCell({
          ...input,
          worldX: boundaryX,
        }),
      };
    }
  }

  throw new Error("Expected deterministic adjacent weather cells to differ.");
}

describe("world-space atmosphere", () => {
  it("samples the same weather cell for the same world position, seed, and time", () => {
    const first = sampleWeatherCell({
      seed: 1234,
      worldX: 184,
      worldZ: -92,
      timeSeconds: 360,
      baseWeather: "rain",
      biome: "forest",
      height: 14,
    });
    const second = sampleWeatherCell({
      seed: 1234,
      worldX: 184,
      worldZ: -92,
      timeSeconds: 360,
      baseWeather: "rain",
      biome: "forest",
      height: 14,
    });

    expect(second).toEqual(first);
  });

  it("moving the player changes sampled cloud and weather coordinates", () => {
    const near = sampleWeatherCell({
      seed: 42,
      worldX: 0,
      worldZ: 0,
      timeSeconds: 120,
      baseWeather: "storm",
    });
    const far = sampleWeatherCell({
      seed: 42,
      worldX: WEATHER_CELL_SIZE * 2,
      worldZ: WEATHER_CELL_SIZE,
      timeSeconds: 120,
      baseWeather: "storm",
    });
    const nearClouds = sampleCloudLayer({
      seed: 42,
      worldX: 0,
      worldZ: 0,
      timeSeconds: 120,
      cloudCover: 0.7,
      weatherIntensity: 0.5,
    });
    const farClouds = sampleCloudLayer({
      seed: 42,
      worldX: WEATHER_CELL_SIZE * 2,
      worldZ: WEATHER_CELL_SIZE,
      timeSeconds: 120,
      cloudCover: 0.7,
      weatherIntensity: 0.5,
    });

    expect([far.cellX, far.cellZ]).not.toEqual([near.cellX, near.cellZ]);
    expect(farClouds.worldU).not.toBe(nearClouds.worldU);
    expect(farClouds.worldV).not.toBe(nearClouds.worldV);
  });

  it("weather is not sampled from camera-local origin only", () => {
    const localOrigin = sampleWeatherCell({
      seed: 77,
      worldX: 0,
      worldZ: 0,
      timeSeconds: 480,
      baseWeather: "snow",
    });
    const sameLocalOriginInAnotherWorldCell = sampleWeatherCell({
      seed: 77,
      worldX: WEATHER_CELL_SIZE * 3,
      worldZ: -WEATHER_CELL_SIZE * 2,
      timeSeconds: 480,
      baseWeather: "snow",
    });

    expect(sameLocalOriginInAnotherWorldCell.centerX).not.toBe(
      localOrigin.centerX,
    );
    expect(sameLocalOriginInAnotherWorldCell.centerZ).not.toBe(
      localOrigin.centerZ,
    );
  });

  it("wind moves clouds over time without player movement", () => {
    const first = sampleCloudLayer({
      seed: 9,
      worldX: 24,
      worldZ: -32,
      timeSeconds: 0,
      cloudCover: 0.8,
      weatherIntensity: 0.4,
    });
    const later = sampleCloudLayer({
      seed: 9,
      worldX: 24,
      worldZ: -32,
      timeSeconds: 90,
      cloudCover: 0.8,
      weatherIntensity: 0.4,
    });

    expect(later.worldU).not.toBe(first.worldU);
    expect(later.worldV).not.toBe(first.worldV);
  });

  it("desert and badlands cells have a higher sandstorm chance", () => {
    const desert = countCellWeather("desert", "sandstorm", {
      seed: 918,
      baseWeather: "rain",
      allowSandstorm: true,
    });
    const grassland = countCellWeather("grassland", "sandstorm", {
      seed: 918,
      baseWeather: "rain",
      allowSandstorm: true,
    });

    expect(desert).toBeGreaterThan(grassland);
    expect(desert).toBeGreaterThan(120);
  });

  it("snow biomes have a higher snow chance", () => {
    const snow = countCellWeather("snow", "snow", {
      seed: 314,
      baseWeather: "rain",
    });
    const grassland = countCellWeather("grassland", "snow", {
      seed: 314,
      baseWeather: "rain",
    });

    expect(snow).toBeGreaterThan(grassland);
    expect(snow).toBeGreaterThan(120);
  });

  it("swamp cells have a higher fog chance", () => {
    const swamp = countCellWeather("swamp", "fog", {
      seed: 271,
      baseWeather: "cloudy",
    });
    const grassland = countCellWeather("grassland", "fog", {
      seed: 271,
      baseWeather: "cloudy",
    });

    expect(swamp).toBeGreaterThan(grassland);
    expect(swamp).toBeGreaterThan(180);
  });

  it("adjacent weather cells blend across zone boundaries", () => {
    const { left, right, middle } = findBlendPair();
    const minimumIntensity = Math.min(left.intensity, right.intensity);
    const maximumIntensity = Math.max(left.intensity, right.intensity);

    expect(middle.blend.length).toBeGreaterThan(1);
    expect(middle.intensity).toBeGreaterThan(minimumIntensity);
    expect(middle.intensity).toBeLessThan(maximumIntensity);
    expect(
      new Set(middle.blend.map((cell) => cell.weather)).size,
    ).toBeGreaterThan(1);
  });

  it("clear weather has no particles", () => {
    const particles = new WorldWeatherParticles(5, 32);

    particles.update({
      deltaSeconds: 1 / 60,
      timeSeconds: 10,
      weather: "clear",
      intensity: 1,
      observerPosition: [100, 20, -50],
    });

    expect(particles.activeParticleCount()).toBe(0);
    expect(particles.snapshot()).toEqual([]);
  });

  it("rain and snow particles keep world-space positions", () => {
    const rain = new WorldWeatherParticles(12, 16);
    const snow = new WorldWeatherParticles(12, 16);
    const observerPosition = [320, 24, -144] as const;

    rain.update({
      deltaSeconds: 1 / 60,
      timeSeconds: 50,
      weather: "rain",
      intensity: 0.75,
      observerPosition,
    });
    snow.update({
      deltaSeconds: 1 / 60,
      timeSeconds: 50,
      weather: "snow",
      intensity: 0.75,
      observerPosition,
    });

    const rainParticle = rain.particle(0);
    const snowParticle = snow.particle(0);

    expect(rainParticle?.kind).toBe("rain");
    expect(snowParticle?.kind).toBe("snow");
    expect(rainParticle?.worldX).toBeGreaterThan(observerPosition[0] - 32);
    expect(rainParticle?.worldX).toBeLessThan(observerPosition[0] + 32);
    expect(snowParticle?.worldZ).toBeGreaterThan(observerPosition[2] - 32);
    expect(snowParticle?.worldZ).toBeLessThan(observerPosition[2] + 32);
  });

  it("camera movement alone does not regenerate camera-local weather", () => {
    const particles = new WorldWeatherParticles(14, 16);
    const firstObserver = [40, 20, -12] as const;
    const secondObserver = [41, 20, -12] as const;

    particles.update({
      deltaSeconds: 0,
      timeSeconds: 20,
      weather: "rain",
      intensity: 0.75,
      observerPosition: firstObserver,
    });
    const firstParticle = particles.particle(0);

    particles.update({
      deltaSeconds: 0,
      timeSeconds: 20,
      weather: "rain",
      intensity: 0.75,
      observerPosition: secondObserver,
    });
    const secondParticle = particles.particle(0);

    expect(secondParticle?.worldX).toBe(firstParticle?.worldX);
    expect((secondParticle?.worldX ?? 0) - secondObserver[0]).not.toBeCloseTo(
      (firstParticle?.worldX ?? 0) - firstObserver[0],
    );
  });

  it("renderer-facing atmosphere state can carry a world atmosphere snapshot", () => {
    const worldAtmosphere = new WorldAtmosphere({ seed: 22 });
    const snapshot = worldAtmosphere.snapshot({
      observer: {
        position: [10, 16, -20],
        direction: [0, 0, -1],
        biome: "swamp",
      },
      timeSeconds: 700,
      baseWeather: "fog",
      enableWeather: true,
    });
    const state: AtmosphereState = {
      lightDirection: snapshot.celestial.sunDirection,
      lightColor: [1, 0.9, 0.7],
      fogColor: [0.5, 0.7, 0.8],
      ambient: 0.25,
      weatherIntensity: snapshot.weatherIntensity,
      cloudCover: snapshot.cloudCover,
      daylight: snapshot.celestial.daylight,
      timeSeconds: 700,
      weather: snapshot.weather,
      rendererLighting: [0.8, 0.1, 24, 44],
      fogDensity: snapshot.fogDensity,
      worldAtmosphere: snapshot,
    };

    expect(state.worldAtmosphere?.weatherCell).toEqual(snapshot.weatherCell);
    expect(state.worldAtmosphere?.clouds.worldU).toBe(snapshot.clouds.worldU);
  });
});
