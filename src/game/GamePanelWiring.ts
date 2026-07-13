import type { WorkbenchType } from "../crafting/WorkbenchTypes.ts";
import { canUseMaterialTestingKit } from "./MaterialTestingKit.ts";
import type { ActiveGame } from "./GameSession.ts";
import type { Equipment } from "./Equipment.ts";
import type { GameSettings } from "./GameSettings.ts";
import type { Inventory } from "./Inventory.ts";
import type { MaterialStorage } from "./MaterialStorage.ts";
import type { MaterialTestingKit } from "./MaterialTestingKit.ts";
import type { MaterialWorldController } from "./MaterialWorldController.ts";
import type { ProgressionController } from "./ProgressionController.ts";
import type { WorkbenchController } from "./WorkbenchController.ts";
import type { MaterialProcessingStationType } from "../materials/MaterialTypes.ts";
import { CreativeCatalogPanel } from "../ui/CreativeCatalogPanel.ts";
import { EquipmentPanel } from "../ui/EquipmentPanel.ts";
import { MaterialCombinerPanel } from "../ui/MaterialCombinerPanel.ts";
import { MaterialCodexPanel } from "../ui/MaterialCodexPanel.ts";
import { MaterialResearchPanel } from "../ui/MaterialResearchPanel.ts";
import { MaterialStoragePanel } from "../ui/MaterialStoragePanel.ts";
import { PanelManager } from "../ui/PanelManager.ts";
import { WorkbenchPanel } from "../ui/WorkbenchPanel.ts";

export type GamePanelRoots = Readonly<{
  materialCodexRoot: HTMLElement;
  materialCombinerRoot: HTMLElement;
  materialResearchRoot: HTMLElement;
  materialStorageRoot: HTMLElement;
  equipmentRoot: HTMLElement;
  creativeCatalogRoot: HTMLElement;
  workbenchRoot: HTMLElement;
}>;

export type GamePanelWiringOptions = Readonly<{
  roots: GamePanelRoots;
  panelManager: PanelManager;
  getActiveGame: () => ActiveGame | null;
}>;

export type GamePanelSessionOptions = Readonly<{
  sessionId: number;
  settings: GameSettings;
  materialWorld: MaterialWorldController;
  materialStorage: MaterialStorage;
  inventory: Inventory;
  equipment: Equipment;
  progression: ProgressionController;
  workbenchController: WorkbenchController;
  materialTestingKit: MaterialTestingKit;
  saveActiveGame: () => Promise<void>;
  getActiveGame: () => ActiveGame | null;
}>;

export class GamePanelWiring {
  readonly materialCodexPanel: MaterialCodexPanel;
  readonly materialCombinerPanel: MaterialCombinerPanel;
  readonly materialResearchPanel: MaterialResearchPanel;
  readonly materialStoragePanel: MaterialStoragePanel;
  readonly equipmentPanel: EquipmentPanel;
  readonly creativeCatalogPanel: CreativeCatalogPanel;
  readonly workbenchPanel: WorkbenchPanel;

  readonly #panelManager: PanelManager;
  readonly #getActiveGame: () => ActiveGame | null;

  constructor(options: GamePanelWiringOptions) {
    this.#panelManager = options.panelManager;
    this.#getActiveGame = options.getActiveGame;

    this.materialCodexPanel = new MaterialCodexPanel(
      options.roots.materialCodexRoot,
      null,
      (isOpen) =>
        this.#panelManager.notifyPanelOpenChange("material-codex", isOpen),
    );
    this.materialCombinerPanel = new MaterialCombinerPanel(
      options.roots.materialCombinerRoot,
      null,
      (isOpen) =>
        this.#panelManager.notifyPanelOpenChange("material-combiner", isOpen),
    );
    this.materialResearchPanel = new MaterialResearchPanel(
      options.roots.materialResearchRoot,
      null,
      (isOpen) =>
        this.#panelManager.notifyPanelOpenChange("material-research", isOpen),
    );
    this.materialStoragePanel = new MaterialStoragePanel(
      options.roots.materialStorageRoot,
      null,
      (isOpen) =>
        this.#panelManager.notifyPanelOpenChange("material-storage", isOpen),
    );
    this.equipmentPanel = new EquipmentPanel(
      options.roots.equipmentRoot,
      null,
      (isOpen) => this.#panelManager.notifyPanelOpenChange("equipment", isOpen),
    );
    this.creativeCatalogPanel = new CreativeCatalogPanel(
      options.roots.creativeCatalogRoot,
      null,
      (isOpen) =>
        this.#panelManager.notifyPanelOpenChange("creative-catalog", isOpen),
    );
    this.workbenchPanel = new WorkbenchPanel(
      options.roots.workbenchRoot,
      null,
      (isOpen) => this.#panelManager.notifyPanelOpenChange("workbench", isOpen),
    );

    this.#registerPanels();
  }

  openMaterialStorage(): void {
    this.#panelManager.openPanel("material-storage", () =>
      this.materialStoragePanel.show(),
    );
  }

  openEquipment(): void {
    this.#panelManager.openPanel("equipment", () => this.equipmentPanel.show());
  }

  openCreativeCatalog(): void {
    this.#panelManager.openPanel("creative-catalog", () =>
      this.creativeCatalogPanel.show(),
    );
  }

  openMaterialCombiner(
    stationType: MaterialProcessingStationType,
    lockedToStation: boolean,
  ): void {
    this.#panelManager.openPanel("material-combiner", () =>
      this.materialCombinerPanel.show(stationType, lockedToStation),
    );
  }

  openWorkbench(
    workbenchType: WorkbenchType,
    lockedToWorkbench: boolean,
  ): void {
    this.#panelManager.openPanel("workbench", () =>
      this.workbenchPanel.show(workbenchType, lockedToWorkbench),
    );
  }

  refreshMaterialPanels(): void {
    this.materialCodexPanel.refresh();
    this.materialResearchPanel.refresh();
  }

  refreshMaterialInventoryPanels(): void {
    this.materialCodexPanel.refresh();
    this.materialStoragePanel.refresh();
  }

  notifyInventoryOpenChange(isOpen: boolean): void {
    this.#panelManager.notifyPanelOpenChange("inventory", isOpen);
  }

  wireSession(options: GamePanelSessionOptions): void {
    const {
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
    } = options;
    const currentSettings = (): GameSettings => {
      const activeGame = getActiveGame();

      return activeGame?.id === sessionId ? activeGame.settings : settings;
    };

    this.materialCodexPanel.setRegistry(materialWorld.registry);
    this.materialCodexPanel.setMaterialStorage(materialStorage);
    this.materialStoragePanel.setSession({
      storage: materialStorage,
      registry: materialWorld.registry,
      inventory,
      onSaveRequested: () => void saveActiveGame(),
    });
    this.equipmentPanel.setSession({
      equipment,
      inventory,
      onSaveRequested: () => void saveActiveGame(),
    });
    this.workbenchPanel.setSession({ controller: workbenchController });
    this.creativeCatalogPanel.setSession({
      mode: settings.gameMode,
      inventory,
      materialWorld,
      showDebugIds: () => currentSettings().debugOverlay,
      onSaveRequested: () => void saveActiveGame(),
    });
    this.materialCombinerPanel.setSession({
      materialWorld,
      inventory,
      onMaterialDiscovered: () => this.materialCodexPanel.refresh(),
      onMaterialsCombined: () => progression.recordMaterialsCombined(),
      onSaveRequested: () => void saveActiveGame(),
    });
    this.materialResearchPanel.setSession({
      materialWorld,
      canDebugUnlock: () =>
        canUseMaterialTestingKit(
          currentSettings().gameMode,
          currentSettings().debugOverlay,
        ),
      onResearchChanged: () => {
        this.materialCodexPanel.refresh();
        this.materialCombinerPanel.refresh();
      },
      onSaveRequested: () => void saveActiveGame(),
    });
    this.materialCodexPanel.setDebugActions({
      isVisible: () =>
        canUseMaterialTestingKit(
          currentSettings().gameMode,
          currentSettings().debugOverlay,
        ),
      giveMaterial: (materialId, count) =>
        materialTestingKit.giveMaterial(materialId, count),
      giveCommonStarterElements: (count) =>
        materialTestingKit.giveCommonStarterElements(count),
    });
  }

  clearSession(): void {
    this.materialCodexPanel.hide();
    this.materialCodexPanel.setRegistry(null);
    this.materialCodexPanel.setMaterialStorage(null);
    this.materialCodexPanel.setDebugActions(null);
    this.materialCombinerPanel.hide();
    this.materialCombinerPanel.setSession(null);
    this.materialResearchPanel.hide();
    this.materialResearchPanel.setSession(null);
    this.materialStoragePanel.hide();
    this.materialStoragePanel.setSession(null);
    this.equipmentPanel.hide();
    this.equipmentPanel.setSession(null);
    this.creativeCatalogPanel.hide();
    this.creativeCatalogPanel.setSession(null);
    this.workbenchPanel.hide();
    this.workbenchPanel.setSession(null);
  }

  #registerPanels(): void {
    this.#panelManager.registerPanel({
      id: "inventory",
      bodyClass: "inventory-open",
      close: () => this.#getActiveGame()?.inventory.hide(),
    });
    this.#panelManager.registerPanel({
      id: "material-codex",
      bodyClass: "material-codex-open",
      close: () => this.materialCodexPanel.hide(),
    });
    this.#panelManager.registerPanel({
      id: "material-combiner",
      bodyClass: "material-combiner-open",
      close: () => this.materialCombinerPanel.hide(),
    });
    this.#panelManager.registerPanel({
      id: "material-research",
      bodyClass: "material-research-open",
      close: () => this.materialResearchPanel.hide(),
    });
    this.#panelManager.registerPanel({
      id: "material-storage",
      bodyClass: "material-storage-open",
      close: () => this.materialStoragePanel.hide(),
    });
    this.#panelManager.registerPanel({
      id: "equipment",
      bodyClass: "equipment-open",
      close: () => this.equipmentPanel.hide(),
    });
    this.#panelManager.registerPanel({
      id: "creative-catalog",
      bodyClass: "creative-catalog-open",
      close: () => this.creativeCatalogPanel.hide(),
    });
    this.#panelManager.registerPanel({
      id: "workbench",
      bodyClass: "workbench-open",
      close: () => this.workbenchPanel.hide(),
    });
  }
}
