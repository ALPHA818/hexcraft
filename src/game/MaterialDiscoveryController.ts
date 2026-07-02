import { itemIdForMaterial, type ItemId } from "../items/ItemRegistry.ts";
import type {
  MaterialCombinationFailureReason,
  MaterialDefinition,
  MaterialProcessingStationType,
  MaterialResearchTier,
  MaterialUnstableReactionOutcome,
} from "../materials/MaterialTypes.ts";
import type { MaterialWorldController } from "./MaterialWorldController.ts";

export type MaterialDiscoveryInventory = Readonly<{
  isCreative: () => boolean;
  countItem: (itemId: ItemId) => number;
  addItem: (itemId: ItemId, amount?: number) => boolean;
  removeItem: (itemId: ItemId, amount?: number) => boolean;
}>;

export type MaterialDiscoveryControllerOptions = Readonly<{
  materialWorld: MaterialWorldController;
  inventory: MaterialDiscoveryInventory;
  onMaterialDiscovered?: () => void;
  onSaveRequested?: () => void;
}>;

export type MaterialDiscoveryOption = Readonly<{
  material: MaterialDefinition;
  itemId: ItemId;
  count: number;
}>;

export type MaterialDiscoveryFailureReason =
  | MaterialCombinationFailureReason
  | "invalid_material"
  | "insufficient_items"
  | "inventory_full";

export type MaterialDiscoveryCombineSuccess = Readonly<{
  ok: true;
  material: MaterialDefinition;
  recipeKey: string;
  itemId: ItemId;
  discovered: boolean;
  consumedIngredients: boolean;
  message: string;
}>;

export type MaterialDiscoveryCombineFailure = Readonly<{
  ok: false;
  reason: MaterialDiscoveryFailureReason;
  message: string;
  recipeKey?: string;
  requiredResearchTier?: MaterialResearchTier;
  unstableOutcome?: MaterialUnstableReactionOutcome;
  consumedIngredients: boolean;
}>;

export type MaterialDiscoveryCombineResult =
  MaterialDiscoveryCombineSuccess | MaterialDiscoveryCombineFailure;

type RequiredIngredient = Readonly<{
  itemId: ItemId;
  count: number;
}>;

function materialItemId(materialId: string): ItemId {
  return itemIdForMaterial(materialId);
}

function requiredIngredients(
  parentAId: string,
  parentBId: string,
): readonly RequiredIngredient[] {
  const parentAItemId = materialItemId(parentAId);
  const parentBItemId = materialItemId(parentBId);

  if (parentAItemId === parentBItemId) {
    return [{ itemId: parentAItemId, count: 2 }];
  }

  return [
    { itemId: parentAItemId, count: 1 },
    { itemId: parentBItemId, count: 1 },
  ];
}

function missingIngredientMessage(
  materialWorld: MaterialWorldController,
  ingredients: readonly RequiredIngredient[],
): string {
  const missing = ingredients
    .map((ingredient) => {
      const materialId = ingredient.itemId.slice("generated-material:".length);
      const name =
        materialWorld.getMaterialById(materialId)?.name ?? materialId;

      return `${ingredient.count}x ${name}`;
    })
    .join(" + ");

  return `Requires ${missing}.`;
}

export class MaterialDiscoveryController {
  readonly #materialWorld: MaterialWorldController;
  readonly #inventory: MaterialDiscoveryInventory;
  readonly #onMaterialDiscovered: () => void;
  readonly #onSaveRequested: () => void;

  constructor(options: MaterialDiscoveryControllerOptions) {
    this.#materialWorld = options.materialWorld;
    this.#inventory = options.inventory;
    this.#onMaterialDiscovered = options.onMaterialDiscovered ?? (() => {});
    this.#onSaveRequested = options.onSaveRequested ?? (() => {});
  }

  listDiscoveredMaterialItems(): readonly MaterialDiscoveryOption[] {
    return this.#materialWorld.listDiscoveredMaterials().map((material) => {
      const itemId = materialItemId(material.id);

      return {
        material,
        itemId,
        count: this.#inventory.countItem(itemId),
      };
    });
  }

  getKnownResult(
    parentAId: string,
    parentBId: string,
    stationType: MaterialProcessingStationType = "combiner",
  ): MaterialDefinition | null {
    return this.#materialWorld.getKnownResult(
      parentAId,
      parentBId,
      stationType,
    );
  }

  canAfford(parentAId: string, parentBId: string): boolean {
    if (this.#inventory.isCreative()) {
      return true;
    }

    return requiredIngredients(parentAId, parentBId).every(
      (ingredient) =>
        this.#inventory.countItem(ingredient.itemId) >= ingredient.count,
    );
  }

  combine(
    parentAId: string,
    parentBId: string,
    stationType: MaterialProcessingStationType = "combiner",
  ): MaterialDiscoveryCombineResult {
    const parentA = this.#materialWorld.getMaterialById(parentAId);
    const parentB = this.#materialWorld.getMaterialById(parentBId);

    if (!parentA || !parentB) {
      return {
        ok: false,
        reason: "invalid_material",
        message: "Unknown material selected.",
        consumedIngredients: false,
      };
    }

    const creative = this.#inventory.isCreative();
    const ingredients = requiredIngredients(parentA.id, parentB.id);

    if (!creative && !this.canAfford(parentA.id, parentB.id)) {
      return {
        ok: false,
        reason: "insufficient_items",
        message: missingIngredientMessage(this.#materialWorld, ingredients),
        consumedIngredients: false,
      };
    }

    const result = this.#materialWorld.combine(
      parentA.id,
      parentB.id,
      stationType,
    );

    if (!result.ok) {
      const consumedIngredients =
        !creative &&
        result.reason === "unstable_reaction" &&
        result.unstableOutcome?.consumesIngredients === true
          ? this.#consumeIngredients(ingredients)
          : false;

      if (consumedIngredients) {
        this.#onSaveRequested();
      }

      return {
        ok: false,
        reason: result.reason,
        message: result.message,
        recipeKey: result.recipeKey,
        requiredResearchTier: result.requiredResearchTier,
        unstableOutcome: result.unstableOutcome,
        consumedIngredients,
      };
    }

    const consumedIngredients = creative
      ? false
      : this.#consumeIngredients(ingredients);

    if (!creative && !consumedIngredients) {
      return {
        ok: false,
        reason: "insufficient_items",
        message: missingIngredientMessage(this.#materialWorld, ingredients),
        recipeKey: result.recipeKey,
        consumedIngredients: false,
      };
    }

    const discovered =
      result.discovered ||
      this.#materialWorld.discoverMaterial(result.material.id);
    const itemId = materialItemId(result.material.id);

    if (!this.#inventory.addItem(itemId, 1)) {
      return {
        ok: false,
        reason: "inventory_full",
        message: "Inventory is full.",
        recipeKey: result.recipeKey,
        consumedIngredients,
      };
    }

    if (discovered) {
      this.#onMaterialDiscovered();
    }
    this.#onSaveRequested();

    return {
      ok: true,
      material: result.material,
      recipeKey: result.recipeKey,
      itemId,
      discovered,
      consumedIngredients,
      message: `Created ${result.material.name}.`,
    };
  }

  #consumeIngredients(ingredients: readonly RequiredIngredient[]): boolean {
    for (const ingredient of ingredients) {
      if (!this.#inventory.removeItem(ingredient.itemId, ingredient.count)) {
        return false;
      }
    }

    return true;
  }
}
