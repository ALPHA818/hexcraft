import type { AudioManager } from "../audio/AudioManager.ts";
import { Atmosphere } from "../environment/Atmosphere.ts";
import { EntityManager } from "../entities/EntityManager.ts";
import { EntityRenderer } from "../entities/EntityRenderer.ts";
import { FirstPersonCamera } from "../input/FirstPersonCamera.ts";
import { MobileControls } from "../input/MobileControls.ts";
import { PerformanceMonitor } from "../performance/PerformanceMonitor.ts";
import type { LoadedWorldSave } from "../save/WorldSaveTypes.ts";
import { settingsFromMetadata } from "../save/WorldSaveTypes.ts";
import type { DeathScreen } from "../ui/DeathScreen.ts";
import type { DebugOverlay } from "../ui/DebugOverlay.ts";
import { ObjectiveTracker } from "../ui/ObjectiveTracker.ts";
import { SurvivalHud } from "../ui/SurvivalHud.ts";
import { GameTime } from "../world/GameTime.ts";
import {
  InfiniteTerrain,
  type TerrainStreamUpdate,
} from "../world/InfiniteTerrain.ts";
import { createRenderer } from "./GameBootstrap.ts";
import type { GamePanelWiring } from "./GamePanelWiring.ts";
import type { GameSaveCoordinator } from "./GameSaveCoordinator.ts";
import { hasSavedInventory, type ActiveGame } from "./GameSession.ts";
import {
  formatMeshStats,
  isDesertHeavyArea,
  nowMilliseconds,
  recordPerformanceRenderStats,
  startGameLoop,
} from "./GameLoop.ts";
import { Inventory } from "./Inventory.ts";
import { createMaterialHazardState } from "./MaterialHazards.ts";
import { Equipment } from "./Equipment.ts";
import { MaterialStorage } from "./MaterialStorage.ts";
import { MaterialTestingKit } from "./MaterialTestingKit.ts";
import { MaterialWorldController } from "./MaterialWorldController.ts";
import { PlayerStats } from "./PlayerStats.ts";
import { ProgressionController } from "./ProgressionController.ts";
import { SurvivalController } from "./SurvivalController.ts";
import { SurvivalStatsController } from "./SurvivalStatsController.ts";
import { WorkbenchController } from "./WorkbenchController.ts";

export type GameSessionFactoryOptions = Readonly<{
  save: LoadedWorldSave;
  sessionId: number;
  canvas: HTMLCanvasElement;
  audioManager: AudioManager;
  panels: GamePanelWiring;
  saveCoordinator: GameSaveCoordinator;
  statusMessage: HTMLElement;
  modeStatus: HTMLElement | null;
  meshStatus: HTMLElement | null;
  survivalHudRoot: HTMLElement;
  objectiveTrackerRoot: HTMLElement;
  debugOverlay: DebugOverlay;
  deathScreen: DeathScreen;
  getActiveGame: () => ActiveGame | null;
  setActiveGame: (game: ActiveGame) => void;
  isSessionCurrent: () => boolean;
  onCanvasChanged: (canvas: HTMLCanvasElement) => void;
}>;

export type GameSessionFactoryResult = Readonly<{
  game: ActiveGame;
  canvas: HTMLCanvasElement;
}>;

export async function createGameSession(
  options: GameSessionFactoryOptions,
): Promise<GameSessionFactoryResult | null> {
  const {
    save,
    sessionId,
    audioManager,
    panels,
    saveCoordinator,
    statusMessage,
    modeStatus,
    meshStatus,
    survivalHudRoot,
    objectiveTrackerRoot,
    debugOverlay,
    deathScreen,
    getActiveGame,
    setActiveGame,
    isSessionCurrent,
    onCanvasChanged,
  } = options;
  const settings = settingsFromMetadata(save.metadata);
  const savedPosition = save.runtime.player.position;
  const initialX = savedPosition?.[0] ?? 0;
  const initialZ = savedPosition?.[2] ?? 18;
  const performanceMonitor = new PerformanceMonitor();
  const materialWorld = new MaterialWorldController({
    materialCodex: save.runtime.materialCodex,
    mode: settings.gameMode,
  });
  const materialStorage = new MaterialStorage(save.runtime.materialStorage);
  const materialRegistry = materialWorld.registry;
  const equipment = new Equipment(save.runtime.equipment, materialRegistry);
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

  const rendererStartup = await createRenderer(
    options.canvas,
    initialWorld.mesh,
  );
  const { renderer, backend, canvas } = rendererStartup;

  onCanvasChanged(canvas);
  recordPerformanceRenderStats(performanceMonitor, backend, initialWorld);

  if (!isSessionCurrent()) {
    renderer.stop();
    return null;
  }

  const camera = new FirstPersonCamera(
    canvas,
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
  renderer.updateEntityMesh(entityRenderer.buildMesh(entityManager.entities()));

  const saveActiveGame = (): Promise<void> => saveCoordinator.saveActiveGame();
  const objectiveTracker = new ObjectiveTracker(objectiveTrackerRoot);
  const progression = new ProgressionController({
    mode: settings.gameMode,
    state: save.runtime.progression,
    onChange: () => {
      objectiveTracker.refresh();
      void saveActiveGame();
    },
  });

  objectiveTracker.setController(progression);
  const inventory = new Inventory(
    settings.gameMode,
    (isOpen) => panels.notifyInventoryOpenChange(isOpen),
    materialRegistry,
    materialStorage,
    () => {
      panels.refreshMaterialInventoryPanels();
      void saveActiveGame();
    },
    () => panels.openMaterialStorage(),
    () => panels.openCreativeCatalog(),
    () => panels.openEquipment(),
    (itemId, amount) => {
      progression.recordItemCollected(itemId, amount);
    },
    (materialId, quantity) => {
      progression.recordGeneratedMaterialStored(materialId, quantity);
    },
  );

  const workbenchController = new WorkbenchController({
    inventory,
    materialWorld,
    onCrafted: (recipe) => {
      progression.recordRecipeCrafted(recipe);
    },
    onSaveRequested: () => void saveActiveGame(),
    openElementCombiner: () => panels.openMaterialCombiner("combiner", true),
  });
  const materialTestingKit = new MaterialTestingKit({
    materialWorld,
    inventory,
    onMaterialDiscovered: () => panels.materialCodexPanel.refresh(),
    onSaveRequested: () => void saveActiveGame(),
  });

  panels.wireSession({
    sessionId,
    settings,
    materialWorld,
    materialStorage,
    inventory,
    equipment,
    progression,
    workbenchController,
    materialTestingKit,
    saveActiveGame,
    getActiveGame,
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
    const currentSettings = getActiveGame()?.settings ?? settings;
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
    const game = getActiveGame();

    if (game?.id !== sessionId) {
      return;
    }

    const meshUpdateStart = nowMilliseconds();

    renderer.updateMesh(update.mesh);
    game.performanceMonitor.recordMeshUpdateTime(
      nowMilliseconds() - meshUpdateStart,
    );
    recordPerformanceRenderStats(game.performanceMonitor, backend, update);
    setActiveGame({
      ...game,
      latestTerrainUpdate: update,
    });
    showWorldStatus(update);
  };
  const survival = new SurvivalController(
    canvas,
    world,
    camera,
    inventory,
    applyWorldUpdate,
    settings.gameMode,
    () => void saveActiveGame(),
    audioManager,
    materialWorld,
    () => {
      panels.materialCodexPanel.refresh();
      void saveActiveGame();
    },
    (stationType) => panels.openMaterialCombiner(stationType, true),
    (workbenchType) => panels.openWorkbench(workbenchType, true),
    settings.worldSeed,
    undefined,
    (materialId) => {
      progression.recordMaterialDiscovered(materialId);
    },
  );
  const playerStats = new PlayerStats();
  const survivalHud = new SurvivalHud(survivalHudRoot, settings.gameMode);
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
  const autosaveTimer = saveCoordinator.startAutosave();
  const game: ActiveGame = {
    id: sessionId,
    metadata: save.metadata,
    settings,
    world,
    renderer,
    camera,
    entityManager,
    entityRenderer,
    inventory,
    equipment,
    workbenchController,
    materialWorld,
    materialTestingKit,
    materialHazardState,
    materialStorage,
    progression,
    objectiveTracker,
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

  setActiveGame(game);
  showWorldStatus(initialWorld);
  startGameLoop({
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
    onDeviceLost: (reason) => {
      if (getActiveGame()?.id === sessionId) {
        statusMessage.textContent = `Graphics device lost: ${reason}`;
      }
    },
  });

  return {
    game,
    canvas,
  };
}
