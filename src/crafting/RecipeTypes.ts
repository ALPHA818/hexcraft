import type { ItemId } from "../items/ItemRegistry.ts";

export type CraftingStation = "inventory" | "crafting_table" | "furnace";

export type RecipeStack = Readonly<{
  itemId: ItemId;
  count: number;
}>;

export type BaseRecipe = Readonly<{
  id: string;
  displayName: string;
  outputs: readonly RecipeStack[];
  station: CraftingStation;
}>;

export type ShapelessRecipe = BaseRecipe &
  Readonly<{
    type: "shapeless";
    inputs: readonly RecipeStack[];
  }>;

export type ShapedRecipe = BaseRecipe &
  Readonly<{
    type: "shaped";
    pattern: readonly string[];
    keys: Readonly<Record<string, RecipeStack>>;
  }>;

export type Recipe = ShapelessRecipe | ShapedRecipe;
