import type {
  CraftingStation,
  Recipe,
  ShapelessRecipe,
} from "./RecipeTypes.ts";

function shapelessRecipe(
  recipe: Omit<ShapelessRecipe, "type" | "station"> &
    Partial<Pick<ShapelessRecipe, "station">>,
): ShapelessRecipe {
  return {
    type: "shapeless",
    station: "inventory",
    ...recipe,
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
    inputs: [
      { itemId: "material:crystal", count: 1 },
      { itemId: "block:stone", count: 1 },
    ],
    outputs: [{ itemId: "block:crystallizer_station", count: 1 }],
  }),
  shapelessRecipe({
    id: "distiller_station",
    displayName: "Distiller",
    inputs: [
      { itemId: "block:sand", count: 1 },
      { itemId: "material:raw_copper", count: 1 },
    ],
    outputs: [{ itemId: "block:distiller_station", count: 1 }],
  }),
  shapelessRecipe({
    id: "stabilizer_station",
    displayName: "Stabilizer",
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
    inputs: [
      { itemId: "material:crystal", count: 1 },
      { itemId: "material:coal", count: 1 },
    ],
    outputs: [{ itemId: "block:infuser_station", count: 1 }],
  }),
  shapelessRecipe({
    id: "assembler_station_iron",
    displayName: "Assembler",
    inputs: [
      { itemId: "block:planks", count: 1 },
      { itemId: "material:raw_iron", count: 1 },
    ],
    outputs: [{ itemId: "block:assembler_station", count: 1 }],
  }),
  shapelessRecipe({
    id: "assembler_station_copper",
    displayName: "Assembler",
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

export function recipesForStation(station: CraftingStation): readonly Recipe[] {
  return RECIPE_REGISTRY.filter((recipe) => recipe.station === station);
}
