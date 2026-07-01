export type PerformanceMonitorOptions = Readonly<{
  sampleSize?: number;
  slowFrameThresholdMs?: number;
}>;

export type PerformanceRenderStatsInput = Readonly<{
  renderBackend?: string;
  loadedChunks?: number;
  meshFaceCount?: number;
  meshTriangleCount?: number;
  opaqueVertexCount?: number;
  transparentVertexCount?: number;
}>;

export type PerformanceStats = Readonly<{
  fps: number;
  lastFrameMs: number;
  averageFrameMs: number;
  minimumFrameMs: number;
  worstFrameMs: number;
  slowFrameCount: number;
  sampleCount: number;
  terrainUpdateMs: number;
  meshUpdateMs: number;
  entityUpdateMs: number;
  audioUpdateMs: number;
  renderBackend: string;
  loadedChunks: number;
  meshFaceCount: number;
  meshTriangleCount: number;
  opaqueVertexCount: number;
  transparentVertexCount: number;
}>;

const DEFAULT_SAMPLE_SIZE = 120;
const DEFAULT_SLOW_FRAME_THRESHOLD_MS = 33.34;
const MAX_DELTA_SECONDS = 0.25;

function finitePositive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function finiteCount(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;
}

export class PerformanceMonitor {
  readonly #sampleSize: number;
  readonly #slowFrameThresholdMs: number;
  readonly #frameTimes: Float32Array;

  #sampleCount = 0;
  #sampleIndex = 0;
  #totalFrameMs = 0;
  #lastFrameMs = 0;
  #terrainUpdateMs = 0;
  #meshUpdateMs = 0;
  #entityUpdateMs = 0;
  #audioUpdateMs = 0;
  #renderBackend = "Unknown";
  #loadedChunks = 0;
  #meshFaceCount = 0;
  #meshTriangleCount = 0;
  #opaqueVertexCount = 0;
  #transparentVertexCount = 0;

  constructor(options: PerformanceMonitorOptions = {}) {
    this.#sampleSize = Math.max(
      1,
      Math.floor(finitePositive(options.sampleSize, DEFAULT_SAMPLE_SIZE)),
    );
    this.#slowFrameThresholdMs = finitePositive(
      options.slowFrameThresholdMs,
      DEFAULT_SLOW_FRAME_THRESHOLD_MS,
    );
    this.#frameTimes = new Float32Array(this.#sampleSize);
  }

  recordFrame(deltaSeconds: number): void {
    const delta = Math.min(Math.max(deltaSeconds, 0), MAX_DELTA_SECONDS);
    const frameMs = delta * 1000;

    this.#lastFrameMs = frameMs;

    if (this.#sampleCount < this.#sampleSize) {
      this.#sampleCount += 1;
    } else {
      this.#totalFrameMs -= this.#frameTimes[this.#sampleIndex] ?? 0;
    }

    this.#frameTimes[this.#sampleIndex] = frameMs;
    this.#totalFrameMs += frameMs;
    this.#sampleIndex = (this.#sampleIndex + 1) % this.#sampleSize;
  }

  recordTerrainUpdateTime(milliseconds: number): void {
    this.#terrainUpdateMs = finiteNonNegative(milliseconds);
  }

  recordMeshUpdateTime(milliseconds: number): void {
    this.#meshUpdateMs = finiteNonNegative(milliseconds);
  }

  recordEntityUpdateTime(milliseconds: number): void {
    this.#entityUpdateMs = finiteNonNegative(milliseconds);
  }

  recordAudioUpdateTime(milliseconds: number): void {
    this.#audioUpdateMs = finiteNonNegative(milliseconds);
  }

  recordRenderStats(stats: PerformanceRenderStatsInput): void {
    this.#renderBackend = stats.renderBackend ?? this.#renderBackend;
    this.#loadedChunks = finiteCount(stats.loadedChunks, this.#loadedChunks);
    this.#meshFaceCount = finiteCount(stats.meshFaceCount, this.#meshFaceCount);
    this.#meshTriangleCount = finiteCount(
      stats.meshTriangleCount,
      this.#meshTriangleCount,
    );
    this.#opaqueVertexCount = finiteCount(
      stats.opaqueVertexCount,
      this.#opaqueVertexCount,
    );
    this.#transparentVertexCount = finiteCount(
      stats.transparentVertexCount,
      this.#transparentVertexCount,
    );
  }

  snapshot(): PerformanceStats {
    let minimumFrameMs = 0;
    let worstFrameMs = 0;
    let slowFrameCount = 0;

    if (this.#sampleCount > 0) {
      minimumFrameMs = Number.POSITIVE_INFINITY;

      for (let index = 0; index < this.#sampleCount; index += 1) {
        const frameMs = this.#frameTimes[index] ?? 0;

        minimumFrameMs = Math.min(minimumFrameMs, frameMs);
        worstFrameMs = Math.max(worstFrameMs, frameMs);
        if (frameMs >= this.#slowFrameThresholdMs) {
          slowFrameCount += 1;
        }
      }
    }

    const averageFrameMs =
      this.#sampleCount > 0 ? this.#totalFrameMs / this.#sampleCount : 0;

    return {
      fps: averageFrameMs > 0 ? 1000 / averageFrameMs : 0,
      lastFrameMs: this.#lastFrameMs,
      averageFrameMs,
      minimumFrameMs,
      worstFrameMs,
      slowFrameCount,
      sampleCount: this.#sampleCount,
      terrainUpdateMs: this.#terrainUpdateMs,
      meshUpdateMs: this.#meshUpdateMs,
      entityUpdateMs: this.#entityUpdateMs,
      audioUpdateMs: this.#audioUpdateMs,
      renderBackend: this.#renderBackend,
      loadedChunks: this.#loadedChunks,
      meshFaceCount: this.#meshFaceCount,
      meshTriangleCount: this.#meshTriangleCount,
      opaqueVertexCount: this.#opaqueVertexCount,
      transparentVertexCount: this.#transparentVertexCount,
    };
  }

  reset(): void {
    this.#frameTimes.fill(0);
    this.#sampleCount = 0;
    this.#sampleIndex = 0;
    this.#totalFrameMs = 0;
    this.#lastFrameMs = 0;
    this.#terrainUpdateMs = 0;
    this.#meshUpdateMs = 0;
    this.#entityUpdateMs = 0;
    this.#audioUpdateMs = 0;
    this.#renderBackend = "Unknown";
    this.#loadedChunks = 0;
    this.#meshFaceCount = 0;
    this.#meshTriangleCount = 0;
    this.#opaqueVertexCount = 0;
    this.#transparentVertexCount = 0;
  }
}
