import type { Recipe, ShapelessRecipe } from "./RecipeTypes.ts";
import type { WorkbenchType } from "./WorkbenchTypes.ts";

function shapelessRecipe(
  recipe: Omit<
    ShapelessRecipe,
    "type" | "workbenchType" | "requiredWorkbench"
  > &
    Partial<Pick<ShapelessRecipe, "workbenchType" | "requiredWorkbench">>,
): ShapelessRecipe {
  const requiredWorkbench =
    recipe.requiredWorkbench ?? recipe.workbenchType ?? "basic";

  return {
    type: "shapeless",
    ...recipe,
    requiredWorkbench,
    workbenchType: requiredWorkbench,
  };
}

export const RECIPE_REGISTRY = [
  shapelessRecipe({
    id: "wood_to_planks",
    displayName: "Wood Planks",
    inputs: [{ itemId: "block:wood", count: 1 }],
    outputs: [{ itemId: "block:planks", count: 4 }],
  }),
  shapelessRecipe({
    id: "planks_to_sticks",
    displayName: "Sticks",
    inputs: [{ itemId: "block:planks", count: 2 }],
    outputs: [{ itemId: "material:stick", count: 4 }],
  }),
  shapelessRecipe({
    id: "wooden_pickaxe",
    displayName: "Wooden Pickaxe",
    inputs: [
      { itemId: "block:planks", count: 3 },
      { itemId: "material:stick", count: 2 },
    ],
    outputs: [{ itemId: "tool:pickaxe", count: 1 }],
  }),
  shapelessRecipe({
    id: "wooden_axe",
    displayName: "Wooden Axe",
    inputs: [
      { itemId: "block:planks", count: 3 },
      { itemId: "material:stick", count: 2 },
    ],
    outputs: [{ itemId: "tool:axe", count: 1 }],
  }),
  shapelessRecipe({
    id: "wooden_shovel",
    displayName: "Wooden Shovel",
    inputs: [
      { itemId: "block:planks", count: 1 },
      { itemId: "material:stick", count: 2 },
    ],
    outputs: [{ itemId: "tool:shovel", count: 1 }],
  }),
  shapelessRecipe({
    id: "basic_workbench",
    displayName: "Basic Workbench",
    inputs: [{ itemId: "block:planks", count: 4 }],
    outputs: [{ itemId: "block:basic_workbench", count: 1 }],
  }),
  shapelessRecipe({
    id: "metal_workbench_iron",
    displayName: "Metal Workbench",
    requiredWorkbench: "basic",
    inputs: [
      { itemId: "block:stone", count: 1 },
      { itemId: "material:coal", count: 1 },
      { itemId: "material:raw_iron", count: 1 },
    ],
    outputs: [{ itemId: "block:metal_workbench", count: 1 }],
  }),
  shapelessRecipe({
    id: "metal_workbench_copper",
    displayName: "Metal Workbench",
    requiredWorkbench: "basic",
    inputs: [
      { itemId: "block:stone", count: 1 },
      { itemId: "material:coal", count: 1 },
      { itemId: "material:raw_copper", count: 1 },
    ],
    outputs: [{ itemId: "block:metal_workbench", count: 1 }],
  }),
  shapelessRecipe({
    id: "magic_workbench",
    displayName: "Magic Workbench",
    requiredWorkbench: "basic",
    inputs: [
      { itemId: "material:crystal", count: 1 },
      { itemId: "block:planks", count: 1 },
      { itemId: "block:torch", count: 1 },
    ],
    outputs: [{ itemId: "block:magic_workbench", count: 1 }],
  }),
  shapelessRecipe({
    id: "organic_workbench",
    displayName: "Organic Workbench",
    requiredWorkbench: "basic",
    inputs: [
      { itemId: "block:wood", count: 1 },
      { itemId: "block:leaves", count: 1 },
      { itemId: "block:dirt", count: 1 },
    ],
    outputs: [{ itemId: "block:organic_workbench", count: 1 }],
  }),
  shapelessRecipe({
    id: "crystal_workbench",
    displayName: "Crystal Workbench",
    requiredWorkbench: "basic",
    inputs: [
      { itemId: "material:crystal", count: 1 },
      { itemId: "block:stone", count: 1 },
      { itemId: "block:sand", count: 1 },
    ],
    outputs: [{ itemId: "block:crystal_workbench", count: 1 }],
  }),
  shapelessRecipe({
    id: "chemical_workbench",
    displayName: "Chemical Workbench",
    requiredWorkbench: "basic",
    inputs: [
      { itemId: "block:sand", count: 1 },
      { itemId: "material:raw_copper", count: 1 },
      { itemId: "material:coal", count: 1 },
    ],
    outputs: [{ itemId: "block:chemical_workbench", count: 1 }],
  }),
  shapelessRecipe({
    id: "assembler_workbench_iron",
    displayName: "Assembler Workbench",
    requiredWorkbench: "basic",
    inputs: [
      { itemId: "block:planks", count: 1 },
      { itemId: "material:raw_iron", count: 1 },
      { itemId: "material:stick", count: 1 },
    ],
    outputs: [{ itemId: "block:assembler_workbench", count: 1 }],
  }),
  shapelessRecipe({
    id: "assembler_workbench_copper",
    displayName: "Assembler Workbench",
    requiredWorkbench: "basic",
    inputs: [
      { itemId: "block:planks", count: 1 },
      { itemId: "material:raw_copper", count: 1 },
      { itemId: "material:stick", count: 1 },
    ],
    outputs: [{ itemId: "block:assembler_workbench", count: 1 }],
  }),
  shapelessRecipe({
    id: "element_combiner_station",
    displayName: "Element Combiner",
    inputs: [
      { itemId: "material:crystal", count: 1 },
      { itemId: "block:planks", count: 1 },
      { itemId: "block:stone", count: 1 },
    ],
    outputs: [{ itemId: "block:element_combiner", count: 1 }],
  }),
  shapelessRecipe({
    id: "forge_station_iron",
    displayName: "Forge Station",
    requiredWorkbench: "metal",
    inputs: [
      { itemId: "block:stone", count: 1 },
      { itemId: "material:coal", count: 1 },
      { itemId: "material:raw_iron", count: 1 },
    ],
    outputs: [{ itemId: "block:forge_station", count: 1 }],
  }),
  shapelessRecipe({
    id: "forge_station_copper",
    displayName: "Forge Station",
    requiredWorkbench: "metal",
    inputs: [
      { itemId: "block:stone", count: 1 },
      { itemId: "material:coal", count: 1 },
      { itemId: "material:raw_copper", count: 1 },
    ],
    outputs: [{ itemId: "block:forge_station", count: 1 }],
  }),
  shapelessRecipe({
    id: "crystallizer_station",
    displayName: "Crystallizer",
    requiredWorkbench: "crystal",
    inputs: [
      { itemId: "material:crystal", count: 1 },
      { itemId: "block:stone", count: 1 },
    ],
    outputs: [{ itemId: "block:crystallizer_station", count: 1 }],
  }),
  shapelessRecipe({
    id: "distiller_station",
    displayName: "Distiller",
    requiredWorkbench: "chemical",
    inputs: [
      { itemId: "block:sand", count: 1 },
      { itemId: "material:raw_copper", count: 1 },
    ],
    outputs: [{ itemId: "block:distiller_station", count: 1 }],
  }),
  shapelessRecipe({
    id: "stabilizer_station",
    displayName: "Stabilizer",
    requiredWorkbench: "metal",
    inputs: [
      { itemId: "material:crystal", count: 1 },
      { itemId: "material:raw_iron", count: 1 },
      { itemId: "material:coal", count: 1 },
    ],
    outputs: [{ itemId: "block:stabilizer_station", count: 1 }],
  }),
  shapelessRecipe({
    id: "infuser_station",
    displayName: "Infuser",
    requiredWorkbench: "magic",
    inputs: [
      { itemId: "material:crystal", count: 1 },
      { itemId: "material:coal", count: 1 },
    ],
    outputs: [{ itemId: "block:infuser_station", count: 1 }],
  }),
  shapelessRecipe({
    id: "assembler_station_iron",
    displayName: "Assembler",
    requiredWorkbench: "metal",
    inputs: [
      { itemId: "block:planks", count: 1 },
      { itemId: "material:raw_iron", count: 1 },
    ],
    outputs: [{ itemId: "block:assembler_station", count: 1 }],
  }),
  shapelessRecipe({
    id: "assembler_station_copper",
    displayName: "Assembler",
    requiredWorkbench: "metal",
    inputs: [
      { itemId: "block:planks", count: 1 },
      { itemId: "material:raw_copper", count: 1 },
    ],
    outputs: [{ itemId: "block:assembler_station", count: 1 }],
  }),
] as const satisfies readonly Recipe[];

export function recipeById(recipeId: string): Recipe | null {
  return RECIPE_REGISTRY.find((recipe) => recipe.id === recipeId) ?? null;
}

export function recipesForWorkbench(
  workbenchType: WorkbenchType,
): readonly Recipe[] {
  return RECIPE_REGISTRY.filter(
    (recipe) => recipeRequiredWorkbench(recipe) === workbenchType,
  );
}

export const recipesForStation = recipesForWorkbench;

export function recipeWorkbenchType(recipe: Recipe): WorkbenchType {
  return recipeRequiredWorkbench(recipe);
}

export function recipeRequiredWorkbench(recipe: Recipe): WorkbenchType {
  return recipe.requiredWorkbench ?? recipe.workbenchType;
}
