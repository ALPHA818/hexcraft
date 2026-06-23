import { describe, expect, it } from "vitest";

import {
  calculateAtmosphereState,
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
    const noon = calculateAtmosphereState(150, "clear");
    const midnight = calculateAtmosphereState(0, "clear");

    expect(noon.daylight).toBeGreaterThan(midnight.daylight);
    expect(noon.ambient).toBeGreaterThan(midnight.ambient);
  });

  it("increases fog and cloud cover during storms", () => {
    const clear = calculateAtmosphereState(120, "clear");
    const storm = calculateAtmosphereState(120, "storm");

    expect(storm.weatherIntensity).toBe(1);
    expect(storm.cloudCover).toBeGreaterThan(clear.cloudCover);
  });

  it("transitions through sunrise, noon, sunset, and night", () => {
    const midnight = calculateAtmosphereState(0, "clear");
    const sunrise = calculateAtmosphereState(75, "clear");
    const noon = calculateAtmosphereState(150, "clear");
    const sunset = calculateAtmosphereState(225, "clear");

    expect(noon.daylight).toBeGreaterThan(sunrise.daylight);
    expect(noon.daylight).toBeGreaterThan(sunset.daylight);
    expect(midnight.daylight).toBeLessThan(sunrise.daylight);
  });
});
