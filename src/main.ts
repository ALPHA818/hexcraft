import "./style.css";
import { AudioManager } from "./audio/AudioManager.ts";
import { Atmosphere } from "./environment/Atmosphere.ts";
import { EntityManager } from "./entities/EntityManager.ts";
import { EntityRenderer } from "./entities/EntityRenderer.ts";
import {
  TERRAIN_BASE_Y,
  TERRAIN_BLOCK_HEIGHT,
  TerrainMaterial,
} from "./geometry/terrainChunk.ts";
import {
  applyGameModeToBodyClass,
  loadGameSettingsFromLocalStorage,
  saveGameSettingsToLocalStorage,
  type GameSettings,
} from "./game/GameSettings.ts";
import { Inventory } from "./game/Inventory.ts";
import { PlayerStats } from "./game/PlayerStats.ts";
import { SurvivalStatsController } from "./game/SurvivalStatsController.ts";
import { SurvivalController } from "./game/SurvivalController.ts";
import {
  FirstPersonCamera,
  PLAYER_EYE_HEIGHT,
} from "./input/FirstPersonCamera.ts";
import { MobileControls } from "./input/MobileControls.ts";
import { WebGlRenderer } from "./render/WebGlRenderer.ts";
import { WebGpuRenderer } from "./render/WebGpuRenderer.ts";
import { WorldSaveManager } from "./save/WorldSaveManager.ts";
import {
  settingsFromMetadata,
  type LoadedWorldSave,
  type SerializedInventory,
  type WorldSaveMetadata,
} from "./save/WorldSaveTypes.ts";
import { DeathScreen } from "./ui/DeathScreen.ts";
import { DebugOverlay } from "./ui/DebugOverlay.ts";
import { MainMenu } from "./ui/MainMenu.ts";
import { SettingsMenu } from "./ui/SettingsMenu.ts";
import { SurvivalHud } from "./ui/SurvivalHud.ts";
import { applyUiStateToBodyClass } from "./ui/uiState.ts";
import { WorldCreationMenu } from "./ui/WorldCreationMenu.ts";
import { GameTime } from "./world/GameTime.ts";
import {
  biomeAt,
  InfiniteTerrain,
  type TerrainStreamUpdate,
  worldToAxial,
} from "./world/InfiniteTerrain.ts";

type Renderer = WebGpuRenderer | WebGlRenderer;

type ActiveGame = Readonly<{
  id: number;
  metadata: WorldSaveMetadata;
  settings: GameSettings;
  world: InfiniteTerrain;
  renderer: Renderer;
  camera: FirstPersonCamera;
  entityManager: EntityManager;
  entityRenderer: EntityRenderer;
  inventory: Inventory;
  gameTime: GameTime;
  survival: SurvivalController;
  survivalStats: SurvivalStatsController;
  survivalHud: SurvivalHud;
  atmosphere: Atmosphere;
  mobileControls: MobileControls | null;
  rendererBackend: "WebGPU" | "WebGL 2";
  latestTerrainUpdate: TerrainStreamUpdate;
  autosaveTimer: ReturnType<typeof window.setInterval>;
}>;

const initialCanvas = document.querySelector<HTMLCanvasElement>("#game");
const message = document.querySelector<HTMLParagraphElement>("#message");
const menuRoot = document.querySelector<HTMLElement>("#menu-root");
const modeStatus = document.querySelector<HTMLElement>("#mode-status");
const meshStatus = document.querySelector<HTMLElement>("#mesh-status");
const survivalHudRoot = document.querySelector<HTMLElement>("#survival-hud");
const debugOverlayRoot = document.querySelector<HTMLElement>("#debug-overlay");
const deathScreenRoot = document.querySelector<HTMLElement>("#death-screen");
const mobileControlsRoot =
  document.querySelector<HTMLElement>("#mobile-controls");

if (
  !initialCanvas ||
  !message ||
  !menuRoot ||
  !survivalHudRoot ||
  !debugOverlayRoot ||
  !deathScreenRoot
) {
  throw new Error(
    "The game canvas, status message, menu root, debug overlay, death screen, or survival HUD is missing.",
  );
}

let gameCanvas = initialCanvas;
let draftSettings = loadGameSettingsFromLocalStorage();
let activeGame: ActiveGame | null = null;
let gameSessionId = 0;
let saveQueue: Promise<void> = Promise.resolve();
let settingsReturnToPause = false;
const statusMessage = message;
const saveManager = new WorldSaveManager();
const audioManager = new AudioManager();
const debugOverlay = new DebugOverlay(debugOverlayRoot);
const deathScreen = new DeathScreen(deathScreenRoot);

audioManager.attachUserInteractionListeners(document);
audioManager.attachUiClickSounds(document);

function setMobileControlsVisibility(visible: boolean): void {
  document.body.classList.toggle("mobile-game", visible);
  if (mobileControlsRoot) {
    mobileControlsRoot.hidden = !visible;
  }
}

function applySettingsToBody(settings: GameSettings): void {
  document.body.classList.toggle("debug-overlay", settings.debugOverlay);
  debugOverlay.setVisible(settings.debugOverlay);
  applyGameModeToBodyClass(settings);
  setMobileControlsVisibility(settings.showMobileControls);
}

function hasSavedInventory(inventory: SerializedInventory): boolean {
  return (
    (inventory.slots !== undefined && inventory.slots.length > 0) ||
    (inventory.items !== undefined && inventory.items.length > 0)
  );
}

function formatMeshStats(mesh: TerrainStreamUpdate["mesh"]): string {
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

function isDesertHeavyArea(
  seed: number,
  position: readonly [number, number, number],
): boolean {
  const center = worldToAxial(position[0], position[2]);
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

function materialUnderPlayer(
  world: InfiniteTerrain,
  position: readonly [number, number, number],
): TerrainMaterial {
  const level = playerLevel(position);
  const { q, r } = worldToAxial(position[0], position[2]);

  return world.materialAt(q, r, level);
}

function playerLevel(position: readonly [number, number, number]): number {
  return Math.max(
    0,
    Math.floor(
      (position[1] - PLAYER_EYE_HEIGHT - 0.05 - TERRAIN_BASE_Y) /
        TERRAIN_BLOCK_HEIGHT,
    ),
  );
}

function toggleDebugOverlay(): void {
  const game = activeGame;
  const debugOverlayEnabled = !(
    game?.settings.debugOverlay ?? draftSettings.debugOverlay
  );

  if (game) {
    const settings: GameSettings = {
      ...game.settings,
      debugOverlay: debugOverlayEnabled,
    };

    activeGame = {
      ...game,
      settings,
    };
    draftSettings = settings;
    saveGameSettingsToLocalStorage(settings);
    applySettingsToBody(settings);
    if (meshStatus) {
      meshStatus.hidden = !debugOverlayEnabled;
      meshStatus.textContent = debugOverlayEnabled
        ? formatMeshStats(game.latestTerrainUpdate.mesh)
        : "";
    }
    return;
  }

  draftSettings = {
    ...draftSettings,
    debugOverlay: debugOverlayEnabled,
  };
  saveGameSettingsToLocalStorage(draftSettings);
  applySettingsToBody(draftSettings);
}

async function showMainMenu(messageText = ""): Promise<void> {
  applyUiStateToBodyClass({ screen: "main-menu", inGame: false });
  try {
    mainMenu.show(messageText, await saveManager.listWorlds());
  } catch (error) {
    console.error("Could not load saved worlds.", error);
    mainMenu.show("Saved worlds could not be loaded.");
  }
}

function showWorldCreationMenu(): void {
  applyUiStateToBodyClass({ screen: "world-creation", inGame: false });
  worldCreationMenu.show(draftSettings);
}

function showSettingsMenu(): void {
  settingsReturnToPause =
    activeGame !== null && document.body.classList.contains("pause-open");
  applyUiStateToBodyClass({ screen: "settings", inGame: activeGame !== null });
  settingsMenu.show(
    activeGame?.settings ?? draftSettings,
    audioManager.volumeSettings(),
  );
}

function returnFromSettings(messageText = ""): void {
  if (settingsReturnToPause && activeGame) {
    settingsReturnToPause = false;
    pauseGame();
    if (messageText) {
      statusMessage.textContent = messageText;
    }
    return;
  }

  settingsReturnToPause = false;
  void showMainMenu(messageText);
}

function pauseGame(): void {
  if (!activeGame) {
    return;
  }

  activeGame.camera.releaseInput();
  applyUiStateToBodyClass({ screen: "pause", inGame: true });
  mainMenu.showPause(activeGame.settings.worldName);
}

function resumeGame(): void {
  if (!activeGame) {
    showMainMenu();
    return;
  }

  mainMenu.hide();
  applyUiStateToBodyClass({ screen: "game", inGame: true });
  activeGame.camera.resumeInput();
}

function captureGameSavePayload(game: ActiveGame) {
  const [x, y, z] = game.camera.position();

  return {
    metadata: game.metadata,
    player: { position: [x, y, z] as const },
    inventory: game.inventory.exportState(),
    gameTime: game.gameTime.snapshot(),
    terrainEditChunks: game.world.exportTerrainEditChunks(),
  };
}

function saveActiveGame(): Promise<void> {
  const game = activeGame;

  if (!game) {
    return Promise.resolve();
  }

  const payload = captureGameSavePayload(game);

  saveQueue = saveQueue
    .catch(() => {
      // Keep later saves moving even if an earlier IndexedDB write failed.
    })
    .then(async () => {
      const metadata = await saveManager.saveWorld(payload);

      if (activeGame?.id === game.id) {
        activeGame = {
          ...activeGame,
          metadata,
          settings: settingsFromMetadata(metadata),
        };
      }
    })
    .catch((error) => {
      console.error("World save failed.", error);
    });

  return saveQueue;
}

function stopActiveGame(): void {
  if (!activeGame) {
    return;
  }

  void saveActiveGame();
  gameSessionId += 1;
  window.clearInterval(activeGame.autosaveTimer);
  activeGame.renderer.stop();
  activeGame.camera.stopInput();
  activeGame.inventory.destroy();
  activeGame.survival.destroy();
  activeGame.survivalHud.destroy();
  activeGame.mobileControls?.destroy();
  activeGame.atmosphere.destroy();
  debugOverlay.clear();
  deathScreen.hide();
  activeGame = null;
  delete statusMessage.dataset.streaming;
  if (meshStatus) {
    meshStatus.hidden = true;
    meshStatus.textContent = "";
  }
}

function backToMainMenu(): void {
  stopActiveGame();
  statusMessage.textContent = "Choose or create a world.";
  void showMainMenu("Returned to main menu.");
}

async function createRenderer(
  mesh: TerrainStreamUpdate["mesh"],
): Promise<Readonly<{ renderer: Renderer; backend: "WebGPU" | "WebGL 2" }>> {
  try {
    return {
      renderer: await WebGpuRenderer.create(gameCanvas, mesh),
      backend: "WebGPU",
    };
  } catch (webGpuError) {
    console.warn("WebGPU startup failed; using WebGL 2.", webGpuError);

    // A canvas cannot switch context type after one has been created.
    // Replace it so WebGL can still start if WebGPU failed mid-setup.
    const fallbackCanvas = gameCanvas.cloneNode(false) as HTMLCanvasElement;
    gameCanvas.replaceWith(fallbackCanvas);
    gameCanvas = fallbackCanvas;

    return {
      renderer: WebGlRenderer.create(fallbackCanvas, mesh),
      backend: "WebGL 2",
    };
  }
}

async function startWorld(save: LoadedWorldSave): Promise<void> {
  stopActiveGame();
  const settings = settingsFromMetadata(save.metadata);
  const savedPosition = save.runtime.player.position;
  const initialX = savedPosition?.[0] ?? 0;
  const initialZ = savedPosition?.[2] ?? 18;

  draftSettings = settings;
  saveGameSettingsToLocalStorage(settings);
  applySettingsToBody(settings);
  applyUiStateToBodyClass({ screen: "game", inGame: true });
  mainMenu.hide();
  statusMessage.textContent = "Generating world…";

  const sessionId = ++gameSessionId;

  try {
    const world = new InfiniteTerrain(
      settings.worldSeed,
      settings.chunkSize,
      settings.renderDistance,
    );
    world.importTerrainEditChunks(save.terrainEditChunks);

    const initialWorld = world.update({ x: initialX, z: initialZ });

    if (!initialWorld) {
      throw new Error("Could not generate the initial terrain window.");
    }

    const { renderer, backend } = await createRenderer(initialWorld.mesh);

    if (sessionId !== gameSessionId) {
      renderer.stop();
      return;
    }

    const camera = new FirstPersonCamera(
      gameCanvas,
      world,
      settings.showMobileControls,
      settings.gameMode,
    );
    camera.spawnAt(initialX, initialZ);
    if (savedPosition) {
      camera.setPosition(savedPosition);
    }
    camera.start();
    const entityManager = new EntityManager();
    const entityRenderer = new EntityRenderer();
    entityManager.ensurePassiveAnimal(
      world,
      camera.position(),
      settings.worldSeed,
    );
    renderer.updateEntityMesh(
      entityRenderer.buildMesh(entityManager.entities()),
    );
    const inventory = new Inventory(settings.gameMode, (isOpen) => {
      if (!isOpen && activeGame?.id === sessionId) {
        camera.resumeInput();
      }
    });
    if (hasSavedInventory(save.runtime.inventory)) {
      inventory.importState(save.runtime.inventory);
    }
    const gameTime = GameTime.fromSerialized(save.runtime.gameTime);
    const atmosphere = new Atmosphere({
      enableWeather: settings.enableWeather,
      enableDayNightCycle: settings.enableDayNightCycle,
      gameTime,
      weatherSeed: settings.worldSeed,
      allowManualWeatherCycle:
        settings.gameMode === "creative" || settings.debugOverlay,
      allowManualTimeCycle:
        settings.gameMode === "creative" || settings.debugOverlay,
      enableSandstorms: settings.debugOverlay,
      isSandstormAllowed: () =>
        isDesertHeavyArea(settings.worldSeed, camera.position()),
    });
    const showWorldStatus = (update: TerrainStreamUpdate): void => {
      const currentSettings = activeGame?.settings ?? settings;
      const modeLabel =
        currentSettings.gameMode === "creative" ? "Creative test" : "Survival";
      if (modeStatus) {
        modeStatus.textContent = modeLabel;
      }
      statusMessage.textContent =
        `${settings.worldName} · Infinite · ${update.loadedChunkCount} chunks · ` +
        `${update.mesh.biomeCount} biomes · ` +
        `${update.mesh.riverColumnCount} river cells · ` +
        `${update.mesh.mountainColumnCount} mountain cells · ` +
        `${update.mesh.caveAirCount.toLocaleString()} cave cells · ${backend}`;
      if (meshStatus) {
        meshStatus.hidden = !currentSettings.debugOverlay;
        meshStatus.textContent = currentSettings.debugOverlay
          ? formatMeshStats(update.mesh)
          : "";
      }
    };
    const applyWorldUpdate = (update: TerrainStreamUpdate): void => {
      if (activeGame?.id !== sessionId) {
        return;
      }
      activeGame = {
        ...activeGame,
        latestTerrainUpdate: update,
      };
      renderer.updateMesh(update.mesh);
      showWorldStatus(update);
    };
    let streamRequestId = 0;
    const survival = new SurvivalController(
      gameCanvas,
      world,
      camera,
      inventory,
      applyWorldUpdate,
      settings.gameMode,
      () => void saveActiveGame(),
      audioManager,
    );
    const playerStats = new PlayerStats();
    const survivalHud = new SurvivalHud(survivalHudRoot!, settings.gameMode);
    const survivalStats = new SurvivalStatsController({
      mode: settings.gameMode,
      stats: playerStats,
      onDeath: () => {
        deathScreen.show(settings.worldName);
        statusMessage.textContent = `${settings.worldName} · You died… respawning soon.`;
      },
      onRespawn: () => {
        deathScreen.hide();
        camera.spawnAt(initialX, initialZ);
        statusMessage.textContent = `${settings.worldName} · Respawned.`;
      },
    });
    survivalHud.update(playerStats.snapshot());
    const mobileControls = settings.showMobileControls
      ? new MobileControls(camera, survival, inventory, atmosphere)
      : null;
    const autosaveTimer = window.setInterval(() => {
      void saveActiveGame();
    }, 30_000);

    activeGame = {
      id: sessionId,
      metadata: save.metadata,
      settings,
      world,
      renderer,
      camera,
      entityManager,
      entityRenderer,
      inventory,
      gameTime,
      survival,
      survivalStats,
      survivalHud,
      atmosphere,
      mobileControls,
      rendererBackend: backend,
      latestTerrainUpdate: initialWorld,
      autosaveTimer,
    };
    showWorldStatus(initialWorld);
    renderer.start(
      camera,
      atmosphere,
      (deltaSeconds) => {
        if (activeGame?.id !== sessionId) {
          return;
        }

        const [x, , z] = camera.position();
        const update = world.requestUpdate({ x, z });

        if (update) {
          const requestId = ++streamRequestId;
          statusMessage.dataset.streaming = "true";
          if (!statusMessage.textContent?.endsWith(" · loading…")) {
            statusMessage.textContent += " · loading…";
          }
          void update
            .then((worldUpdate) => {
              if (
                activeGame?.id === sessionId &&
                requestId === streamRequestId &&
                worldUpdate
              ) {
                applyWorldUpdate(worldUpdate);
              }
            })
            .catch((error) => {
              console.error("Background terrain streaming failed.", error);
              if (activeGame?.id === sessionId) {
                statusMessage.textContent = "Terrain streaming failed.";
              }
            })
            .finally(() => {
              if (
                activeGame?.id === sessionId &&
                requestId === streamRequestId
              ) {
                delete statusMessage.dataset.streaming;
              }
            });
        }

        const waterUpdate = world.advanceWaterFlow(deltaSeconds);
        if (waterUpdate) {
          void waterUpdate
            .then((worldUpdate) => {
              if (activeGame?.id === sessionId && worldUpdate) {
                applyWorldUpdate(worldUpdate);
              }
            })
            .catch((error) => {
              console.error("Water flow remesh failed.", error);
            });
        }
        const cameraState = camera.state();
        const cameraPosition = camera.position();
        const fps = debugOverlay.recordFrame(deltaSeconds);

        survivalStats.update(deltaSeconds, cameraState);
        survivalHud.update(survivalStats.stats.snapshot());
        survival.update(deltaSeconds);
        audioManager.updatePlayerSteps(deltaSeconds, {
          position: cameraPosition,
          state: cameraState,
          material: materialUnderPlayer(world, cameraPosition),
        });
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

        if (activeGame?.settings.debugOverlay && debugOverlay.shouldRender()) {
          const axial = worldToAxial(cameraPosition[0], cameraPosition[2]);
          const latestTerrainUpdate = activeGame.latestTerrainUpdate;

          debugOverlay.update({
            fps,
            position: cameraPosition,
            axial,
            level: playerLevel(cameraPosition),
            biome: biomeAt(axial.q, axial.r, settings.worldSeed),
            loadedChunks: latestTerrainUpdate.loadedChunkCount,
            meshFaceCount: latestTerrainUpdate.mesh.emittedFaceCount,
            rendererBackend: activeGame.rendererBackend,
            gameMode: activeGame.settings.gameMode,
          });
        }
      },
      (reason) => {
        if (activeGame?.id === sessionId) {
          statusMessage.textContent = `Graphics device lost: ${reason}`;
        }
      },
    );
  } catch (error) {
    console.error(error);
    stopActiveGame();
    void showMainMenu(
      error instanceof Error ? error.message : "Renderer startup failed.",
    );
  }
}

async function createAndStartWorld(settings: GameSettings): Promise<void> {
  try {
    statusMessage.textContent = "Creating world…";
    await startWorld(await saveManager.createWorld(settings));
  } catch (error) {
    console.error("Could not create world.", error);
    void showMainMenu("Could not create the world.");
  }
}

async function loadSavedWorld(worldId: string): Promise<void> {
  try {
    statusMessage.textContent = "Loading world…";
    const save = await saveManager.loadWorld(worldId);

    if (!save) {
      void showMainMenu("World not found.");
      return;
    }

    await startWorld(save);
  } catch (error) {
    console.error("Could not load world.", error);
    void showMainMenu("Could not load the world.");
  }
}

async function deleteSavedWorld(worldId: string): Promise<void> {
  try {
    await saveManager.deleteWorld(worldId);
    await showMainMenu("World deleted.");
  } catch (error) {
    console.error("Could not delete world.", error);
    await showMainMenu("Could not delete the world.");
  }
}

async function renameSavedWorld(worldId: string, name: string): Promise<void> {
  try {
    const metadata = await saveManager.renameWorld(worldId, name);

    await showMainMenu(metadata ? "World renamed." : "World not found.");
  } catch (error) {
    console.error("Could not rename world.", error);
    await showMainMenu("Could not rename the world.");
  }
}

const mainMenu = new MainMenu(menuRoot, {
  createNewWorld: showWorldCreationMenu,
  openSettings: showSettingsMenu,
  loadWorld: (worldId) => void loadSavedWorld(worldId),
  deleteWorld: (worldId) => void deleteSavedWorld(worldId),
  renameWorld: (worldId, name) => void renameSavedWorld(worldId, name),
  resumeGame,
  backToMainMenu,
});
const worldCreationMenu = new WorldCreationMenu(menuRoot, {
  startWorld: (settings) => void createAndStartWorld(settings),
  back: () => void showMainMenu(),
});
const settingsMenu = new SettingsMenu(menuRoot, {
  save: (settings, audioVolumes) => {
    draftSettings = settings;
    saveGameSettingsToLocalStorage(settings);
    audioManager.setVolumeSettings(audioVolumes);
    audioManager.saveVolumeSettings();
    if (activeGame) {
      const runtimeSettings = {
        ...settings,
        showMobileControls: activeGame.settings.showMobileControls,
      };

      activeGame = {
        ...activeGame,
        settings: runtimeSettings,
      };
      applySettingsToBody(runtimeSettings);
    } else {
      applySettingsToBody(settings);
    }
    returnFromSettings("Settings saved.");
  },
  back: () => returnFromSettings(),
});

document.addEventListener("keydown", (event) => {
  if (event.code === "F3" && !event.repeat) {
    event.preventDefault();
    toggleDebugOverlay();
    return;
  }

  if (event.code !== "Escape" || event.repeat || !activeGame) {
    return;
  }

  event.preventDefault();
  pauseGame();
});

document.addEventListener("pointerlockchange", () => {
  if (
    activeGame &&
    document.pointerLockElement === null &&
    document.body.classList.contains("in-game") &&
    !document.body.classList.contains("menu-open") &&
    !document.body.classList.contains("inventory-open")
  ) {
    pauseGame();
  }
});

window.addEventListener("pagehide", () => {
  void saveActiveGame();
});

window.addEventListener("beforeunload", () => {
  void saveActiveGame();
});

applySettingsToBody(draftSettings);
statusMessage.textContent = "Choose or create a world.";
void showMainMenu();
