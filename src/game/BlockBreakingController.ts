import { TerrainMaterial } from "../geometry/terrainChunk.ts";
import { HAND_TOOL, type EquippedTool } from "../items/ToolTypes.ts";
import {
  blockDefinitionFor,
  type BlockDefinition,
  type PreferredTool,
} from "../world/blocks.ts";
import type { VoxelRaycastHit } from "../world/InfiniteTerrain.ts";
import { voxelKey } from "../world/voxelRules.ts";
import type { GameMode } from "./gameMode.ts";

export type BlockBreakingControllerOptions = Readonly<{
  mode: GameMode;
  onBlockBroken: (target: VoxelRaycastHit) => void;
  getEquippedTool?: () => EquippedTool | PreferredTool;
  crosshair?: HTMLElement | null;
}>;

const SURVIVAL_BREAK_RATE = 0.7;
const WRONG_TOOL_MULTIPLIER = 0.8;

type BlockBreakingTool = EquippedTool | PreferredTool;

function targetKey(target: VoxelRaycastHit | null): string | null {
  return target
    ? `${voxelKey(target.voxel.q, target.voxel.r, target.voxel.level)}:${target.material}`
    : null;
}

export function canBreakBlockMaterial(material: TerrainMaterial): boolean {
  const block = blockDefinitionFor(material);

  return (
    block.breakable &&
    !block.fluid &&
    Number.isFinite(block.hardness) &&
    block.hardness > 0
  );
}

export function toolSpeedMultiplier(
  block: Pick<BlockDefinition, "preferredTool">,
  tool: BlockBreakingTool,
): number {
  const equippedTool = normalizeBreakingTool(tool);

  if (equippedTool.kind === block.preferredTool) {
    return equippedTool.speedMultiplier;
  }

  return equippedTool.kind === "hand" ? 1 : WRONG_TOOL_MULTIPLIER;
}

export function blockBreakProgressPerSecond(
  material: TerrainMaterial,
  tool: BlockBreakingTool,
): number {
  if (!canBreakBlockMaterial(material)) {
    return 0;
  }

  const block = blockDefinitionFor(material);
  return (
    (SURVIVAL_BREAK_RATE * toolSpeedMultiplier(block, tool)) / block.hardness
  );
}

function normalizeBreakingTool(tool: BlockBreakingTool): EquippedTool {
  return typeof tool === "string"
    ? {
        kind: tool === "bucket" ? "hand" : tool,
        speedMultiplier: tool === "hand" || tool === "bucket" ? 1 : 3,
      }
    : tool;
}

export class BlockBreakingController {
  readonly #mode: GameMode;
  readonly #onBlockBroken: (target: VoxelRaycastHit) => void;
  readonly #getEquippedTool: () => BlockBreakingTool;
  readonly #crosshair: HTMLElement | null;
  readonly #progressBar: HTMLElement | null = null;
  readonly #progressFill: HTMLElement | null = null;

  #isHolding = false;
  #target: VoxelRaycastHit | null = null;
  #activeTargetKey: string | null = null;
  #completedTargetKey: string | null = null;
  #progress = 0;

  constructor(options: BlockBreakingControllerOptions) {
    this.#mode = options.mode;
    this.#onBlockBroken = options.onBlockBroken;
    this.#getEquippedTool = options.getEquippedTool ?? (() => HAND_TOOL);
    this.#crosshair = options.crosshair ?? null;

    if (this.#crosshair) {
      const progressBar = document.createElement("span");
      const progressFill = document.createElement("span");

      progressBar.className = "breaking-progress";
      progressFill.className = "breaking-progress-fill";
      progressBar.append(progressFill);
      this.#crosshair.append(progressBar);
      this.#progressBar = progressBar;
      this.#progressFill = progressFill;
    }
    this.#updateVisuals();
  }

  get progress(): number {
    return this.#progress;
  }

  get isBreaking(): boolean {
    return (
      this.#isHolding &&
      this.#target !== null &&
      this.#activeTargetKey !== this.#completedTargetKey &&
      canBreakBlockMaterial(this.#target.material)
    );
  }

  start(target: VoxelRaycastHit | null): void {
    this.#isHolding = true;
    this.#completedTargetKey = null;
    this.update(target, 0);
  }

  cancel(): void {
    this.#isHolding = false;
    this.#target = null;
    this.#activeTargetKey = null;
    this.#completedTargetKey = null;
    this.#progress = 0;
    this.#updateVisuals();
  }

  update(target: VoxelRaycastHit | null, deltaSeconds: number): void {
    const nextTargetKey = targetKey(target);

    if (nextTargetKey !== this.#activeTargetKey) {
      this.#progress = 0;
      this.#activeTargetKey = nextTargetKey;
    }
    if (nextTargetKey !== this.#completedTargetKey) {
      this.#completedTargetKey = null;
    }

    this.#target = target;

    if (
      !this.#isHolding ||
      !target ||
      !canBreakBlockMaterial(target.material)
    ) {
      this.#updateVisuals();
      return;
    }

    if (this.#activeTargetKey === this.#completedTargetKey) {
      this.#updateVisuals();
      return;
    }

    if (this.#mode === "creative") {
      this.#complete(target);
      return;
    }

    this.#progress = Math.min(
      1,
      this.#progress +
        Math.max(0, deltaSeconds) *
          blockBreakProgressPerSecond(target.material, this.#getEquippedTool()),
    );

    if (this.#progress >= 1) {
      this.#updateVisuals();
      this.#complete(target);
      return;
    }

    this.#updateVisuals();
  }

  destroy(): void {
    this.cancel();
    this.#progressBar?.remove();
  }

  #complete(target: VoxelRaycastHit): void {
    this.#completedTargetKey = targetKey(target);
    this.#progress = 0;
    this.#onBlockBroken(target);
    this.#updateVisuals();
  }

  #updateVisuals(): void {
    const hasUnbreakableTarget =
      this.#target !== null && !canBreakBlockMaterial(this.#target.material);
    const visibleProgress = this.isBreaking ? this.#progress : 0;

    this.#crosshair?.classList.toggle("is-breaking", this.isBreaking);
    this.#crosshair?.classList.toggle(
      "has-unbreakable-target",
      hasUnbreakableTarget,
    );
    this.#crosshair?.style.setProperty(
      "--break-progress",
      String(visibleProgress),
    );

    if (this.#progressBar) {
      this.#progressBar.hidden = !this.isBreaking;
    }
    if (this.#progressFill) {
      this.#progressFill.style.transform = `scaleX(${visibleProgress})`;
    }
  }
}
