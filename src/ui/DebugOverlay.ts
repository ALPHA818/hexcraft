import type { GameMode } from "../game/gameMode.ts";
import type { TerrainBiome } from "../geometry/terrainChunk.ts";
import type { PerformanceStats } from "../performance/PerformanceMonitor.ts";
import type { WeatherKind } from "../environment/Atmosphere.ts";

export type DebugOverlayWeatherSnapshot = Readonly<{
  cellX: number;
  cellZ: number;
  timeBucket: number;
  cellWeather: WeatherKind;
  localWeather: WeatherKind;
  localIntensity: number;
  wind: readonly [number, number];
  cloudSample?: readonly [number, number];
  particleCount?: number;
}>;

export type DebugOverlaySnapshot = Readonly<{
  performance: PerformanceStats;
  position: readonly [number, number, number];
  axial: Readonly<{ q: number; r: number }>;
  level: number;
  biome: TerrainBiome;
  gameMode: GameMode;
  weather?: DebugOverlayWeatherSnapshot;
}>;

type DebugOverlayRow = readonly [label: string, value: string];

export function debugOverlayRows(
  snapshot: DebugOverlaySnapshot,
): readonly DebugOverlayRow[] {
  const [x, y, z] = snapshot.position;
  const performance = snapshot.performance;

  return [
    ["FPS", performance.fps.toFixed(0)],
    ["Average frame ms", performance.averageFrameMs.toFixed(1)],
    ["Worst frame ms", performance.worstFrameMs.toFixed(1)],
    [
      "Slow frame count",
      `${performance.slowFrameCount}/${performance.sampleCount}`,
    ],
    ["Terrain update ms", performance.terrainUpdateMs.toFixed(1)],
    ["Mesh update ms", performance.meshUpdateMs.toFixed(1)],
    ["Entity update ms", performance.entityUpdateMs.toFixed(1)],
    ["Audio update ms", performance.audioUpdateMs.toFixed(1)],
    ["Position", `${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`],
    ["Axial", `q ${snapshot.axial.q}, r ${snapshot.axial.r}`],
    ["Level", String(snapshot.level)],
    ["Biome", snapshot.biome],
    ...(snapshot.weather
      ? ([
          [
            "Weather zone",
            `${snapshot.weather.localWeather} ${snapshot.weather.localIntensity.toFixed(2)} in cell ${snapshot.weather.cellX}, ${snapshot.weather.cellZ}`,
          ],
          [
            "Weather cell",
            `${snapshot.weather.cellX}, ${snapshot.weather.cellZ} @ ${snapshot.weather.timeBucket}`,
          ],
          ["Cell weather", snapshot.weather.cellWeather],
          ["Local weather", snapshot.weather.localWeather],
          ["Local intensity", snapshot.weather.localIntensity.toFixed(2)],
          [
            "Wind direction",
            `${snapshot.weather.wind[0].toFixed(2)}, ${snapshot.weather.wind[1].toFixed(2)}`,
          ],
          ...(snapshot.weather.cloudSample
            ? ([
                [
                  "Cloud sample",
                  `${snapshot.weather.cloudSample[0].toFixed(1)}, ${snapshot.weather.cloudSample[1].toFixed(1)}`,
                ],
              ] as const)
            : []),
          ...(snapshot.weather.particleCount !== undefined
            ? ([
                [
                  "Weather particles",
                  snapshot.weather.particleCount.toLocaleString(),
                ],
              ] as const)
            : []),
        ] as const)
      : []),
    ["Loaded chunks", performance.loadedChunks.toLocaleString()],
    ["Mesh faces", performance.meshFaceCount.toLocaleString()],
    ["Triangles", performance.meshTriangleCount.toLocaleString()],
    ["Opaque vertices", performance.opaqueVertexCount.toLocaleString()],
    [
      "Transparent vertices",
      performance.transparentVertexCount.toLocaleString(),
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
