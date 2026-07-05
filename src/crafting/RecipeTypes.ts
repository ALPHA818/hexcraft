import type { ItemId } from "../items/ItemRegistry.ts";
import type { WorkbenchType } from "./WorkbenchTypes.ts";

export type CraftingStation = WorkbenchType;

export type RecipeStack = Readonly<{
  itemId: ItemId;
  count: number;
}>;

export type BaseRecipe = Readonly<{
  id: string;
  displayName: string;
  outputs: readonly RecipeStack[];
  workbenchType: WorkbenchType;
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
