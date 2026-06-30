import { describe, expect, it, vi } from "vitest";

import { PlayerStats } from "./PlayerStats.ts";
import {
  SurvivalStatsController,
  type SurvivalFrameState,
} from "./SurvivalStatsController.ts";

const SAFE_FRAME: SurvivalFrameState = {
  grounded: true,
  fallDistance: 0,
  sprinting: false,
  inWater: false,
};

describe("survival stats controller", () => {
  it("decreases hunger over time", () => {
    const stats = new PlayerStats();
    const controller = new SurvivalStatsController({ mode: "survival", stats });

    controller.update(10, SAFE_FRAME);

    expect(stats.hunger).toBeLessThan(100);
  });

  it("decreases stamina while sprinting", () => {
    const stats = new PlayerStats();
    const controller = new SurvivalStatsController({ mode: "survival", stats });

    controller.update(1, { ...SAFE_FRAME, sprinting: true });

    expect(stats.stamina).toBeLessThan(100);
  });

  it("decreases oxygen underwater", () => {
    const stats = new PlayerStats();
    const controller = new SurvivalStatsController({ mode: "survival", stats });

    controller.update(1, { ...SAFE_FRAME, inWater: true });

    expect(stats.oxygen).toBeLessThan(100);
  });

  it("decreases health when drowning", () => {
    const stats = new PlayerStats();
    const controller = new SurvivalStatsController({ mode: "survival", stats });

    stats.setOxygen(0);
    controller.update(1, { ...SAFE_FRAME, inWater: true });

    expect(stats.health).toBeLessThan(100);
  });

  it("creative mode does not take damage", () => {
    const stats = new PlayerStats();
    const controller = new SurvivalStatsController({ mode: "creative", stats });

    stats.setOxygen(0);
    stats.setHunger(0);
    controller.damage(100);
    controller.update(10, {
      grounded: true,
      fallDistance: 100,
      sprinting: true,
      inWater: true,
    });

    expect(stats.snapshot()).toEqual({
      health: 100,
      hunger: 100,
      stamina: 100,
      oxygen: 100,
      isDead: false,
    });
  });

  it("dies and respawns after the respawn delay", () => {
    const stats = new PlayerStats();
    const onDeath = vi.fn();
    const onRespawn = vi.fn();
    const controller = new SurvivalStatsController({
      mode: "survival",
      stats,
      onDeath,
      onRespawn,
    });

    controller.damage(200);
    for (let step = 0; step < 9; step += 1) {
      controller.update(0.25, SAFE_FRAME);
    }

    expect(onDeath).toHaveBeenCalledOnce();
    expect(onRespawn).toHaveBeenCalledOnce();
    expect(stats.isDead).toBe(false);
    expect(stats.health).toBe(100);
  });
});
