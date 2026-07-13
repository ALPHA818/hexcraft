import { TerrainMaterial } from "../geometry/terrainChunk.ts";
import type { AudioManager } from "../audio/AudioManager.ts";
import { type FirstPersonCamera } from "../input/FirstPersonCamera.ts";
import {
  DEFAULT_MATERIAL_CONFIG,
  type MaterialConfig,
} from "../materials/MaterialConfig.ts";
import {
  biomeAt,
  caveAt,
  DEFAULT_WORLD_SEED,
  type InfiniteTerrain,
  terrainHeightAt,
  terrainProfileAt,
  type TerrainStreamUpdate,
  type VoxelRaycastHit,
} from "../world/InfiniteTerrain.ts";
import {
  dynamicMaterialBlockDisplayName,
  isDynamicMaterialBlock,
} from "../world/DynamicMaterialBlocks.ts";
import { blockDefinitionFor } from "../world/blocks.ts";
import { ALL_VOXEL_DIRECTIONS, neighborOf } from "../world/voxelRules.ts";
import { TargetHighlight } from "../ui/TargetHighlight.ts";
import {
  BlockBreakingController,
  canBreakBlockMaterial,
} from "./BlockBreakingController.ts";
import {
  placedBlockInteractionForTarget,
  validateBlockPlacement,
  type BlockPlacementFailure,
  type BlockPlacementFailureReason,
} from "./BlockPlacementRules.ts";
import { Inventory } from "./Inventory.ts";
import { applyMaterialDropRules } from "./MaterialDropRules.ts";
import type { MaterialWorldController } from "./MaterialWorldController.ts";
import type { GameMode } from "./gameMode.ts";
import type { MaterialProcessingStationType } from "../materials/MaterialTypes.ts";
import type { WorkbenchType } from "../crafting/WorkbenchTypes.ts";

export type WorkbenchInteractionOpenTarget =
  | Readonly<{
      kind: "material_combiner";
      stationType: "combiner";
    }>
  | Readonly<{
      kind: "workbench";
      workbenchType: Exclude<WorkbenchType, "element_combiner">;
    }>;

export function workbenchInteractionOpenTarget(
  workbenchType: WorkbenchType,
): WorkbenchInteractionOpenTarget {
  if (workbenchType === "element_combiner") {
    return {
      kind: "material_combiner",
      stationType: "combiner",
    };
  }

  return {
    kind: "workbench",
    workbenchType,
  };
}

export class SurvivalController {
  readonly #canvas: HTMLCanvasElement;
  readonly #world: InfiniteTerrain;
  readonly #camera: FirstPersonCamera;
  readonly #inventory: Inventory;
  readonly #crosshair: HTMLElement;
  readonly #onWorldUpdate: (update: TerrainStreamUpdate) => void;
  readonly #onTerrainEdited: () => void;
  readonly #breaking: BlockBreakingController;
  readonly #audio: AudioManager | null;
  readonly #materialWorld: MaterialWorldController | null;
  readonly #onMaterialDiscovery: () => void;
  readonly #onMaterialDiscovered: (materialId: string) => void;
  readonly #openMaterialStation: (
    stationType: MaterialProcessingStationType,
  ) => void;
  readonly #openWorkbench: (
    workbenchType: Exclude<WorkbenchType, "element_combiner">,
  ) => void;
  readonly #worldSeed: number;
  readonly #materialDiscoveryConfig: Partial<
    Pick<MaterialConfig, "materialTraceDiscoveryChance" | "seed">
  >;
  readonly #isCreative: boolean;
  readonly #mode: GameMode;
  readonly #placementFeedback: HTMLElement;
  readonly #debugTargetLabel: HTMLElement;
  readonly #targetHighlight: TargetHighlight;

  #target: VoxelRaycastHit | null = null;
  #isActive = true;
  #placementFeedbackTimer: ReturnType<typeof window.setTimeout> | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    world: InfiniteTerrain,
    camera: FirstPersonCamera,
    inventory: Inventory,
    onWorldUpdate: (update: TerrainStreamUpdate) => void,
    mode: GameMode = "survival",
    onTerrainEdited: () => void = () => {},
    audio: AudioManager | null = null,
    materialWorld: MaterialWorldController | null = null,
    onMaterialDiscovery: () => void = () => {},
    openMaterialStation: (
      stationType: MaterialProcessingStationType,
    ) => void = () => {},
    openWorkbench: (
      workbenchType: Exclude<WorkbenchType, "element_combiner">,
    ) => void = () => {},
    worldSeed: number = DEFAULT_WORLD_SEED,
    materialDiscoveryConfig: Partial<
      Pick<MaterialConfig, "materialTraceDiscoveryChance" | "seed">
    > = DEFAULT_MATERIAL_CONFIG,
    onMaterialDiscovered: (materialId: string) => void = () => {},
  ) {
    const crosshair = document.querySelector<HTMLElement>("#crosshair");
    if (!crosshair) {
      throw new Error("The targeting crosshair is missing.");
    }

    this.#canvas = canvas;
    this.#world = world;
    this.#camera = camera;
    this.#inventory = inventory;
    this.#crosshair = crosshair;
    this.#onWorldUpdate = onWorldUpdate;
    this.#onTerrainEdited = onTerrainEdited;
    this.#audio = audio;
    this.#materialWorld = materialWorld;
    this.#onMaterialDiscovery = onMaterialDiscovery;
    this.#onMaterialDiscovered = onMaterialDiscovered;
    this.#openMaterialStation = openMaterialStation;
    this.#openWorkbench = openWorkbench;
    this.#worldSeed = worldSeed;
    this.#materialDiscoveryConfig = materialDiscoveryConfig;
    this.#isCreative = mode === "creative";
    this.#mode = mode;
    this.#debugTargetLabel = document.createElement("span");
    this.#debugTargetLabel.className = "target-debug-label";
    this.#debugTargetLabel.setAttribute("aria-hidden", "true");
    this.#placementFeedback = document.createElement("span");
    this.#placementFeedback.className = "placement-feedback";
    this.#placementFeedback.setAttribute("aria-hidden", "true");
    this.#crosshair.append(this.#debugTargetLabel, this.#placementFeedback);
    this.#targetHighlight = new TargetHighlight(canvas);
    this.#breaking = new BlockBreakingController({
      mode,
      crosshair,
      getEquippedTool: () => this.#inventory.selectedTool(),
      onBlockBroken: (target) => this.#mineTarget(target),
    });

    this.#canvas.addEventListener("mousedown", (event) => {
      if (!this.#isActive || !this.#camera.isInputActive()) {
        return;
      }

      if (event.button === 0) {
        this.startMining();
      } else if (event.button === 2) {
        this.place();
      }
    });
    window.addEventListener("mouseup", (event) => {
      if (event.button === 0) {
        this.stopMining();
      }
    });

    this.#canvas.addEventListener(
      "wheel",
      (event) => {
        if (!this.#isActive) {
          return;
        }

        event.preventDefault();
        this.#inventory.selectRelative(event.deltaY > 0 ? 1 : -1);
      },
      { passive: false },
    );
  }

  update(deltaSeconds = 0): void {
    if (!this.#isActive) {
      return;
    }

    this.#target = this.#world.raycast(
      this.#camera.position(),
      this.#camera.direction(),
    );
    const hasMineableTarget =
      this.#target !== null && canBreakBlockMaterial(this.#target.material);

    this.#crosshair.classList.toggle("has-target", this.#target !== null);
    this.#crosshair.classList.toggle("has-mineable-target", hasMineableTarget);
    const targetName = this.#target
      ? this.#targetDisplayName(this.#target)
      : "";

    this.#crosshair.title = this.#target
      ? `${targetName} · ${this.#target.face} face · level ${this.#target.voxel.level}`
      : "";
    this.#debugTargetLabel.textContent = this.#target
      ? `${targetName} · ${this.#target.face} · ${this.#target.distance.toFixed(1)}m`
      : "";
    this.#targetHighlight.update(this.#target, this.#camera);
    this.#breaking.update(this.#target, deltaSeconds);
  }

  mine(): void {
    this.startMining();
  }

  startMining(): void {
    if (!this.#isActive) {
      return;
    }

    this.#breaking.start(this.#target);
  }

  stopMining(): void {
    this.#breaking.cancel();
  }

  #mineTarget(target: VoxelRaycastHit): void {
    const currentMaterial = this.#world.materialAt(
      target.voxel.q,
      target.voxel.r,
      target.voxel.level,
    );

    if (currentMaterial !== target.material) {
      return;
    }

    const block = blockDefinitionFor(target.material);

    if (!block.breakable || block.fluid) {
      return;
    }

    const dynamicMaterialId = isDynamicMaterialBlock(target.material)
      ? this.#world.dynamicMaterialIdAt(target.voxel)
      : null;
    const update = this.#world.setBlockAsync(target.voxel, TerrainMaterial.Air);

    if (!update) {
      return;
    }

    if (!this.#isCreative) {
      const drops = applyMaterialDropRules(
        target.material,
        this.#inventory,
        this.#materialWorld,
        {
          dynamicMaterialId,
          discoveryContext: {
            biome: biomeAt(target.voxel.q, target.voxel.r, this.#worldSeed),
            isCave: this.#isNearNaturalCave(target.voxel),
            isMountain: terrainProfileAt(
              target.voxel.q,
              target.voxel.r,
              this.#worldSeed,
            ).mountain,
            q: target.voxel.q,
            r: target.voxel.r,
            level: target.voxel.level,
            worldSeed: this.#worldSeed,
            config: this.#materialDiscoveryConfig,
          },
        },
      );

      for (const notification of drops.notifications) {
        this.#showDiscoveryNotification(notification);
      }

      if (drops.discoveredMaterialIds.length > 0) {
        for (const materialId of drops.discoveredMaterialIds) {
          this.#onMaterialDiscovered(materialId);
        }
        this.#onMaterialDiscovery();
      }
      this.#inventory.damageSelectedTool();
    }

    this.#audio?.playBlockBreak(target.material);
    this.#onTerrainEdited();
    void update
      .then((worldUpdate) => {
        if (worldUpdate) {
          this.#onWorldUpdate(worldUpdate);
        }
      })
      .catch((error) => console.error("Terrain remesh failed.", error));
  }

  #targetDisplayName(target: VoxelRaycastHit): string {
    if (!isDynamicMaterialBlock(target.material)) {
      return target.block.displayName;
    }

    return dynamicMaterialBlockDisplayName(
      this.#world.dynamicMaterialIdAt(target.voxel),
      this.#materialWorld,
    );
  }

  #isNearNaturalCave(position: VoxelRaycastHit["voxel"]): boolean {
    const candidates = [
      position,
      ...ALL_VOXEL_DIRECTIONS.map((direction) =>
        neighborOf(position, direction),
      ),
    ];

    return candidates.some((candidate) => {
      const surfaceHeight = terrainHeightAt(
        candidate.q,
        candidate.r,
        this.#worldSeed,
      );

      return caveAt(
        candidate.q,
        candidate.r,
        candidate.level,
        surfaceHeight,
        this.#worldSeed,
      );
    });
  }

  place(): void {
    if (!this.#isActive) {
      return;
    }

    if (this.#interactWithTargetBlock()) {
      return;
    }

    const selectedItemId = this.#inventory.selectedItemId();
    const selectedItem = this.#inventory.selectedItem();
    const material = this.#inventory.selectedPlaceableMaterial();
    const dynamicMaterialId = this.#inventory.selectedDynamicMaterialId();
    const placement = validateBlockPlacement({
      target: this.#target,
      selectedItemId,
      selectedItem,
      selectedMaterial: material,
      playerPosition: this.#camera.position(),
      world: this.#world,
      mode: this.#mode,
      selectedStackCount: this.#inventory.selectedStackCount(),
    });

    if (!placement.ok) {
      this.#showPlacementFailure(placement);
      return;
    }

    let consumedItem = false;
    if (placement.consumeItem) {
      if (!selectedItemId || !this.#inventory.consumeSelectedStack()) {
        this.#showPlacementFailure({
          ok: false,
          reason: "missing_inventory",
          message: "No blocks left.",
        });
        return;
      }

      consumedItem = true;
    }

    const update = this.#world.setBlockAsync(
      placement.position,
      placement.material,
      dynamicMaterialId ?? undefined,
    );
    if (!update) {
      if (consumedItem && selectedItemId) {
        this.#inventory.restoreSelectedStackItem(selectedItemId);
      }
      this.#showPlacementFailure({
        ok: false,
        reason: "unloaded",
        message: "That area is not loaded yet.",
      });
      return;
    }

    this.#audio?.playBlockPlace(placement.material);
    this.#onTerrainEdited();
    void update
      .then((worldUpdate) => {
        if (worldUpdate) {
          this.#onWorldUpdate(worldUpdate);
        }
      })
      .catch((error) => console.error("Terrain remesh failed.", error));
  }

  #interactWithTargetBlock(): boolean {
    const interaction = placedBlockInteractionForTarget({
      target: this.#target,
    });

    if (!interaction) {
      return false;
    }

    this.stopMining();
    if (interaction.kind === "material_combiner") {
      this.#openMaterialStation(interaction.stationType);
    } else {
      this.#openWorkbench(interaction.workbenchType);
    }
    return true;
  }

  #showPlacementFailure(failure: BlockPlacementFailure): void {
    this.#placementFeedback.textContent = failure.message;
    this.#crosshair.classList.remove("material-discovered");
    this.#crosshair.classList.remove("placement-failed");
    void this.#crosshair.offsetWidth;
    this.#crosshair.classList.add("placement-failed");
    this.#playPlacementFailureSound(failure.reason);

    if (this.#placementFeedbackTimer) {
      window.clearTimeout(this.#placementFeedbackTimer);
    }
    this.#placementFeedbackTimer = window.setTimeout(() => {
      this.#crosshair.classList.remove("placement-failed");
      this.#placementFeedback.textContent = "";
      this.#placementFeedbackTimer = null;
    }, 900);
  }

  #showDiscoveryNotification(message: string): void {
    this.#placementFeedback.textContent = message;
    this.#crosshair.classList.remove("placement-failed");
    this.#crosshair.classList.remove("material-discovered");
    void this.#crosshair.offsetWidth;
    this.#crosshair.classList.add("material-discovered");

    if (this.#placementFeedbackTimer) {
      window.clearTimeout(this.#placementFeedbackTimer);
    }
    this.#placementFeedbackTimer = window.setTimeout(() => {
      this.#crosshair.classList.remove("material-discovered");
      this.#placementFeedback.textContent = "";
      this.#placementFeedbackTimer = null;
    }, 1_400);
  }

  #playPlacementFailureSound(reason: BlockPlacementFailureReason): void {
    void reason;
    this.#audio?.play("ui.error");
  }

  destroy(): void {
    this.#isActive = false;
    this.#target = null;
    this.#breaking.destroy();
    if (this.#placementFeedbackTimer) {
      window.clearTimeout(this.#placementFeedbackTimer);
      this.#placementFeedbackTimer = null;
    }
    this.#crosshair.classList.remove(
      "has-target",
      "has-mineable-target",
      "placement-failed",
    );
    this.#crosshair.title = "";
    this.#placementFeedback.remove();
    this.#debugTargetLabel.remove();
    this.#targetHighlight.destroy();
  }
}
