import type { GameMode } from "../game/gameMode.ts";
import type { TerrainBiome } from "../geometry/terrainChunk.ts";

export type DebugOverlaySnapshot = Readonly<{
  fps: number;
  position: readonly [number, number, number];
  axial: Readonly<{ q: number; r: number }>;
  level: number;
  biome: TerrainBiome;
  loadedChunks: number;
  meshFaceCount: number;
  rendererBackend: string;
  gameMode: GameMode;
}>;

type DebugOverlayRow = readonly [label: string, value: string];

export function debugOverlayRows(
  snapshot: DebugOverlaySnapshot,
): readonly DebugOverlayRow[] {
  const [x, y, z] = snapshot.position;

  return [
    ["FPS", snapshot.fps.toFixed(0)],
    ["Position", `${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`],
    ["Axial", `q ${snapshot.axial.q}, r ${snapshot.axial.r}`],
    ["Level", String(snapshot.level)],
    ["Biome", snapshot.biome],
    ["Loaded chunks", snapshot.loadedChunks.toLocaleString()],
    ["Mesh faces", snapshot.meshFaceCount.toLocaleString()],
    ["Renderer", snapshot.rendererBackend],
    ["Game mode", snapshot.gameMode],
  ];
}

export class DebugOverlay {
  readonly #root: HTMLElement;

  #visible = false;
  #fps = 0;
  #frameCount = 0;
  #frameElapsed = 0;
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

  recordFrame(deltaSeconds: number): number {
    const delta = Math.min(Math.max(deltaSeconds, 0), 0.25);

    this.#frameElapsed += delta;
    this.#renderElapsed += delta;
    this.#frameCount += 1;

    if (this.#frameElapsed >= 0.5) {
      this.#fps = this.#frameCount / this.#frameElapsed;
      this.#frameElapsed = 0;
      this.#frameCount = 0;
    }

    return this.#fps;
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
