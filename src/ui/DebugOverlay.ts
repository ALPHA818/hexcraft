import type { GameMode } from "../game/gameMode.ts";
import type { TerrainBiome } from "../geometry/terrainChunk.ts";
import type { PerformanceStats } from "../performance/PerformanceMonitor.ts";

export type DebugOverlaySnapshot = Readonly<{
  performance: PerformanceStats;
  position: readonly [number, number, number];
  axial: Readonly<{ q: number; r: number }>;
  level: number;
  biome: TerrainBiome;
  gameMode: GameMode;
}>;

type DebugOverlayRow = readonly [label: string, value: string];

export function debugOverlayRows(
  snapshot: DebugOverlaySnapshot,
): readonly DebugOverlayRow[] {
  const [x, y, z] = snapshot.position;
  const performance = snapshot.performance;

  return [
    ["FPS", performance.fps.toFixed(0)],
    [
      "Frame time",
      `${performance.averageFrameMs.toFixed(1)} ms avg · ${performance.lastFrameMs.toFixed(1)} ms last`,
    ],
    [
      "Frame range",
      `${performance.minimumFrameMs.toFixed(1)}-${performance.worstFrameMs.toFixed(1)} ms`,
    ],
    ["Slow frames", `${performance.slowFrameCount}/${performance.sampleCount}`],
    ["Terrain update", `${performance.terrainUpdateMs.toFixed(1)} ms`],
    ["Mesh update", `${performance.meshUpdateMs.toFixed(1)} ms`],
    ["Entity update", `${performance.entityUpdateMs.toFixed(1)} ms`],
    ["Audio update", `${performance.audioUpdateMs.toFixed(1)} ms`],
    ["Position", `${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`],
    ["Axial", `q ${snapshot.axial.q}, r ${snapshot.axial.r}`],
    ["Level", String(snapshot.level)],
    ["Biome", snapshot.biome],
    ["Loaded chunks", performance.loadedChunks.toLocaleString()],
    ["Mesh faces", performance.meshFaceCount.toLocaleString()],
    ["Mesh triangles", performance.meshTriangleCount.toLocaleString()],
    [
      "Vertices",
      `${performance.opaqueVertexCount.toLocaleString()} opaque · ${performance.transparentVertexCount.toLocaleString()} transparent`,
    ],
    ["Renderer", performance.renderBackend],
    ["Game mode", snapshot.gameMode],
  ];
}

export class DebugOverlay {
  readonly #root: HTMLElement;

  #visible = false;
  #renderElapsed = 0;

  constructor(root: HTMLElement) {
    this.#root = root;
    this.#root.className = "debug-panel";
    this.setVisible(false);
  }

  setVisible(visible: boolean): void {
    this.#visible = visible;
    this.#root.hidden = !visible;
  }

  advance(deltaSeconds: number): void {
    const delta = Math.min(Math.max(deltaSeconds, 0), 0.25);

    this.#renderElapsed += delta;
  }

  shouldRender(): boolean {
    if (!this.#visible || this.#renderElapsed < 0.12) {
      return false;
    }

    this.#renderElapsed = 0;
    return true;
  }

  update(snapshot: DebugOverlaySnapshot): void {
    if (!this.#visible) {
      return;
    }

    const title = document.createElement("strong");
    const list = document.createElement("dl");

    title.textContent = "Debug · F3";
    for (const [label, value] of debugOverlayRows(snapshot)) {
      const term = document.createElement("dt");
      const description = document.createElement("dd");

      term.textContent = label;
      description.textContent = value;
      list.append(term, description);
    }

    this.#root.replaceChildren(title, list);
  }

  clear(): void {
    this.#root.replaceChildren();
    this.setVisible(false);
  }
}
