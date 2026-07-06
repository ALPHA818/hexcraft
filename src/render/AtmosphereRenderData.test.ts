import { describe, expect, it } from "vitest";

import type { AtmosphereState } from "../environment/Atmosphere.ts";
import { atmosphereParticleShader } from "./hexPrism.wgsl.ts";
import {
  rendererAtmosphereSnapshotFromState,
  weatherParticleVertexFloatCount,
  WEATHER_PARTICLE_FLOATS_PER_VERTEX,
  WEATHER_PARTICLE_VERTICES_PER_PARTICLE,
  writeWeatherParticleVertices,
} from "./AtmosphereRenderData.ts";
import {
  WEBGL_ATMOSPHERE_PARTICLE_FRAGMENT_SHADER,
  WEBGL_ATMOSPHERE_PARTICLE_VERTEX_SHADER,
} from "./WebGlRenderer.ts";

function baseState(overrides: Partial<AtmosphereState> = {}): AtmosphereState {
  return {
    lightDirection: [0.2, -0.9, 0.1],
    lightColor: [1, 0.9, 0.7],
    fogColor: [0.42, 0.55, 0.65],
    ambient: 0.28,
    weatherIntensity: 0,
    cloudCover: 0,
    daylight: 0.75,
    timeSeconds: 12,
    weather: "clear",
    rendererLighting: [0.9, 0.12, 24, 44],
    ...overrides,
  };
}

describe("renderer atmosphere data", () => {
  it("defaults atmosphere snapshots safely", () => {
    const snapshot = rendererAtmosphereSnapshotFromState(baseState());

    expect(snapshot.weatherParticles).toEqual([]);
    expect(snapshot.fogDensity).toBe(0);
    expect(snapshot.cloudLayer.opacity).toBe(0);
    expect(snapshot.sunDirection).toEqual([0.2, -0.9, 0.1]);
    expect(snapshot.moonDirection).toEqual([-0.2, -0.9, -0.1]);
    expect(snapshot.skyTopColor).toEqual([0.42, 0.55, 0.65]);
  });

  it("accepts world-space weather particle positions", () => {
    const snapshot = rendererAtmosphereSnapshotFromState(
      baseState({
        weather: "rain",
        weatherIntensity: 1,
        weatherParticles: [
          {
            worldX: 128,
            worldY: 35,
            worldZ: -64,
            speed: 1,
            length: 14,
            drift: 0.1,
            phase: 0,
            kind: "rain",
          },
        ],
      }),
    );
    const target = new Float32Array(
      weatherParticleVertexFloatCount(snapshot.weatherParticles.length),
    );
    const vertexCount = writeWeatherParticleVertices(
      target,
      snapshot,
      [0, 0, -1],
    );

    expect(vertexCount).toBe(WEATHER_PARTICLE_VERTICES_PER_PARTICLE);
    expect(target[0]).toBeGreaterThan(127.5);
    expect(target[0]).toBeLessThan(128.5);
    expect(target[1]).toBeGreaterThan(34);
    expect(target[2]).toBeLessThan(-63);
  });

  it("does not subtract camera position while generating particle vertices", () => {
    const snapshot = rendererAtmosphereSnapshotFromState(
      baseState({
        weather: "snow",
        weatherIntensity: 1,
        weatherParticles: [
          {
            worldX: 320,
            worldY: 24,
            worldZ: 512,
            speed: 1,
            length: 10,
            drift: 0,
            phase: 0,
            kind: "snow",
          },
        ],
      }),
    );
    const first = new Float32Array(
      weatherParticleVertexFloatCount(snapshot.weatherParticles.length),
    );
    const second = new Float32Array(first.length);

    writeWeatherParticleVertices(first, snapshot, [0, 0, -1]);
    writeWeatherParticleVertices(second, snapshot, [1, 0, 0]);

    expect(first[0]).not.toBeCloseTo(0);
    expect(first[0]).not.toBe(second[0]);
    expect(first[0]).toBeGreaterThan(319.5);
    expect(first[0]).toBeLessThan(320.5);
    expect(second[2]).toBeGreaterThan(511.5);
    expect(second[2]).toBeLessThan(512.5);
  });

  it("keeps particle shader entry points available for WebGPU and WebGL", () => {
    expect(atmosphereParticleShader).toContain("atmosphere_particle_vertex");
    expect(atmosphereParticleShader).toContain("atmosphere_particle_fragment");
    expect(WEBGL_ATMOSPHERE_PARTICLE_VERTEX_SHADER).toContain(
      "model_view_projection",
    );
    expect(WEBGL_ATMOSPHERE_PARTICLE_FRAGMENT_SHADER).toContain("output_color");
    expect(WEATHER_PARTICLE_FLOATS_PER_VERTEX).toBe(7);
  });
});
