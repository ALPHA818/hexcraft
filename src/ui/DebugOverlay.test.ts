import { describe, expect, it } from "vitest";

import { debugOverlayRows } from "./DebugOverlay.ts";

describe("debug overlay", () => {
  it("formats useful development fields", () => {
    const rows = debugOverlayRows({
      fps: 59.6,
      position: [1.234, 5.678, -9.101],
      axial: { q: 2, r: -3 },
      level: 42,
      biome: "forest",
      loadedChunks: 25,
      meshFaceCount: 12345,
      rendererBackend: "WebGPU",
      gameMode: "creative",
    });

    expect(rows).toContainEqual(["FPS", "60"]);
    expect(rows).toContainEqual(["Axial", "q 2, r -3"]);
    expect(rows).toContainEqual(["Biome", "forest"]);
    expect(rows).toContainEqual(["Renderer", "WebGPU"]);
  });
});
