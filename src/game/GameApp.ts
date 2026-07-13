import { AudioManager } from "../audio/AudioManager.ts";
import { WorldSaveManager } from "../save/WorldSaveManager.ts";
import {
  settingsFromMetadata,
  type LoadedWorldSave,
} from "../save/WorldSaveTypes.ts";
import { DeathScreen } from "../ui/DeathScreen.ts";
import { DebugOverlay } from "../ui/DebugOverlay.ts";
import { MainMenu } from "../ui/MainMenu.ts";
import { PanelManager } from "../ui/PanelManager.ts";
import { SettingsMenu } from "../ui/SettingsMenu.ts";
import { applyUiStateToBodyClass } from "../ui/uiState.ts";
import { canOpenWorkbenchTestingPanel } from "../ui/WorkbenchPanel.ts";
import { WorldCreationMenu } from "../ui/WorldCreationMenu.ts";
import {
  applyGameModeToBodyClass,
  loadGameSettingsFromLocalStorage,
  saveGameSettingsToLocalStorage,
  type GameSettings,
} from "./GameSettings.ts";
import { readGameDom, type GameDomElements } from "./GameBootstrap.ts";
import { formatMeshStats } from "./GameLoop.ts";
import { GamePanelWiring } from "./GamePanelWiring.ts";
import { GameRuntimeEvents } from "./GameRuntimeEvents.ts";
import { GameSaveCoordinator } from "./GameSaveCoordinator.ts";
import { createGameSession } from "./GameSessionFactory.ts";
import type { ActiveGame } from "./GameSession.ts";
import type { MaterialGiveResult } from "./MaterialTestingKit.ts";

export class GameApp {
  readonly #dom: GameDomElements;
  readonly #saveManager = new WorldSaveManager();
  readonly #audioManager = new AudioManager();
  readonly #debugOverlay: DebugOverlay;
  readonly #panelManager: PanelManager;
  readonly #panels: GamePanelWiring;
  readonly #deathScreen: DeathScreen;
  readonly #saveCoordinator: GameSaveCoordinator;
  readonly #mainMenu: MainMenu;
  readonly #worldCreationMenu: WorldCreationMenu;
  readonly #settingsMenu: SettingsMenu;

  #gameCanvas: HTMLCanvasElement;
  #draftSettings = loadGameSettingsFromLocalStorage();
  #activeGame: ActiveGame | null = null;
  #gameSessionId = 0;
  #settingsReturnToPause = false;

  constructor() {
    this.#dom = readGameDom();
    this.#gameCanvas = this.#dom.initialCanvas;
    this.#debugOverlay = new DebugOverlay(this.#dom.debugOverlayRoot);
    this.#deathScreen = new DeathScreen(this.#dom.deathScreenRoot);
    this.#panelManager = new PanelManager({
      isGameActive: () =>
        this.#activeGame !== null &&
        document.body.classList.contains("in-game") &&
        !document.body.classList.contains("menu-open"),
      releaseInput: () => this.#activeGame?.camera.releaseInput(),
      resumeInput: () => this.#activeGame?.camera.resumeInput(),
    });
    this.#panels = new GamePanelWiring({
      roots: {
        materialCodexRoot: this.#dom.materialCodexRoot,
        materialCombinerRoot: this.#dom.materialCombinerRoot,
        materialResearchRoot: this.#dom.materialResearchRoot,
        materialStorageRoot: this.#dom.materialStorageRoot,
        equipmentRoot: this.#dom.equipmentRoot,
        creativeCatalogRoot: this.#dom.creativeCatalogRoot,
        workbenchRoot: this.#dom.workbenchRoot,
      },
      panelManager: this.#panelManager,
      getActiveGame: () => this.#activeGame,
    });
    this.#saveCoordinator = new GameSaveCoordinator({
      saveManager: this.#saveManager,
      getActiveGame: () => this.#activeGame,
      setActiveGame: (game) => {
        this.#activeGame = game;
      },
    });
    this.#mainMenu = new MainMenu(this.#dom.menuRoot, {
      createNewWorld: () => this.#showWorldCreationMenu(),
      openSettings: () => this.#showSettingsMenu(),
      loadWorld: (worldId) => void this.#loadSavedWorld(worldId),
      deleteWorld: (worldId) => void this.#deleteSavedWorld(worldId),
      renameWorld: (worldId, name) =>
        void this.#renameSavedWorld(worldId, name),
      resumeGame: () => this.#resumeGame(),
      backToMainMenu: () => this.#backToMainMenu(),
    });
    this.#worldCreationMenu = new WorldCreationMenu(this.#dom.menuRoot, {
      startWorld: (settings) => void this.#createAndStartWorld(settings),
      back: () => void this.#showMainMenu(),
    });
    this.#settingsMenu = new SettingsMenu(this.#dom.menuRoot, {
      save: (settings, audioVolumes) => {
        this.#draftSettings = settings;
        saveGameSettingsToLocalStorage(settings);
        this.#audioManager.setVolumeSettings(audioVolumes);
        this.#audioManager.saveVolumeSettings();
        if (this.#activeGame) {
          const runtimeSettings = {
            ...settings,
            showMobileControls: this.#activeGame.settings.showMobileControls,
          };

          this.#activeGame = {
            ...this.#activeGame,
            settings: runtimeSettings,
          };
          this.#applySettingsToBody(runtimeSettings);
          this.#panels.refreshMaterialPanels();
        } else {
          this.#applySettingsToBody(settings);
          this.#panels.refreshMaterialPanels();
        }
        this.#returnFromSettings("Settings saved.");
      },
      back: () => this.#returnFromSettings(),
    });
  }

  start(): void {
    this.#installDebugGlobals();
    this.#audioManager.attachUserInteractionListeners(document);
    this.#audioManager.attachUiClickSounds(document);
    this.#saveCoordinator.attachPageLifecycleEvents();
    new GameRuntimeEvents({
      panelManager: this.#panelManager,
      getActiveGame: () => this.#activeGame,
      toggleDebugOverlay: () => this.#toggleDebugOverlay(),
      toggleMaterialCodex: () => this.#toggleMaterialCodex(),
      toggleMaterialResearch: () => this.#toggleMaterialResearch(),
      toggleBasicWorkbench: () => this.#toggleBasicWorkbench(),
      pauseGame: () => this.#pauseGame(),
    }).attach();
    this.#applySettingsToBody(this.#draftSettings);
    this.#dom.message.textContent = "Choose or create a world.";
    void this.#showMainMenu();
  }

  #installDebugGlobals(): void {
    (
      globalThis as typeof globalThis & {
        giveMaterial: (
          materialId: string,
          count?: number,
        ) => MaterialGiveResult;
      }
    ).giveMaterial = (materialId, count = 1) =>
      this.#giveMaterial(materialId, count);
  }

  #giveMaterial(materialId: string, count = 1): MaterialGiveResult {
    const kit = this.#activeGame?.materialTestingKit;

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

  #setMobileControlsVisibility(visible: boolean): void {
    document.body.classList.toggle("mobile-game", visible);
    if (this.#dom.mobileControlsRoot) {
      this.#dom.mobileControlsRoot.hidden = !visible;
    }
  }

  #applySettingsToBody(settings: GameSettings): void {
    document.body.classList.toggle("debug-overlay", settings.debugOverlay);
    this.#debugOverlay.setVisible(settings.debugOverlay);
    applyGameModeToBodyClass(settings);
    this.#setMobileControlsVisibility(settings.showMobileControls);
  }

  #toggleDebugOverlay(): void {
    const game = this.#activeGame;
    const debugOverlayEnabled = !(
      game?.settings.debugOverlay ?? this.#draftSettings.debugOverlay
    );

    if (game) {
      const settings: GameSettings = {
        ...game.settings,
        debugOverlay: debugOverlayEnabled,
      };

      this.#activeGame = {
        ...game,
        settings,
      };
      this.#draftSettings = settings;
      saveGameSettingsToLocalStorage(settings);
      this.#applySettingsToBody(settings);
      this.#panels.refreshMaterialPanels();
      if (this.#dom.meshStatus) {
        this.#dom.meshStatus.hidden = !debugOverlayEnabled;
        this.#dom.meshStatus.textContent = debugOverlayEnabled
          ? formatMeshStats(game.latestTerrainUpdate.mesh)
          : "";
      }
      return;
    }

    this.#draftSettings = {
      ...this.#draftSettings,
      debugOverlay: debugOverlayEnabled,
    };
    saveGameSettingsToLocalStorage(this.#draftSettings);
    this.#applySettingsToBody(this.#draftSettings);
  }

  #toggleMaterialCodex(): void {
    if (!this.#activeGame) {
      return;
    }

    if (this.#panels.materialCodexPanel.isOpen()) {
      this.#panels.materialCodexPanel.hide();
      return;
    }

    if (document.body.classList.contains("menu-open")) {
      return;
    }

    this.#panelManager.openPanel("material-codex", () =>
      this.#panels.materialCodexPanel.show(),
    );
  }

  #toggleMaterialResearch(): void {
    if (!this.#activeGame) {
      return;
    }

    if (this.#panels.materialResearchPanel.isOpen()) {
      this.#panels.materialResearchPanel.hide();
      return;
    }

    if (document.body.classList.contains("menu-open")) {
      return;
    }

    this.#panelManager.openPanel("material-research", () =>
      this.#panels.materialResearchPanel.show(),
    );
  }

  #toggleBasicWorkbench(): void {
    const game = this.#activeGame;

    if (
      !game ||
      !canOpenWorkbenchTestingPanel(
        game.settings.gameMode,
        game.settings.debugOverlay,
      )
    ) {
      return;
    }

    if (this.#panels.workbenchPanel.isOpen()) {
      this.#panels.workbenchPanel.hide();
      return;
    }

    if (document.body.classList.contains("menu-open")) {
      return;
    }

    this.#panels.openWorkbench("basic", false);
  }

  async #showMainMenu(messageText = ""): Promise<void> {
    applyUiStateToBodyClass({ screen: "main-menu", inGame: false });
    try {
      this.#mainMenu.show(messageText, await this.#saveManager.listWorlds());
    } catch (error) {
      console.error("Could not load saved worlds.", error);
      this.#mainMenu.show("Saved worlds could not be loaded.");
    }
  }

  #showWorldCreationMenu(): void {
    applyUiStateToBodyClass({ screen: "world-creation", inGame: false });
    this.#worldCreationMenu.show(this.#draftSettings);
  }

  #showSettingsMenu(): void {
    this.#settingsReturnToPause =
      this.#activeGame !== null &&
      document.body.classList.contains("pause-open");
    applyUiStateToBodyClass({
      screen: "settings",
      inGame: this.#activeGame !== null,
    });
    this.#settingsMenu.show(
      this.#activeGame?.settings ?? this.#draftSettings,
      this.#audioManager.volumeSettings(),
    );
  }

  #returnFromSettings(messageText = ""): void {
    if (this.#settingsReturnToPause && this.#activeGame) {
      this.#settingsReturnToPause = false;
      this.#pauseGame();
      if (messageText) {
        this.#dom.message.textContent = messageText;
      }
      return;
    }

    this.#settingsReturnToPause = false;
    void this.#showMainMenu(messageText);
  }

  #pauseGame(): void {
    if (!this.#activeGame) {
      return;
    }

    this.#activeGame.camera.releaseInput();
    applyUiStateToBodyClass({ screen: "pause", inGame: true });
    this.#mainMenu.showPause(this.#activeGame.settings.worldName);
  }

  #resumeGame(): void {
    if (!this.#activeGame) {
      void this.#showMainMenu();
      return;
    }

    this.#mainMenu.hide();
    applyUiStateToBodyClass({ screen: "game", inGame: true });
    this.#activeGame.camera.resumeInput();
  }

  #saveActiveGame(): Promise<void> {
    return this.#saveCoordinator.saveActiveGame();
  }

  #stopActiveGame(): void {
    const game = this.#activeGame;

    if (!game) {
      return;
    }

    void this.#saveActiveGame();
    this.#gameSessionId += 1;
    this.#saveCoordinator.stopAutosave(game.autosaveTimer);
    game.renderer.stop();
    game.camera.stopInput();
    game.inventory.destroy();
    game.survival.destroy();
    game.survivalHud.destroy();
    game.objectiveTracker.destroy();
    game.mobileControls?.destroy();
    game.atmosphere.destroy();
    this.#panels.clearSession();
    game.performanceMonitor.reset();
    this.#debugOverlay.clear();
    this.#deathScreen.hide();
    this.#activeGame = null;
    delete this.#dom.message.dataset.streaming;
    if (this.#dom.meshStatus) {
      this.#dom.meshStatus.hidden = true;
      this.#dom.meshStatus.textContent = "";
    }
  }

  #backToMainMenu(): void {
    this.#stopActiveGame();
    this.#dom.message.textContent = "Choose or create a world.";
    void this.#showMainMenu("Returned to main menu.");
  }

  async #startWorld(save: LoadedWorldSave): Promise<void> {
    this.#stopActiveGame();
    const settings = settingsFromMetadata(save.metadata);

    this.#draftSettings = settings;
    saveGameSettingsToLocalStorage(settings);
    this.#applySettingsToBody(settings);
    applyUiStateToBodyClass({ screen: "game", inGame: true });
    this.#mainMenu.hide();
    this.#dom.message.textContent = "Generating world…";

    const sessionId = ++this.#gameSessionId;

    try {
      await createGameSession({
        save,
        sessionId,
        canvas: this.#gameCanvas,
        audioManager: this.#audioManager,
        panels: this.#panels,
        saveCoordinator: this.#saveCoordinator,
        statusMessage: this.#dom.message,
        modeStatus: this.#dom.modeStatus,
        meshStatus: this.#dom.meshStatus,
        survivalHudRoot: this.#dom.survivalHudRoot,
        objectiveTrackerRoot: this.#dom.objectiveTrackerRoot,
        debugOverlay: this.#debugOverlay,
        deathScreen: this.#deathScreen,
        getActiveGame: () => this.#activeGame,
        setActiveGame: (game) => {
          this.#activeGame = game;
        },
        isSessionCurrent: () => sessionId === this.#gameSessionId,
        onCanvasChanged: (canvas) => {
          this.#gameCanvas = canvas;
        },
      });
    } catch (error) {
      console.error(error);
      this.#stopActiveGame();
      void this.#showMainMenu(
        error instanceof Error ? error.message : "Renderer startup failed.",
      );
    }
  }

  async #createAndStartWorld(settings: GameSettings): Promise<void> {
    try {
      this.#dom.message.textContent = "Creating world…";
      await this.#startWorld(await this.#saveManager.createWorld(settings));
    } catch (error) {
      console.error("Could not create world.", error);
      void this.#showMainMenu("Could not create the world.");
    }
  }

  async #loadSavedWorld(worldId: string): Promise<void> {
    try {
      this.#dom.message.textContent = "Loading world…";
      const save = await this.#saveManager.loadWorld(worldId);

      if (!save) {
        void this.#showMainMenu("World not found.");
        return;
      }

      await this.#startWorld(save);
    } catch (error) {
      console.error("Could not load world.", error);
      void this.#showMainMenu("Could not load the world.");
    }
  }

  async #deleteSavedWorld(worldId: string): Promise<void> {
    try {
      await this.#saveManager.deleteWorld(worldId);
      await this.#showMainMenu("World deleted.");
    } catch (error) {
      console.error("Could not delete world.", error);
      await this.#showMainMenu("Could not delete the world.");
    }
  }

  async #renameSavedWorld(worldId: string, name: string): Promise<void> {
    try {
      const metadata = await this.#saveManager.renameWorld(worldId, name);

      await this.#showMainMenu(
        metadata ? "World renamed." : "World not found.",
      );
    } catch (error) {
      console.error("Could not rename world.", error);
      await this.#showMainMenu("Could not rename the world.");
    }
  }
}
