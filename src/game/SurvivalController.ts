import { TerrainMaterial } from "../geometry/terrainChunk.ts";
import type { AudioManager } from "../audio/AudioManager.ts";
import { type FirstPersonCamera } from "../input/FirstPersonCamera.ts";
import type { ItemId } from "../items/ItemRegistry.ts";
import {
  type InfiniteTerrain,
  type TerrainStreamUpdate,
  type VoxelRaycastHit,
} from "../world/InfiniteTerrain.ts";
import { blockDefinitionFor } from "../world/blocks.ts";
import { TargetHighlight } from "../ui/TargetHighlight.ts";
import {
  BlockBreakingController,
  canBreakBlockMaterial,
} from "./BlockBreakingController.ts";
import {
  validateBlockPlacement,
  type BlockPlacementFailure,
  type BlockPlacementFailureReason,
} from "./BlockPlacementRules.ts";
import { Inventory } from "./Inventory.ts";
import type { GameMode } from "./gameMode.ts";

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
    this.#crosshair.title = this.#target
      ? `${this.#target.block.displayName} · ${this.#target.face} face · level ${this.#target.voxel.level}`
      : "";
    this.#debugTargetLabel.textContent = this.#target
      ? `${this.#target.block.displayName} · ${this.#target.face} · ${this.#target.distance.toFixed(1)}m`
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

    const update = this.#world.setBlockAsync(target.voxel, TerrainMaterial.Air);

    if (!update) {
      return;
    }

    if (!this.#isCreative) {
      for (const drop of block.drops) {
        if (drop.itemId) {
          this.#inventory.addItem(drop.itemId as ItemId, drop.quantity);
        } else if (drop.numericId !== undefined) {
          this.#inventory.add(drop.numericId as TerrainMaterial, drop.quantity);
        }
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

  place(): void {
    if (!this.#isActive) {
      return;
    }

    const material = this.#inventory.selectedPlaceableMaterial();
    const placement = validateBlockPlacement({
      target: this.#target,
      selectedItemId: this.#inventory.selectedItemId(),
      selectedMaterial: material,
      playerPosition: this.#camera.position(),
      world: this.#world,
      mode: this.#mode,
      inventoryCount: material === null ? 0 : this.#inventory.count(material),
    });

    if (!placement.ok) {
      this.#showPlacementFailure(placement);
      return;
    }

    let consumedItem = false;
    if (placement.consumeItem && !this.#inventory.remove(placement.material)) {
      this.#showPlacementFailure({
        ok: false,
        reason: "missing_inventory",
        message: "No blocks left.",
      });
      return;
    }
    consumedItem = placement.consumeItem;

    const update = this.#world.setBlockAsync(
      placement.position,
      placement.material,
    );
    if (!update) {
      if (consumedItem) {
        this.#inventory.add(placement.material);
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

  #showPlacementFailure(failure: BlockPlacementFailure): void {
    this.#placementFeedback.textContent = failure.message;
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
