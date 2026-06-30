import { describe, expect, it } from "vitest";

import { DAY_NIGHT_CYCLE_SECONDS, GameTime } from "./GameTime.ts";

describe("game time", () => {
  it("advances time correctly", () => {
    const time = new GameTime({ timeOfDay: 0.25, dayNumber: 3 });

    time.advance(DAY_NIGHT_CYCLE_SECONDS / 4);

    expect(time.timeOfDay).toBeCloseTo(0.5);
    expect(time.dayNumber).toBe(3);
    expect(time.sunAngle).toBeCloseTo(Math.PI / 2);
    expect(time.ambientLight).toBeGreaterThan(0.25);
  });

  it("increments the day after a full cycle", () => {
    const time = new GameTime({ timeOfDay: 0.9, dayNumber: 7 });

    time.advance(DAY_NIGHT_CYCLE_SECONDS * 0.25);

    expect(time.timeOfDay).toBeCloseTo(0.15);
    expect(time.dayNumber).toBe(8);
  });

  it("pause stops time", () => {
    const time = new GameTime({ timeOfDay: 0.4, dayNumber: 1 });

    time.pause();
    time.advance(DAY_NIGHT_CYCLE_SECONDS);

    expect(time.timeOfDay).toBeCloseTo(0.4);
    expect(time.dayNumber).toBe(1);
    expect(time.isPaused).toBe(true);

    time.resume();
    time.advance(DAY_NIGHT_CYCLE_SECONDS / 10);

    expect(time.timeOfDay).toBeCloseTo(0.5);
    expect(time.isPaused).toBe(false);
  });

  it("save/load restores time", () => {
    const time = new GameTime({ timeOfDay: 0.72, dayNumber: 12 });

    time.pause();

    const restored = GameTime.fromSerialized(time.snapshot());

    expect(restored.timeOfDay).toBeCloseTo(0.72);
    expect(restored.dayNumber).toBe(12);
    expect(restored.isPaused).toBe(true);
    expect(restored.isDay).toBe(time.isDay);
    expect(restored.isNight).toBe(time.isNight);
    expect(restored.moonAngle).toBeCloseTo(time.moonAngle);
  });
});
