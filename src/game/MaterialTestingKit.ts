import { itemIdForMaterial, type ItemId } from "../items/ItemRegistry.ts";
import type { MaterialDefinition } from "../materials/MaterialTypes.ts";
import { BASIC_STARTING_ELEMENT_IDS } from "../save/WorldSaveTypes.ts";
import type { GameMode } from "./gameMode.ts";
import type { MaterialWorldController } from "./MaterialWorldController.ts";

export const COMMON_STARTER_MATERIAL_IDS = BASIC_STARTING_ELEMENT_IDS;

export type MaterialTestingInventory = Readonly<{
  addItem: (itemId: ItemId, amount?: number) => boolean;
  grantItem?: (itemId: ItemId, amount?: number) => boolean;
}>;

export type MaterialGiveResult = Readonly<{
  ok: boolean;
  material: MaterialDefinition | null;
  itemId: ItemId | null;
  count: number;
  message: string;
}>;

export type StarterMaterialGiveResult = Readonly<{
  ok: boolean;
  addedCount: number;
  requestedCount: number;
  message: string;
}>;

export type MaterialTestingKitOptions = Readonly<{
  materialWorld: MaterialWorldController;
  inventory: MaterialTestingInventory;
  onMaterialDiscovered?: () => void;
  onSaveRequested?: () => void;
}>;

function normalizedGiveCount(count: number | undefined): number {
  return typeof count === "number" && Number.isFinite(count)
    ? Math.max(1, Math.floor(count))
    : 1;
}

export function canUseMaterialTestingKit(
  mode: GameMode,
  debugOverlay: boolean,
): boolean {
  return mode === "creative" || debugOverlay;
}

export class MaterialTestingKit {
  readonly #materialWorld: MaterialWorldController;
  readonly #inventory: MaterialTestingInventory;
  readonly #onMaterialDiscovered: () => void;
  readonly #onSaveRequested: () => void;

  constructor(options: MaterialTestingKitOptions) {
    this.#materialWorld = options.materialWorld;
    this.#inventory = options.inventory;
    this.#onMaterialDiscovered = options.onMaterialDiscovered ?? (() => {});
    this.#onSaveRequested = options.onSaveRequested ?? (() => {});
  }

  giveMaterial(materialId: string, count = 1): MaterialGiveResult {
    const material = this.#materialWorld.getMaterialById(materialId);
    const safeCount = normalizedGiveCount(count);

    if (!material) {
      return {
        ok: false,
        material: null,
        itemId: null,
        count: safeCount,
        message: `Unknown material: ${materialId}`,
      };
    }

    const itemId = itemIdForMaterial(material.id);
    const added = this.#inventory.grantItem
      ? this.#inventory.grantItem(itemId, safeCount)
      : this.#inventory.addItem(itemId, safeCount);

    if (!added) {
      return {
        ok: false,
        material,
        itemId,
        count: safeCount,
        message: `Could not add ${material.name} to inventory.`,
      };
    }

    const discovered = this.#materialWorld.discoverMaterial(material.id);

    if (discovered) {
      this.#onMaterialDiscovered();
    }
    this.#onSaveRequested();

    return {
      ok: true,
      material,
      itemId,
      count: safeCount,
      message: `Added ${safeCount}x ${material.name}.`,
    };
  }

  giveCommonStarterElements(count = 1): StarterMaterialGiveResult {
    let addedCount = 0;

    for (const materialId of COMMON_STARTER_MATERIAL_IDS) {
      if (this.giveMaterial(materialId, count).ok) {
        addedCount += 1;
      }
    }

    return {
      ok: addedCount === COMMON_STARTER_MATERIAL_IDS.length,
      addedCount,
      requestedCount: COMMON_STARTER_MATERIAL_IDS.length,
      message: `Added ${addedCount}/${COMMON_STARTER_MATERIAL_IDS.length} common starter elements.`,
    };
  }
}
