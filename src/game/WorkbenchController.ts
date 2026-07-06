import {
  CraftingController,
  recipeSummary,
  type CraftingInventory,
} from "../crafting/CraftingController.ts";
import {
  generatedMaterialRecipesForMaterials,
  type GeneratedMaterialRecipe,
} from "../crafting/GeneratedMaterialRecipes.ts";
import {
  RECIPE_REGISTRY,
  recipeRequiredWorkbench,
} from "../crafting/RecipeRegistry.ts";
import type { Recipe } from "../crafting/RecipeTypes.ts";
import type { WorkbenchType } from "../crafting/WorkbenchTypes.ts";
import {
  itemDefinitionFor,
  itemIdForMaterial,
  materialIdFromItemId,
  type ItemDefinition,
  type ItemId,
} from "../items/ItemRegistry.ts";
import {
  MODIFIABLE_BASE_TOOL_IDS,
  type ModifiableBaseToolItemId,
} from "../items/ModifiedToolTypes.ts";
import type { MaterialItemResolver } from "../items/MaterialItemResolver.ts";
import {
  classifyMaterialCapabilities,
  type MaterialCapabilities,
} from "../materials/MaterialCapabilities.ts";
import { materialResearchRequirementMessage } from "../materials/MaterialResearch.ts";
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
  | "research_locked"
  | "missing_capability"
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

function generatedMaterialIdForRecipe(recipe: Recipe): string | null {
  if ("generatedMaterialId" in recipe) {
    return typeof recipe.generatedMaterialId === "string"
      ? recipe.generatedMaterialId
      : null;
  }

  if (recipe.type !== "shapeless") {
    return null;
  }

  for (const input of recipe.inputs) {
    const materialId = materialIdFromItemId(input.itemId);

    if (materialId) {
      return materialId;
    }
  }

  return null;
}

function materialMeetsRecipeCapabilities(
  material: MaterialDefinition,
  requirements: NonNullable<Recipe["requiredMaterialCapabilities"]>,
): boolean {
  const capabilities = classifyMaterialCapabilities(material);

  return Object.entries(requirements).every(([key, minimum]) => {
    if (typeof minimum !== "number") {
      return true;
    }

    return capabilities[key as keyof MaterialCapabilities] >= minimum;
  });
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
    return this.#crafting
      .recipesForWorkbench(workbenchType)
      .filter((recipe) => this.#recipeGateAllows(recipe));
  }

  recipeById(recipeId: string): Recipe | null {
    return this.#crafting.recipeById(recipeId);
  }

  canCraft(recipe: Recipe): boolean {
    return this.#recipeGateAllows(recipe) && this.#crafting.canCraft(recipe);
  }

  countItem(itemId: ItemId): number {
    return this.#inventory.countItem(itemId);
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

    if (recipeRequiredWorkbench(recipe) !== workbenchType) {
      return {
        ok: false,
        reason: "wrong_workbench",
        recipe,
        message: `${recipe.displayName} requires a different workbench.`,
      };
    }

    if (!this.#recipeResearchAllows(recipe)) {
      return {
        ok: false,
        reason: "research_locked",
        recipe,
        message: recipe.requiredResearchTier
          ? materialResearchRequirementMessage(recipe.requiredResearchTier)
          : "Research required.",
      };
    }

    if (!this.#recipeCapabilitiesAllow(recipe)) {
      return {
        ok: false,
        reason: "missing_capability",
        recipe,
        message: "Material capability requirements are not met.",
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

  #recipeGateAllows(recipe: Recipe): boolean {
    return (
      this.#recipeResearchAllows(recipe) &&
      this.#recipeCapabilitiesAllow(recipe)
    );
  }

  #recipeResearchAllows(recipe: Recipe): boolean {
    return recipe.requiredResearchTier
      ? this.#materialWorld.canUseResearchTier(recipe.requiredResearchTier)
      : true;
  }

  #recipeCapabilitiesAllow(recipe: Recipe): boolean {
    const requirements = recipe.requiredMaterialCapabilities;

    if (!requirements) {
      return true;
    }

    const materialId = generatedMaterialIdForRecipe(recipe);
    const material = materialId
      ? this.#materialWorld.getMaterialById(materialId)
      : null;

    return material
      ? materialMeetsRecipeCapabilities(material, requirements)
      : false;
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
