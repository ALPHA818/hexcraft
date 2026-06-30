import type { ItemId } from "../items/ItemRegistry.ts";
import {
  recipeById,
  recipesForStation as registryRecipesForStation,
} from "./RecipeRegistry.ts";
import type { CraftingStation, Recipe, RecipeStack } from "./RecipeTypes.ts";

export type CraftingInventory = Readonly<{
  isCreative: () => boolean;
  countItem: (itemId: ItemId) => number;
  addItem: (itemId: ItemId, count: number) => boolean;
  removeItem: (itemId: ItemId, count: number) => boolean;
}>;

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

  constructor(
    inventory: CraftingInventory,
    recipes: readonly Recipe[] = registryRecipesForStation("inventory"),
  ) {
    this.#inventory = inventory;
    this.#recipes = recipes;
  }

  recipesForStation(station: CraftingStation): readonly Recipe[] {
    return this.#recipes.filter((recipe) => recipe.station === station);
  }

  recipeById(recipeId: string): Recipe | null {
    return this.#recipes.find((recipe) => recipe.id === recipeId) ?? null;
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

    for (const output of recipe.outputs) {
      if (!this.#inventory.addItem(output.itemId, output.count)) {
        return false;
      }
    }

    return true;
  }
}
