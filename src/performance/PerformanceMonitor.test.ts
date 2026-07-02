import { describe, expect, it } from "vitest";

import { debugOverlayRows } from "../ui/DebugOverlay.ts";
import { PerformanceMonitor } from "./PerformanceMonitor.ts";

describe("performance monitor", () => {
  it("calculates fps from rolling frame samples", () => {
    const monitor = new PerformanceMonitor({ sampleSize: 4 });

    monitor.recordFrame(1 / 60);
    monitor.recordFrame(1 / 30);

    expect(monitor.snapshot().fps).toBeCloseTo(40, 0);
  });

  it("calculates average frame time", () => {
    const monitor = new PerformanceMonitor({ sampleSize: 4 });

    monitor.recordFrame(0.01);
    monitor.recordFrame(0.02);
    monitor.recordFrame(0.03);

    expect(monitor.snapshot().averageFrameMs).toBeCloseTo(20);
  });

  it("tracks worst frame time", () => {
    const monitor = new PerformanceMonitor({ sampleSize: 4 });

    monitor.recordFrame(0.012);
    monitor.recordFrame(0.05);
    monitor.recordFrame(0.018);

    expect(monitor.snapshot().worstFrameMs).toBeCloseTo(50);
  });

  it("keeps a rolling sample window", () => {
    const monitor = new PerformanceMonitor({ sampleSize: 2 });

    monitor.recordFrame(0.01);
    monitor.recordFrame(0.02);
    monitor.recordFrame(0.03);

    const stats = monitor.snapshot();

    expect(stats.sampleCount).toBe(2);
    expect(stats.minimumFrameMs).toBeCloseTo(20);
    expect(stats.worstFrameMs).toBeCloseTo(30);
  });

  it("records subsystem and render stats", () => {
    const monitor = new PerformanceMonitor();

    monitor.recordTerrainUpdateTime(12.5);
    monitor.recordMeshUpdateTime(3.25);
    monitor.recordEntityUpdateTime(1.5);
    monitor.recordAudioUpdateTime(0.25);
    monitor.recordRenderStats({
      renderBackend: "WebGPU",
      loadedChunks: 81,
      meshFaceCount: 12_345,
      meshTriangleCount: 24_690,
      opaqueVertexCount: 90_000,
      transparentVertexCount: 1_200,
    });

    expect(monitor.snapshot()).toMatchObject({
      terrainUpdateMs: 12.5,
      meshUpdateMs: 3.25,
      entityUpdateMs: 1.5,
      audioUpdateMs: 0.25,
      renderBackend: "WebGPU",
      loadedChunks: 81,
      meshFaceCount: 12_345,
      meshTriangleCount: 24_690,
      opaqueVertexCount: 90_000,
      transparentVertexCount: 1_200,
    });
  });

  it("can reset collected samples and subsystem stats", () => {
    const monitor = new PerformanceMonitor();

    monitor.recordFrame(0.016);
    monitor.recordTerrainUpdateTime(10);
    monitor.recordRenderStats({ renderBackend: "WebGL 2", loadedChunks: 9 });
    monitor.reset();

    expect(monitor.snapshot()).toMatchObject({
      fps: 0,
      sampleCount: 0,
      averageFrameMs: 0,
      worstFrameMs: 0,
      terrainUpdateMs: 0,
      renderBackend: "Unknown",
      loadedChunks: 0,
    });
  });

  it("formats snapshot values for the debug overlay", () => {
    const monitor = new PerformanceMonitor({ sampleSize: 2 });

    monitor.recordFrame(0.016);
    monitor.recordMeshUpdateTime(2.4);
    monitor.recordRenderStats({
      renderBackend: "WebGPU",
      loadedChunks: 25,
      meshFaceCount: 4_000,
      meshTriangleCount: 8_000,
      opaqueVertexCount: 24_000,
      transparentVertexCount: 600,
    });

    const rows = debugOverlayRows({
      performance: monitor.snapshot(),
      position: [0, 10, 20],
      axial: { q: 1, r: 2 },
      level: 3,
      biome: "grassland",
      gameMode: "creative",
    });

    expect(rows).toContainEqual(["Renderer", "WebGPU"]);
    expect(rows).toContainEqual(["Loaded chunks", "25"]);
    expect(rows).toContainEqual(["Mesh faces", "4,000"]);
    expect(rows).toContainEqual(["Triangles", "8,000"]);
    expect(rows).toContainEqual(["Opaque vertices", "24,000"]);
    expect(rows).toContainEqual(["Transparent vertices", "600"]);
    expect(rows).toContainEqual(["Mesh update ms", "2.4"]);
  });
});
