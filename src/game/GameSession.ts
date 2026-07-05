import type { Atmosphere } from "../environment/Atmosphere.ts";
import type { EntityManager } from "../entities/EntityManager.ts";
import type { EntityRenderer } from "../entities/EntityRenderer.ts";
import type { FirstPersonCamera } from "../input/FirstPersonCamera.ts";
import type { MobileControls } from "../input/MobileControls.ts";
import type { PerformanceMonitor } from "../performance/PerformanceMonitor.ts";
import type {
  SerializedInventory,
  WorldSaveMetadata,
} from "../save/WorldSaveTypes.ts";
import type { SurvivalHud } from "../ui/SurvivalHud.ts";
import type { GameTime } from "../world/GameTime.ts";
import type {
  InfiniteTerrain,
  TerrainStreamUpdate,
} from "../world/InfiniteTerrain.ts";
import type { GameSettings } from "./GameSettings.ts";
import type { Inventory } from "./Inventory.ts";
import type { MaterialHazardState } from "./MaterialHazards.ts";
import type { MaterialStorage } from "./MaterialStorage.ts";
import type { MaterialTestingKit } from "./MaterialTestingKit.ts";
import type { MaterialWorldController } from "./MaterialWorldController.ts";
import type { SurvivalController } from "./SurvivalController.ts";
import type { SurvivalStatsController } from "./SurvivalStatsController.ts";
import type { GameRenderer, RendererBackend } from "./GameBootstrap.ts";
import type { WorkbenchController } from "./WorkbenchController.ts";

export type ActiveGame = Readonly<{
  id: number;
  metadata: WorldSaveMetadata;
  settings: GameSettings;
  world: InfiniteTerrain;
  renderer: GameRenderer;
  camera: FirstPersonCamera;
  entityManager: EntityManager;
  entityRenderer: EntityRenderer;
  inventory: Inventory;
  workbenchController: WorkbenchController;
  materialWorld: MaterialWorldController;
  materialTestingKit: MaterialTestingKit;
  materialHazardState: MaterialHazardState;
  materialStorage: MaterialStorage;
  gameTime: GameTime;
  survival: SurvivalController;
  survivalStats: SurvivalStatsController;
  survivalHud: SurvivalHud;
  atmosphere: Atmosphere;
  mobileControls: MobileControls | null;
  performanceMonitor: PerformanceMonitor;
  rendererBackend: RendererBackend;
  latestTerrainUpdate: TerrainStreamUpdate;
  autosaveTimer: ReturnType<typeof window.setInterval>;
}>;

export function hasSavedInventory(inventory: SerializedInventory): boolean {
  return (
    inventory.hotbar !== undefined ||
    inventory.backpack !== undefined ||
    (inventory.slots !== undefined && inventory.slots.length > 0) ||
    (inventory.items !== undefined && inventory.items.length > 0)
  );
}

export function captureGameSavePayload(game: ActiveGame) {
  const [x, y, z] = game.camera.position();

  return {
    metadata: game.metadata,
    player: { position: [x, y, z] as const },
    inventory: game.inventory.exportState(),
    materialCodex: game.materialWorld.serialize(),
    materialStorage: game.materialStorage.serialize(),
    gameTime: game.gameTime.snapshot(),
    terrainEditChunks: game.world.exportTerrainEditChunks(),
  };
}
