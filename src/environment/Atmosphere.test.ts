import { describe, expect, it } from "vitest";

import {
  advanceWeatherSchedule,
  calculateAtmosphereState,
  countStormLightningEvents,
  createWeatherSchedule,
  DAY_NIGHT_CYCLE_SECONDS,
  DAY_OR_NIGHT_SECONDS,
  cycleWeatherKind,
  STORM_LIGHTNING_CHANCE_PER_SECOND,
  WEATHER_SEQUENCE,
  type AtmosphereState,
} from "./Atmosphere.ts";

describe("atmosphere state contract", () => {
  it("keeps lighting vectors and weather values renderer-friendly", () => {
    const state: AtmosphereState = {
      lightDirection: [0.3, -0.9, 0.2],
      lightColor: [1, 0.9, 0.7],
      fogColor: [0.5, 0.7, 0.8],
      ambient: 0.25,
      weatherIntensity: 0.7,
      cloudCover: 0.6,
      daylight: 0.9,
      timeSeconds: 42,
      weather: "fog",
      rendererLighting: [0.8, 0.1, 24, 44],
    };

    expect(state.lightDirection[1]).toBeLessThan(0);
    expect(state.weatherIntensity).toBeGreaterThanOrEqual(0);
    expect(state.weatherIntensity).toBeLessThanOrEqual(1);
  });

  it("makes daylight brighter than midnight", () => {
    const noon = calculateAtmosphereState(DAY_NIGHT_CYCLE_SECONDS / 2, "clear");
    const midnight = calculateAtmosphereState(0, "clear");

    expect(noon.daylight).toBeGreaterThan(midnight.daylight);
    expect(noon.ambient).toBeGreaterThan(midnight.ambient);
  });

  it("increases fog and cloud cover during storms", () => {
    const clear = calculateAtmosphereState(
      DAY_NIGHT_CYCLE_SECONDS * 0.4,
      "clear",
    );
    const storm = calculateAtmosphereState(
      DAY_NIGHT_CYCLE_SECONDS * 0.4,
      "storm",
    );

    expect(storm.weatherIntensity).toBe(1);
    expect(storm.cloudCover).toBeGreaterThan(clear.cloudCover);
  });

  it("supports the expanded weather state list", () => {
    expect(WEATHER_SEQUENCE).toEqual([
      "clear",
      "cloudy",
      "rain",
      "storm",
      "snow",
      "fog",
      "sandstorm",
    ]);

    for (const weather of WEATHER_SEQUENCE) {
      expect(
        calculateAtmosphereState(DAY_NIGHT_CYCLE_SECONDS * 0.4, weather)
          .weather,
      ).toBe(weather);
    }
  });

  it("keeps weather transitions deterministic when seeded", () => {
    const seed = 12345;
    let first = createWeatherSchedule(seed, "clear", {
      allowSandstorm: true,
    });
    let second = createWeatherSchedule(seed, "clear", {
      allowSandstorm: true,
    });

    for (let step = 0; step < 20; step += 1) {
      first = advanceWeatherSchedule(first, 45, seed, {
        allowSandstorm: true,
      });
      second = advanceWeatherSchedule(second, 45, seed, {
        allowSandstorm: true,
      });
    }

    expect(second).toEqual(first);
  });

  it("cycles manual weather and skips sandstorms unless available", () => {
    expect(cycleWeatherKind("clear")).toBe("cloudy");
    expect(cycleWeatherKind("fog")).toBe("clear");
    expect(cycleWeatherKind("fog", { allowSandstorm: true })).toBe("sandstorm");
    expect(cycleWeatherKind("sandstorm")).toBe("clear");
  });

  it("keeps disabled weather clear", () => {
    const schedule = advanceWeatherSchedule(
      createWeatherSchedule(7, "storm", { enableWeather: false }),
      999,
      7,
      { enableWeather: false, allowSandstorm: true },
    );

    expect(schedule.weather).toBe("clear");
  });

  it("creates storm lightning events within the expected probability range", () => {
    const seconds = 600;
    const events = countStormLightningEvents(9981, seconds, 4);
    const expected = seconds * STORM_LIGHTNING_CHANCE_PER_SECOND;

    expect(events).toBeGreaterThanOrEqual(Math.floor(expected * 0.45));
    expect(events).toBeLessThanOrEqual(Math.ceil(expected * 1.75));
  });

  it("transitions through sunrise, noon, sunset, and night", () => {
    const midnight = calculateAtmosphereState(0, "clear");
    const sunrise = calculateAtmosphereState(
      DAY_NIGHT_CYCLE_SECONDS / 4,
      "clear",
    );
    const noon = calculateAtmosphereState(DAY_NIGHT_CYCLE_SECONDS / 2, "clear");
    const sunset = calculateAtmosphereState(
      DAY_NIGHT_CYCLE_SECONDS * 0.75,
      "clear",
    );

    expect(noon.daylight).toBeGreaterThan(sunrise.daylight);
    expect(noon.daylight).toBeGreaterThan(sunset.daylight);
    expect(midnight.daylight).toBeLessThan(sunrise.daylight);
  });

  it("runs fifteen minutes of day and fifteen minutes of night", () => {
    expect(DAY_OR_NIGHT_SECONDS).toBe(15 * 60);
    expect(DAY_NIGHT_CYCLE_SECONDS).toBe(30 * 60);
  });
});
