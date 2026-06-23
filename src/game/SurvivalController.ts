import {
  TERRAIN_BASE_Y,
  TERRAIN_BLOCK_HEIGHT,
  TerrainMaterial,
} from "../geometry/terrainChunk.ts";
import {
  PLAYER_EYE_HEIGHT,
  type FirstPersonCamera,
} from "../input/FirstPersonCamera.ts";
import {
  worldToAxial,
  type InfiniteTerrain,
  type TerrainStreamUpdate,
  type VoxelRaycastHit,
} from "../world/InfiniteTerrain.ts";
import { Inventory, minedDrop } from "./Inventory.ts";
import type { GameMode } from "./gameMode.ts";

export class SurvivalController {
  readonly #canvas: HTMLCanvasElement;
  readonly #world: InfiniteTerrain;
  readonly #camera: FirstPersonCamera;
  readonly #inventory: Inventory;
  readonly #crosshair: HTMLElement;
  readonly #onWorldUpdate: (update: TerrainStreamUpdate) => void;
  readonly #isCreative: boolean;

  #target: VoxelRaycastHit | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    world: InfiniteTerrain,
    camera: FirstPersonCamera,
    inventory: Inventory,
    onWorldUpdate: (update: TerrainStreamUpdate) => void,
    mode: GameMode = "survival",
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
    this.#isCreative = mode === "creative";

    this.#canvas.addEventListener("mousedown", (event) => {
      if (!this.#camera.isInputActive()) {
        return;
      }

      if (event.button === 0) {
        this.mine();
      } else if (event.button === 2) {
        this.place();
      }
    });

    this.#canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        this.#inventory.selectRelative(event.deltaY > 0 ? 1 : -1);
      },
      { passive: false },
    );
  }

  update(): void {
    this.#target = this.#world.raycast(
      this.#camera.position(),
      this.#camera.direction(),
    );
    this.#crosshair.classList.toggle("has-target", this.#target !== null);
    this.#crosshair.title = this.#target
      ? `Target level ${this.#target.voxel.level}`
      : "";
  }

  mine(): void {
    if (!this.#target) {
      return;
    }

    const drop = minedDrop(this.#target.material);
    const update = this.#world.setBlockAsync(
      this.#target.voxel,
      TerrainMaterial.Air,
    );

    if (!this.#isCreative && drop !== null) {
      this.#inventory.add(drop);
    }
    if (update) {
      void update
        .then((worldUpdate) => {
          if (worldUpdate) {
            this.#onWorldUpdate(worldUpdate);
          }
        })
        .catch((error) => console.error("Terrain remesh failed.", error));
    }
  }

  place(): void {
    const adjacent = this.#target?.adjacent;
    const material = this.#inventory.selectedMaterial();

    if (
      !adjacent ||
      (!this.#isCreative && this.#inventory.count(material) === 0)
    ) {
      return;
    }

    const [playerX, playerY, playerZ] = this.#camera.position();
    const playerHex = worldToAxial(playerX, playerZ);
    const playerFeetLevel = Math.floor(
      (playerY - PLAYER_EYE_HEIGHT - TERRAIN_BASE_Y) /
        TERRAIN_BLOCK_HEIGHT,
    );
    const intersectsPlayer =
      adjacent.q === playerHex.q &&
      adjacent.r === playerHex.r &&
      (adjacent.level === playerFeetLevel ||
        adjacent.level === playerFeetLevel + 1 ||
        adjacent.level === playerFeetLevel + 2);

    if (intersectsPlayer) {
      return;
    }

    if (!this.#isCreative && !this.#inventory.remove(material)) {
      return;
    }

    const update = this.#world.setBlockAsync(adjacent, material);
    if (update) {
      void update
        .then((worldUpdate) => {
          if (worldUpdate) {
            this.#onWorldUpdate(worldUpdate);
          }
        })
        .catch((error) => console.error("Terrain remesh failed.", error));
    }
  }
}
