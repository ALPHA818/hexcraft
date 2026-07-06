import type { ItemId } from "../items/ItemRegistry.ts";
import type { MaterialCapabilityKey } from "../materials/MaterialCapabilities.ts";
import type { MaterialResearchTier } from "../materials/MaterialTypes.ts";
import type { WorkbenchType } from "./WorkbenchTypes.ts";

export type CraftingStation = WorkbenchType;

export type RecipeMaterialCapabilityRequirements = Readonly<
  Partial<Record<MaterialCapabilityKey, number>>
>;

export type RecipeStack = Readonly<{
  itemId: ItemId;
  count: number;
}>;

export type BaseRecipe = Readonly<{
  id: string;
  displayName: string;
  outputs: readonly RecipeStack[];
  requiredWorkbench: WorkbenchType;
  workbenchType: WorkbenchType;
  requiredResearchTier?: MaterialResearchTier;
  requiredMaterialCapabilities?: RecipeMaterialCapabilityRequirements;
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
