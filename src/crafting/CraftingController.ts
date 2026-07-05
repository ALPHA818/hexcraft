import type { ItemId } from "../items/ItemRegistry.ts";
import {
  recipeById,
  recipesForWorkbench as registryRecipesForWorkbench,
} from "./RecipeRegistry.ts";
import type { Recipe, RecipeStack } from "./RecipeTypes.ts";
import type { WorkbenchType } from "./WorkbenchTypes.ts";

export type CraftingInventory = Readonly<{
  isCreative: () => boolean;
  countItem: (itemId: ItemId) => number;
  addItem: (itemId: ItemId, count: number) => boolean;
  grantItem?: (itemId: ItemId, count: number) => boolean;
  removeItem: (itemId: ItemId, count: number) => boolean;
}>;

export type DynamicRecipeProvider = () => readonly Recipe[];

function stackLabel(stack: RecipeStack): string {
  return `${stack.count}× ${stack.itemId}`;
}

export function recipeSummary(recipe: Recipe): string {
  const inputs =
    recipe.type === "shapeless"
      ? recipe.inputs.map(stackLabel).join(" + ")
      : "shaped inputs";
  const outputs = recipe.outputs.map(stackLabel).join(" + ");

  return `${inputs} → ${outputs}`;
}

export class CraftingController {
  readonly #inventory: CraftingInventory;
  readonly #recipes: readonly Recipe[];
  readonly #dynamicRecipes: DynamicRecipeProvider;

  constructor(
    inventory: CraftingInventory,
    recipes: readonly Recipe[] = registryRecipesForWorkbench("basic"),
    dynamicRecipes: DynamicRecipeProvider = () => [],
  ) {
    this.#inventory = inventory;
    this.#recipes = recipes;
    this.#dynamicRecipes = dynamicRecipes;
  }

  recipesForWorkbench(workbenchType: WorkbenchType): readonly Recipe[] {
    return this.#allRecipes().filter(
      (recipe) => recipe.workbenchType === workbenchType,
    );
  }

  recipeById(recipeId: string): Recipe | null {
    return this.#allRecipes().find((recipe) => recipe.id === recipeId) ?? null;
  }

  canCraft(recipe: Recipe): boolean {
    if (this.#inventory.isCreative()) {
      return true;
    }

    if (recipe.type !== "shapeless") {
      return false;
    }

    return recipe.inputs.every(
      (input) => this.#inventory.countItem(input.itemId) >= input.count,
    );
  }

  craft(recipeOrId: Recipe | string): boolean {
    const recipe =
      typeof recipeOrId === "string"
        ? (this.recipeById(recipeOrId) ?? recipeById(recipeOrId))
        : recipeOrId;

    if (!recipe || !this.canCraft(recipe)) {
      return false;
    }

    if (!this.#inventory.isCreative() && recipe.type === "shapeless") {
      for (const input of recipe.inputs) {
        if (!this.#inventory.removeItem(input.itemId, input.count)) {
          return false;
        }
      }
    }

    const addOutput = this.#inventory.isCreative()
      ? (this.#inventory.grantItem ?? this.#inventory.addItem)
      : this.#inventory.addItem;

    for (const output of recipe.outputs) {
      if (!addOutput(output.itemId, output.count)) {
        return false;
      }
    }

    return true;
  }

  #allRecipes(): readonly Recipe[] {
    return [...this.#recipes, ...this.#dynamicRecipes()];
  }
}
