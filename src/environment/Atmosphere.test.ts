import { describe, expect, it } from "vitest";

import {
  calculateAtmosphereState,
  DAY_NIGHT_CYCLE_SECONDS,
  DAY_OR_NIGHT_SECONDS,
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
      weather: "rain",
    };

    expect(state.lightDirection[1]).toBeLessThan(0);
    expect(state.weatherIntensity).toBeGreaterThanOrEqual(0);
    expect(state.weatherIntensity).toBeLessThanOrEqual(1);
  });

  it("makes daylight brighter than midnight", () => {
    const noon = calculateAtmosphereState(
      DAY_NIGHT_CYCLE_SECONDS / 2,
      "clear",
    );
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

  it("transitions through sunrise, noon, sunset, and night", () => {
    const midnight = calculateAtmosphereState(0, "clear");
    const sunrise = calculateAtmosphereState(
      DAY_NIGHT_CYCLE_SECONDS / 4,
      "clear",
    );
    const noon = calculateAtmosphereState(
      DAY_NIGHT_CYCLE_SECONDS / 2,
      "clear",
    );
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
