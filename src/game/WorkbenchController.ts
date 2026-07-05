import {
  CraftingController,
  recipeSummary,
  type CraftingInventory,
} from "../crafting/CraftingController.ts";
import {
  generatedMaterialRecipesForMaterials,
  type GeneratedMaterialRecipe,
} from "../crafting/GeneratedMaterialRecipes.ts";
import { RECIPE_REGISTRY } from "../crafting/RecipeRegistry.ts";
import type { Recipe } from "../crafting/RecipeTypes.ts";
import type { WorkbenchType } from "../crafting/WorkbenchTypes.ts";
import {
  itemDefinitionFor,
  itemIdForMaterial,
  type ItemDefinition,
} from "../items/ItemRegistry.ts";
import {
  MODIFIABLE_BASE_TOOL_IDS,
  type ModifiableBaseToolItemId,
} from "../items/ModifiedToolTypes.ts";
import type { MaterialItemResolver } from "../items/MaterialItemResolver.ts";
import type { MaterialDefinition } from "../materials/MaterialTypes.ts";
import type { MaterialWorldController } from "./MaterialWorldController.ts";

export type WorkbenchInventory = CraftingInventory;

export type WorkbenchControllerOptions = Readonly<{
  inventory: WorkbenchInventory;
  materialWorld: MaterialWorldController;
  onCrafted?: (recipe: Recipe) => void;
  onSaveRequested?: () => void;
  openElementCombiner?: () => void;
}>;

export type WorkbenchCraftFailureReason =
  | "missing_recipe"
  | "wrong_workbench"
  | "missing_ingredients"
  | "output_blocked";

export type WorkbenchCraftResult =
  | Readonly<{
      ok: true;
      recipe: Recipe;
      message: string;
    }>
  | Readonly<{
      ok: false;
      reason: WorkbenchCraftFailureReason;
      recipe: Recipe | null;
      message: string;
    }>;

function uniqueRecipes(recipes: Iterable<Recipe>): readonly Recipe[] {
  const recipesById = new Map<string, Recipe>();

  for (const recipe of recipes) {
    recipesById.set(recipe.id, recipe);
  }

  return [...recipesById.values()];
}

function materialRecipesAvailableToInventory(
  inventory: WorkbenchInventory,
  materials: readonly MaterialDefinition[],
): readonly MaterialDefinition[] {
  if (inventory.isCreative()) {
    return materials;
  }

  return materials.filter(
    (material) => inventory.countItem(itemIdForMaterial(material.id)) > 0,
  );
}

function baseToolIdsAvailableToInventory(
  inventory: WorkbenchInventory,
): readonly ModifiableBaseToolItemId[] {
  if (inventory.isCreative()) {
    return MODIFIABLE_BASE_TOOL_IDS;
  }

  return MODIFIABLE_BASE_TOOL_IDS.filter(
    (itemId) => inventory.countItem(itemId) > 0,
  );
}

export class WorkbenchController implements MaterialItemResolver {
  readonly #inventory: WorkbenchInventory;
  readonly #materialWorld: MaterialWorldController;
  readonly #crafting: CraftingController;
  readonly #onCrafted: (recipe: Recipe) => void;
  readonly #onSaveRequested: () => void;
  readonly #openElementCombiner: () => void;

  constructor(options: WorkbenchControllerOptions) {
    this.#inventory = options.inventory;
    this.#materialWorld = options.materialWorld;
    this.#onCrafted = options.onCrafted ?? (() => {});
    this.#onSaveRequested = options.onSaveRequested ?? (() => {});
    this.#openElementCombiner = options.openElementCombiner ?? (() => {});
    this.#crafting = new CraftingController(
      this.#craftingInventory(),
      RECIPE_REGISTRY,
      () => this.#dynamicRecipes(),
    );
  }

  getMaterialById(materialId: string): MaterialDefinition | null {
    return this.#materialWorld.getMaterialById(materialId);
  }

  itemDefinitionFor(itemId: string): ItemDefinition | null {
    return itemDefinitionFor(itemId, this);
  }

  recipesForWorkbench(workbenchType: WorkbenchType): readonly Recipe[] {
    return this.#crafting.recipesForWorkbench(workbenchType);
  }

  recipeById(recipeId: string): Recipe | null {
    return this.#crafting.recipeById(recipeId);
  }

  canCraft(recipe: Recipe): boolean {
    return this.#crafting.canCraft(recipe);
  }

  craft(recipeId: string, workbenchType: WorkbenchType): WorkbenchCraftResult {
    const recipe = this.recipeById(recipeId);

    if (!recipe) {
      return {
        ok: false,
        reason: "missing_recipe",
        recipe: null,
        message: "Unknown recipe.",
      };
    }

    if (recipe.workbenchType !== workbenchType) {
      return {
        ok: false,
        reason: "wrong_workbench",
        recipe,
        message: `${recipe.displayName} requires a different workbench.`,
      };
    }

    if (!this.canCraft(recipe)) {
      return {
        ok: false,
        reason: "missing_ingredients",
        recipe,
        message: "Missing ingredients.",
      };
    }

    if (!this.#crafting.craft(recipe)) {
      return {
        ok: false,
        reason: "output_blocked",
        recipe,
        message: "Could not store crafted output.",
      };
    }

    this.#onCrafted(recipe);
    this.#onSaveRequested();

    return {
      ok: true,
      recipe,
      message: `Crafted ${recipe.displayName}.`,
    };
  }

  recipeSummary(recipe: Recipe): string {
    return recipeSummary(recipe);
  }

  openElementCombiner(): void {
    this.#openElementCombiner();
  }

  #craftingInventory(): CraftingInventory {
    return {
      isCreative: () => this.#inventory.isCreative(),
      countItem: (itemId) => this.#inventory.countItem(itemId),
      addItem: (itemId, count) => this.#inventory.addItem(itemId, count),
      grantItem: this.#inventory.grantItem
        ? (itemId, count) => this.#inventory.grantItem?.(itemId, count) ?? false
        : undefined,
      removeItem: (itemId, count) => this.#inventory.removeItem(itemId, count),
    };
  }

  #dynamicRecipes(): readonly GeneratedMaterialRecipe[] {
    const baseToolIds = baseToolIdsAvailableToInventory(this.#inventory);
    const materials = materialRecipesAvailableToInventory(
      this.#inventory,
      this.#materialWorld.listDiscoveredMaterials(),
    );

    return uniqueRecipes(
      generatedMaterialRecipesForMaterials(materials, { baseToolIds }),
    ) as readonly GeneratedMaterialRecipe[];
  }
}
