import type { AudioManager } from "../audio/AudioManager.ts";
import type { Atmosphere } from "../environment/Atmosphere.ts";
import type { EntityManager } from "../entities/EntityManager.ts";
import type { EntityRenderer } from "../entities/EntityRenderer.ts";
import {
  TERRAIN_BASE_Y,
  TERRAIN_BLOCK_HEIGHT,
  TerrainMaterial,
} from "../geometry/terrainChunk.ts";
import {
  PLAYER_EYE_HEIGHT,
  type FirstPersonCamera,
} from "../input/FirstPersonCamera.ts";
import type { PerformanceMonitor } from "../performance/PerformanceMonitor.ts";
import type { DebugOverlay } from "../ui/DebugOverlay.ts";
import type { SurvivalHud } from "../ui/SurvivalHud.ts";
import {
  biomeAt,
  type InfiniteTerrain,
  type TerrainStreamUpdate,
  worldToAxial,
} from "../world/InfiniteTerrain.ts";
import type { GameRenderer, RendererBackend } from "./GameBootstrap.ts";
import type { GameSettings } from "./GameSettings.ts";
import type { Inventory } from "./Inventory.ts";
import { updateHeldMaterialHazards } from "./MaterialHazards.ts";
import type { ActiveGame } from "./GameSession.ts";
import type { SurvivalController } from "./SurvivalController.ts";
import type { SurvivalStatsController } from "./SurvivalStatsController.ts";

export function formatMeshStats(mesh: TerrainStreamUpdate["mesh"]): string {
  const opaqueVertexCount = mesh.opaqueVertexCount ?? mesh.vertexCount;
  const translucentVertexCount = mesh.translucentVertexCount ?? 0;

  return (
    `Mesh · ${mesh.emittedBlockCount.toLocaleString()} emitted blocks · ` +
    `${mesh.emittedFaceCount.toLocaleString()} faces · ` +
    `${mesh.emittedTriangleCount.toLocaleString()} triangles · ` +
    `${opaqueVertexCount.toLocaleString()} opaque verts · ` +
    `${translucentVertexCount.toLocaleString()} transparent verts`
  );
}

export function nowMilliseconds(): number {
  return globalThis.performance?.now() ?? Date.now();
}

export function recordPerformanceRenderStats(
  monitor: PerformanceMonitor,
  backend: RendererBackend,
  update: TerrainStreamUpdate,
): void {
  monitor.recordRenderStats({
    renderBackend: backend,
    loadedChunks: update.loadedChunkCount,
    meshFaceCount: update.mesh.emittedFaceCount,
    meshTriangleCount: update.mesh.emittedTriangleCount,
    opaqueVertexCount: update.mesh.opaqueVertexCount ?? update.mesh.vertexCount,
    transparentVertexCount: update.mesh.translucentVertexCount ?? 0,
  });
}

export function isDesertHeavyArea(
  seed: number,
  position: readonly [number, number, number],
): boolean {
  const center = worldToAxial(position[0], position[2]);
  const centerBiome = biomeAt(center.q, center.r, seed);

  if (centerBiome === "desert" || centerBiome === "badlands") {
    return true;
  }

  let dryBiomeCount = 0;
  let sampleCount = 0;

  for (let q = center.q - 4; q <= center.q + 4; q += 1) {
    for (let r = center.r - 4; r <= center.r + 4; r += 1) {
      if (Math.abs(q - center.q) + Math.abs(r - center.r) > 6) {
        continue;
      }

      const biome = biomeAt(q, r, seed);
      sampleCount += 1;
      if (biome === "desert" || biome === "badlands") {
        dryBiomeCount += 1;
      }
    }
  }

  return sampleCount > 0 && dryBiomeCount / sampleCount >= 0.38;
}

export function materialUnderPlayer(
  world: InfiniteTerrain,
  position: readonly [number, number, number],
): TerrainMaterial {
  const level = playerLevel(position);
  const { q, r } = worldToAxial(position[0], position[2]);

  return world.materialAt(q, r, level);
}

export function playerLevel(
  position: readonly [number, number, number],
): number {
  return Math.max(
    0,
    Math.floor(
      (position[1] - PLAYER_EYE_HEIGHT - 0.05 - TERRAIN_BASE_Y) /
        TERRAIN_BLOCK_HEIGHT,
    ),
  );
}

export type StartGameLoopOptions = Readonly<{
  sessionId: number;
  getActiveGame: () => ActiveGame | null;
  world: InfiniteTerrain;
  renderer: GameRenderer;
  camera: FirstPersonCamera;
  atmosphere: Atmosphere;
  inventory: Inventory;
  survival: SurvivalController;
  survivalStats: SurvivalStatsController;
  survivalHud: SurvivalHud;
  audioManager: AudioManager;
  entityManager: EntityManager;
  entityRenderer: EntityRenderer;
  settings: GameSettings;
  statusMessage: HTMLElement;
  debugOverlay: DebugOverlay;
  applyWorldUpdate: (update: TerrainStreamUpdate) => void;
  onDeviceLost: (reason: string) => void;
}>;

export function startGameLoop(options: StartGameLoopOptions): void {
  const {
    sessionId,
    getActiveGame,
    world,
    renderer,
    camera,
    atmosphere,
    inventory,
    survival,
    survivalStats,
    survivalHud,
    audioManager,
    entityManager,
    entityRenderer,
    settings,
    statusMessage,
    debugOverlay,
    applyWorldUpdate,
    onDeviceLost,
  } = options;
  let streamRequestId = 0;
  const biomeAtWorld = (worldX: number, worldZ: number) => {
    const sampleAxial = worldToAxial(worldX, worldZ);

    return biomeAt(sampleAxial.q, sampleAxial.r, settings.worldSeed);
  };

  renderer.start(
    camera,
    atmosphere,
    (deltaSeconds) => {
      const game = getActiveGame();

      if (game?.id !== sessionId) {
        return;
      }
      const monitor = game.performanceMonitor;

      const [x, , z] = camera.position();
      const terrainRequestStart = nowMilliseconds();
      const update = world.requestUpdate({ x, z });

      if (update) {
        const requestId = ++streamRequestId;
        statusMessage.dataset.streaming = "true";
        if (!statusMessage.textContent?.endsWith(" · loading…")) {
          statusMessage.textContent += " · loading…";
        }
        void update
          .then((worldUpdate) => {
            const terrainUpdateMs = nowMilliseconds() - terrainRequestStart;
            const activeGame = getActiveGame();

            if (
              activeGame?.id === sessionId &&
              requestId === streamRequestId &&
              worldUpdate
            ) {
              monitor.recordTerrainUpdateTime(terrainUpdateMs);
              applyWorldUpdate(worldUpdate);
            }
          })
          .catch((error) => {
            console.error("Background terrain streaming failed.", error);
            if (getActiveGame()?.id === sessionId) {
              statusMessage.textContent = "Terrain streaming failed.";
            }
          })
          .finally(() => {
            const activeGame = getActiveGame();

            if (activeGame?.id === sessionId && requestId === streamRequestId) {
              delete statusMessage.dataset.streaming;
            }
          });
      }

      const waterUpdateStart = nowMilliseconds();
      const waterUpdate = world.advanceWaterFlow(deltaSeconds);
      if (waterUpdate) {
        void waterUpdate
          .then((worldUpdate) => {
            const waterUpdateMs = nowMilliseconds() - waterUpdateStart;

            if (getActiveGame()?.id === sessionId && worldUpdate) {
              monitor.recordTerrainUpdateTime(waterUpdateMs);
              applyWorldUpdate(worldUpdate);
            }
          })
          .catch((error) => {
            console.error("Water flow remesh failed.", error);
          });
      }
      const cameraState = camera.state();
      const cameraPosition = camera.position();
      const axial = worldToAxial(cameraPosition[0], cameraPosition[2]);
      const biome = biomeAt(axial.q, axial.r, settings.worldSeed);

      atmosphere.update(deltaSeconds, {
        position: cameraPosition,
        direction: camera.direction(),
        biome,
        biomeAtWorld,
      });
      monitor.recordFrame(deltaSeconds);
      debugOverlay.advance(deltaSeconds);

      survivalStats.update(deltaSeconds, cameraState);
      const materialHazards = updateHeldMaterialHazards({
        mode: game.settings.gameMode,
        material: inventory.selectedProceduralMaterial(),
        deltaSeconds,
        state: game.materialHazardState,
      });
      if (materialHazards.damage > 0) {
        survivalStats.damage(materialHazards.damage);
      }
      survivalHud.update(
        survivalStats.stats.snapshot(),
        materialHazards.warnings,
      );
      survival.update(deltaSeconds);
      const audioUpdateStart = nowMilliseconds();
      audioManager.updatePlayerSteps(deltaSeconds, {
        position: cameraPosition,
        state: cameraState,
        material: materialUnderPlayer(world, cameraPosition),
      });
      monitor.recordAudioUpdateTime(nowMilliseconds() - audioUpdateStart);
      const entityUpdateStart = nowMilliseconds();
      entityManager.update(deltaSeconds, {
        terrain: world,
        playerPosition: cameraPosition,
      });
      entityManager.ensurePassiveAnimal(
        world,
        cameraPosition,
        settings.worldSeed,
      );
      renderer.updateEntityMesh(
        entityRenderer.buildMesh(entityManager.entities()),
      );
      monitor.recordEntityUpdateTime(nowMilliseconds() - entityUpdateStart);

      const activeGame = getActiveGame();
      if (activeGame?.settings.debugOverlay && debugOverlay.shouldRender()) {
        const worldAtmosphere = atmosphere.state().worldAtmosphere;

        debugOverlay.update({
          performance: monitor.snapshot(),
          position: cameraPosition,
          axial,
          level: playerLevel(cameraPosition),
          biome,
          gameMode: activeGame.settings.gameMode,
          weather: worldAtmosphere
            ? {
                cellX: worldAtmosphere.weatherCell.cellX,
                cellZ: worldAtmosphere.weatherCell.cellZ,
                timeBucket: worldAtmosphere.weatherCell.timeBucket,
                cellWeather: worldAtmosphere.weatherCell.cellWeather,
                localWeather: worldAtmosphere.weather,
                localIntensity: worldAtmosphere.weatherIntensity,
                wind: worldAtmosphere.clouds.wind,
                cloudSample: [
                  worldAtmosphere.clouds.worldU,
                  worldAtmosphere.clouds.worldV,
                ],
                particleCount: atmosphere.state().weatherParticles?.length ?? 0,
              }
            : undefined,
        });
      }
    },
    onDeviceLost,
  );
}
