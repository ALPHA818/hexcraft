import "./style.css";
import { AudioManager } from "./audio/AudioManager.ts";
import { Atmosphere } from "./environment/Atmosphere.ts";
import { EntityManager } from "./entities/EntityManager.ts";
import { EntityRenderer } from "./entities/EntityRenderer.ts";
import {
  applyGameModeToBodyClass,
  loadGameSettingsFromLocalStorage,
  saveGameSettingsToLocalStorage,
  type GameSettings,
} from "./game/GameSettings.ts";
import { createRenderer, readGameDom } from "./game/GameBootstrap.ts";
import {
  formatMeshStats,
  isDesertHeavyArea,
  nowMilliseconds,
  recordPerformanceRenderStats,
  startGameLoop,
} from "./game/GameLoop.ts";
import { Inventory } from "./game/Inventory.ts";
import { createMaterialHazardState } from "./game/MaterialHazards.ts";
import {
  captureGameSavePayload,
  hasSavedInventory,
  type ActiveGame,
} from "./game/GameSession.ts";
import { MaterialStorage } from "./game/MaterialStorage.ts";
import { PlayerStats } from "./game/PlayerStats.ts";
import { SurvivalStatsController } from "./game/SurvivalStatsController.ts";
import { SurvivalController } from "./game/SurvivalController.ts";
import {
  canUseMaterialTestingKit,
  MaterialTestingKit,
  type MaterialGiveResult,
} from "./game/MaterialTestingKit.ts";
import { FirstPersonCamera } from "./input/FirstPersonCamera.ts";
import { MobileControls } from "./input/MobileControls.ts";
import { MaterialWorldController } from "./game/MaterialWorldController.ts";
import { PerformanceMonitor } from "./performance/PerformanceMonitor.ts";
import { WorldSaveManager } from "./save/WorldSaveManager.ts";
import {
  settingsFromMetadata,
  type LoadedWorldSave,
} from "./save/WorldSaveTypes.ts";
import { DeathScreen } from "./ui/DeathScreen.ts";
import { DebugOverlay } from "./ui/DebugOverlay.ts";
import { MainMenu } from "./ui/MainMenu.ts";
import { MaterialCombinerPanel } from "./ui/MaterialCombinerPanel.ts";
import { MaterialCodexPanel } from "./ui/MaterialCodexPanel.ts";
import { MaterialResearchPanel } from "./ui/MaterialResearchPanel.ts";
import { MaterialStoragePanel } from "./ui/MaterialStoragePanel.ts";
import { SettingsMenu } from "./ui/SettingsMenu.ts";
import { SurvivalHud } from "./ui/SurvivalHud.ts";
import { applyUiStateToBodyClass } from "./ui/uiState.ts";
import { WorldCreationMenu } from "./ui/WorldCreationMenu.ts";
import { GameTime } from "./world/GameTime.ts";
import {
  InfiniteTerrain,
  type TerrainStreamUpdate,
} from "./world/InfiniteTerrain.ts";

const {
  initialCanvas,
  message,
  menuRoot,
  modeStatus,
  meshStatus,
  survivalHudRoot,
  debugOverlayRoot,
  materialCodexRoot,
  materialCombinerRoot,
  materialResearchRoot,
  materialStorageRoot,
  deathScreenRoot,
  mobileControlsRoot,
} = readGameDom();

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
function shouldResumeGameInput(): boolean {
  return (
    document.body.classList.contains("in-game") &&
    !document.body.classList.contains("menu-open") &&
    !document.body.classList.contains("inventory-open") &&
    !document.body.classList.contains("material-codex-open") &&
    !document.body.classList.contains("material-combiner-open") &&
    !document.body.classList.contains("material-research-open") &&
    !document.body.classList.contains("material-storage-open")
  );
}

const materialCodexPanel = new MaterialCodexPanel(
  materialCodexRoot,
  null,
  (isOpen) => {
    const game = activeGame;

    if (!game) {
      return;
    }

    if (isOpen) {
      game.camera.releaseInput();
      return;
    }

    if (shouldResumeGameInput()) {
      game.camera.resumeInput();
    }
  },
);
const materialCombinerPanel = new MaterialCombinerPanel(
  materialCombinerRoot,
  null,
  (isOpen) => {
    const game = activeGame;

    if (!game) {
      return;
    }

    if (isOpen) {
      game.camera.releaseInput();
      return;
    }

    if (shouldResumeGameInput()) {
      game.camera.resumeInput();
    }
  },
);
const materialResearchPanel = new MaterialResearchPanel(
  materialResearchRoot,
  null,
  (isOpen) => {
    const game = activeGame;

    if (!game) {
      return;
    }

    if (isOpen) {
      game.camera.releaseInput();
      return;
    }

    if (shouldResumeGameInput()) {
      game.camera.resumeInput();
    }
  },
);
const materialStoragePanel = new MaterialStoragePanel(
  materialStorageRoot,
  null,
  (isOpen) => {
    const game = activeGame;

    if (!game) {
      return;
    }

    if (isOpen) {
      game.camera.releaseInput();
      return;
    }

    if (shouldResumeGameInput()) {
      game.camera.resumeInput();
    }
  },
);
const deathScreen = new DeathScreen(deathScreenRoot);

function giveMaterial(materialId: string, count = 1): MaterialGiveResult {
  const kit = activeGame?.materialTestingKit;

  if (!kit) {
    return {
      ok: false,
      material: null,
      itemId: null,
      count,
      message: "No active world.",
    };
  }

  return kit.giveMaterial(materialId, count);
}

(
  globalThis as typeof globalThis & { giveMaterial: typeof giveMaterial }
).giveMaterial = giveMaterial;

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
    materialCodexPanel.refresh();
    materialResearchPanel.refresh();
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

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function toggleMaterialCodex(): void {
  if (!activeGame) {
    return;
  }

  if (materialCodexPanel.isOpen()) {
    materialCodexPanel.hide();
    return;
  }

  if (
    document.body.classList.contains("menu-open") ||
    document.body.classList.contains("inventory-open") ||
    materialCombinerPanel.isOpen() ||
    materialResearchPanel.isOpen() ||
    materialStoragePanel.isOpen()
  ) {
    return;
  }

  materialCodexPanel.show();
}

function toggleMaterialResearch(): void {
  if (!activeGame) {
    return;
  }

  if (materialResearchPanel.isOpen()) {
    materialResearchPanel.hide();
    return;
  }

  if (
    document.body.classList.contains("menu-open") ||
    document.body.classList.contains("inventory-open") ||
    materialCodexPanel.isOpen() ||
    materialCombinerPanel.isOpen() ||
    materialStoragePanel.isOpen()
  ) {
    return;
  }

  materialResearchPanel.show();
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
  materialCodexPanel.hide();
  materialCodexPanel.setRegistry(null);
  materialCodexPanel.setMaterialStorage(null);
  materialCodexPanel.setDebugActions(null);
  materialCombinerPanel.hide();
  materialCombinerPanel.setSession(null);
  materialResearchPanel.hide();
  materialResearchPanel.setSession(null);
  materialStoragePanel.hide();
  materialStoragePanel.setSession(null);
  activeGame.performanceMonitor.reset();
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
    const performanceMonitor = new PerformanceMonitor();
    const materialWorld = new MaterialWorldController({
      materialCodex: save.runtime.materialCodex,
      mode: settings.gameMode,
    });
    const materialStorage = new MaterialStorage(save.runtime.materialStorage);
    const materialRegistry = materialWorld.registry;
    const world = new InfiniteTerrain(
      settings.worldSeed,
      settings.chunkSize,
      settings.renderDistance,
      materialRegistry,
    );
    world.importTerrainEditChunks(save.terrainEditChunks);

    const initialTerrainStart = nowMilliseconds();
    const initialWorld = world.update({ x: initialX, z: initialZ });
    performanceMonitor.recordTerrainUpdateTime(
      nowMilliseconds() - initialTerrainStart,
    );

    if (!initialWorld) {
      throw new Error("Could not generate the initial terrain window.");
    }

    const rendererStartup = await createRenderer(gameCanvas, initialWorld.mesh);
    gameCanvas = rendererStartup.canvas;
    const { renderer, backend } = rendererStartup;
    recordPerformanceRenderStats(performanceMonitor, backend, initialWorld);

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
    materialCodexPanel.setRegistry(materialRegistry);
    materialCodexPanel.setMaterialStorage(materialStorage);
    materialStoragePanel.setSession({
      storage: materialStorage,
      registry: materialRegistry,
    });
    const inventory = new Inventory(
      settings.gameMode,
      (isOpen) => {
        if (
          !isOpen &&
          activeGame?.id === sessionId &&
          shouldResumeGameInput()
        ) {
          camera.resumeInput();
        }
      },
      materialRegistry,
      () => materialCombinerPanel.show(),
      materialStorage,
      () => {
        materialCodexPanel.refresh();
        materialStoragePanel.refresh();
        void saveActiveGame();
      },
      () => {
        if (materialCodexPanel.isOpen()) {
          materialCodexPanel.hide();
        }
        if (materialCombinerPanel.isOpen()) {
          materialCombinerPanel.hide();
        }
        if (materialResearchPanel.isOpen()) {
          materialResearchPanel.hide();
        }
        if (materialStoragePanel.isOpen()) {
          materialStoragePanel.hide();
        }
        if (document.body.classList.contains("inventory-open")) {
          inventory.toggle();
        }
        materialStoragePanel.show();
      },
    );
    materialCombinerPanel.setSession({
      materialWorld,
      inventory,
      onMaterialDiscovered: () => materialCodexPanel.refresh(),
      onSaveRequested: () => void saveActiveGame(),
    });
    materialResearchPanel.setSession({
      materialWorld,
      canDebugUnlock: () => {
        const currentSettings =
          activeGame?.id === sessionId ? activeGame.settings : settings;

        return canUseMaterialTestingKit(
          currentSettings.gameMode,
          currentSettings.debugOverlay,
        );
      },
      onResearchChanged: () => {
        materialCodexPanel.refresh();
        materialCombinerPanel.refresh();
      },
      onSaveRequested: () => void saveActiveGame(),
    });
    const materialTestingKit = new MaterialTestingKit({
      materialWorld,
      inventory,
      onMaterialDiscovered: () => materialCodexPanel.refresh(),
      onSaveRequested: () => void saveActiveGame(),
    });
    materialCodexPanel.setDebugActions({
      isVisible: () => {
        const currentSettings =
          activeGame?.id === sessionId ? activeGame.settings : settings;

        return canUseMaterialTestingKit(
          currentSettings.gameMode,
          currentSettings.debugOverlay,
        );
      },
      giveMaterial: (materialId, count) =>
        materialTestingKit.giveMaterial(materialId, count),
      giveCommonStarterElements: (count) =>
        materialTestingKit.giveCommonStarterElements(count),
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
      const game = activeGame;

      if (game?.id !== sessionId) {
        return;
      }
      const monitor = game.performanceMonitor;
      const meshUpdateStart = nowMilliseconds();

      renderer.updateMesh(update.mesh);
      monitor.recordMeshUpdateTime(nowMilliseconds() - meshUpdateStart);
      recordPerformanceRenderStats(monitor, backend, update);
      activeGame = {
        ...game,
        latestTerrainUpdate: update,
      };
      showWorldStatus(update);
    };
    const survival = new SurvivalController(
      gameCanvas,
      world,
      camera,
      inventory,
      applyWorldUpdate,
      settings.gameMode,
      () => void saveActiveGame(),
      audioManager,
      materialWorld,
      () => {
        materialCodexPanel.refresh();
        void saveActiveGame();
      },
      (stationType) => {
        if (materialCodexPanel.isOpen()) {
          materialCodexPanel.hide();
        }
        if (materialResearchPanel.isOpen()) {
          materialResearchPanel.hide();
        }
        if (document.body.classList.contains("inventory-open")) {
          inventory.toggle();
        }
        materialCombinerPanel.show(stationType, true);
      },
      settings.worldSeed,
    );
    const playerStats = new PlayerStats();
    const survivalHud = new SurvivalHud(survivalHudRoot!, settings.gameMode);
    const materialHazardState = createMaterialHazardState();
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
      materialWorld,
      materialTestingKit,
      materialHazardState,
      materialStorage,
      gameTime,
      survival,
      survivalStats,
      survivalHud,
      atmosphere,
      mobileControls,
      performanceMonitor,
      rendererBackend: backend,
      latestTerrainUpdate: initialWorld,
      autosaveTimer,
    };
    showWorldStatus(initialWorld);
    startGameLoop({
      sessionId,
      getActiveGame: () => activeGame,
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
      onDeviceLost: (reason) => {
        if (activeGame?.id === sessionId) {
          statusMessage.textContent = `Graphics device lost: ${reason}`;
        }
      },
    });
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
      materialCodexPanel.refresh();
      materialResearchPanel.refresh();
    } else {
      applySettingsToBody(settings);
      materialCodexPanel.refresh();
      materialResearchPanel.refresh();
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

  if (
    event.code === "KeyM" &&
    !event.repeat &&
    activeGame &&
    !isEditableTarget(event.target)
  ) {
    event.preventDefault();
    toggleMaterialCodex();
    return;
  }

  if (
    event.code === "KeyR" &&
    !event.repeat &&
    activeGame &&
    !isEditableTarget(event.target)
  ) {
    event.preventDefault();
    toggleMaterialResearch();
    return;
  }

  if (event.code !== "Escape" || event.repeat || !activeGame) {
    return;
  }

  event.preventDefault();
  if (materialCodexPanel.isOpen()) {
    materialCodexPanel.hide();
    return;
  }
  if (materialCombinerPanel.isOpen()) {
    materialCombinerPanel.hide();
    return;
  }
  if (materialResearchPanel.isOpen()) {
    materialResearchPanel.hide();
    return;
  }
  if (materialStoragePanel.isOpen()) {
    materialStoragePanel.hide();
    return;
  }
  pauseGame();
});

document.addEventListener("pointerlockchange", () => {
  if (
    activeGame &&
    document.pointerLockElement === null &&
    document.body.classList.contains("in-game") &&
    !document.body.classList.contains("menu-open") &&
    !document.body.classList.contains("inventory-open") &&
    !document.body.classList.contains("material-codex-open") &&
    !document.body.classList.contains("material-combiner-open") &&
    !document.body.classList.contains("material-research-open") &&
    !document.body.classList.contains("material-storage-open")
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
