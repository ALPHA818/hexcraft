import { describe, expect, it } from "vitest";

import { debugOverlayRows } from "./DebugOverlay.ts";

describe("debug overlay", () => {
  it("formats useful development fields", () => {
    const rows = debugOverlayRows({
      performance: {
        fps: 59.6,
        lastFrameMs: 18.2,
        averageFrameMs: 16.7,
        minimumFrameMs: 12.1,
        worstFrameMs: 24.4,
        slowFrameCount: 1,
        sampleCount: 60,
        terrainUpdateMs: 8.6,
        meshUpdateMs: 2.1,
        entityUpdateMs: 0.7,
        audioUpdateMs: 0.2,
        renderBackend: "WebGPU",
        loadedChunks: 25,
        meshFaceCount: 12_345,
        meshTriangleCount: 24_690,
        opaqueVertexCount: 74_000,
        transparentVertexCount: 900,
      },
      position: [1.234, 5.678, -9.101],
      axial: { q: 2, r: -3 },
      level: 42,
      biome: "forest",
      gameMode: "creative",
    });

    expect(rows).toContainEqual(["FPS", "60"]);
    expect(rows).toContainEqual(["Frame time", "16.7 ms avg · 18.2 ms last"]);
    expect(rows).toContainEqual(["Frame range", "12.1-24.4 ms"]);
    expect(rows).toContainEqual(["Slow frames", "1/60"]);
    expect(rows).toContainEqual(["Terrain update", "8.6 ms"]);
    expect(rows).toContainEqual(["Mesh update", "2.1 ms"]);
    expect(rows).toContainEqual(["Entity update", "0.7 ms"]);
    expect(rows).toContainEqual(["Audio update", "0.2 ms"]);
    expect(rows).toContainEqual(["Axial", "q 2, r -3"]);
    expect(rows).toContainEqual(["Biome", "forest"]);
    expect(rows).toContainEqual(["Loaded chunks", "25"]);
    expect(rows).toContainEqual(["Mesh faces", "12,345"]);
    expect(rows).toContainEqual(["Mesh triangles", "24,690"]);
    expect(rows).toContainEqual([
      "Vertices",
      "74,000 opaque · 900 transparent",
    ]);
    expect(rows).toContainEqual(["Renderer", "WebGPU"]);
  });
});
