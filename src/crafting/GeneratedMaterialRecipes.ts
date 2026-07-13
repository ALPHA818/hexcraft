import {
  classifyMaterialCapabilities,
  type MaterialCapabilities,
  type MaterialCapabilityKey,
} from "../materials/MaterialCapabilities.ts";
import type { MaterialDefinition } from "../materials/MaterialTypes.ts";
import {
  itemDefinitionFor,
  itemIdForMaterial,
  modifiedToolItemId,
  modifiedToolRecipeId,
  type ItemId,
} from "../items/ItemRegistry.ts";
import {
  MODIFIABLE_BASE_TOOL_IDS,
  type ModifiableBaseToolItemId,
} from "../items/ModifiedToolTypes.ts";
import type { Recipe, ShapelessRecipe } from "./RecipeTypes.ts";
import type { WorkbenchType } from "./WorkbenchTypes.ts";

export type GeneratedMaterialRecipeKind =
  | "tool_upgrade"
  | "stabilized_block"
  | "fuel_cell"
  | "magic_core"
  | "explosive_compound"
  | "circuit";

export type GeneratedMaterialRecipe = Recipe &
  Readonly<{
    generatedMaterialId: string;
    generatedRecipeKind: GeneratedMaterialRecipeKind;
    capabilityGrade: number;
  }>;

export type GeneratedMaterialRecipeOptions = Readonly<{
  baseToolIds?: readonly ModifiableBaseToolItemId[];
}>;

export const GENERATED_MATERIAL_RECIPE_THRESHOLDS = {
  toolGrade: 62,
  buildingGrade: 62,
  fuelGrade: 68,
  magicFocusGrade: 68,
  explosiveGrade: 70,
  conductorGrade: 68,
} as const satisfies Partial<Record<keyof MaterialCapabilities, number>>;

export const GENERATED_MATERIAL_RECIPE_OUTPUTS = {
  fuelCell: "material:fuel_cell",
  magicCore: "material:magic_core",
  explosiveCompound: "material:explosive_compound",
  circuit: "material:circuit",
} as const satisfies Record<string, ItemId>;

const GENERATED_MATERIAL_RECIPE_CAPABILITIES = {
  tool_upgrade: "toolGrade",
  stabilized_block: "buildingGrade",
  fuel_cell: "fuelGrade",
  magic_core: "magicFocusGrade",
  explosive_compound: "explosiveGrade",
  circuit: "conductorGrade",
} as const satisfies Record<GeneratedMaterialRecipeKind, MaterialCapabilityKey>;

function materialRecipeId(
  kind: GeneratedMaterialRecipeKind,
  materialId: string,
): string {
  return `generated-material:${kind}:${materialId}`;
}

function materialItemInput(material: MaterialDefinition, count = 1) {
  return { itemId: itemIdForMaterial(material.id), count };
}

export function workbenchForGeneratedMaterialRecipe(
  kind: GeneratedMaterialRecipeKind,
): WorkbenchType {
  if (kind === "tool_upgrade") {
    return "assembler";
  }
  if (kind === "stabilized_block") {
    return "assembler";
  }
  if (kind === "magic_core") {
    return "magic";
  }
  if (kind === "circuit") {
    return "metal";
  }

  return "chemical";
}

function materialRecipe(
  material: MaterialDefinition,
  kind: GeneratedMaterialRecipeKind,
  capabilityGrade: number,
  recipe: Omit<
    ShapelessRecipe,
    "type" | "workbenchType" | "requiredWorkbench"
  > &
    Partial<Pick<ShapelessRecipe, "workbenchType" | "requiredWorkbench">>,
): GeneratedMaterialRecipe {
  const requiredWorkbench =
    recipe.requiredWorkbench ??
    recipe.workbenchType ??
    workbenchForGeneratedMaterialRecipe(kind);
  const capabilityKey = GENERATED_MATERIAL_RECIPE_CAPABILITIES[kind];

  return {
    type: "shapeless",
    ...recipe,
    requiredWorkbench,
    workbenchType: requiredWorkbench,
    requiredResearchTier: material.requiredResearchTier,
    requiredMaterialCapabilities: {
      [capabilityKey]: GENERATED_MATERIAL_RECIPE_THRESHOLDS[capabilityKey],
    },
    generatedMaterialId: material.id,
    generatedRecipeKind: kind,
    capabilityGrade,
  };
}

function toolUpgradeRecipes(
  material: MaterialDefinition,
  capabilityGrade: number,
  baseToolIds: readonly ModifiableBaseToolItemId[],
): readonly GeneratedMaterialRecipe[] {
  return baseToolIds.flatMap((baseToolId) => {
    const baseTool = itemDefinitionFor(baseToolId);

    if (!baseTool || baseTool.kind !== "tool") {
      return [];
    }

    return [
      materialRecipe(material, "tool_upgrade", capabilityGrade, {
        id: modifiedToolRecipeId(baseToolId, material.id),
        displayName: `${material.name} ${baseTool.shortName}`,
        inputs: [{ itemId: baseToolId, count: 1 }, materialItemInput(material)],
        outputs: [
          {
            itemId: modifiedToolItemId(baseToolId, material.id),
            count: 1,
          },
        ],
      }),
    ];
  });
}

export function generatedMaterialRecipesForMaterial(
  material: MaterialDefinition,
  options: GeneratedMaterialRecipeOptions = {},
): readonly GeneratedMaterialRecipe[] {
  const capabilities = classifyMaterialCapabilities(material);
  const recipes: GeneratedMaterialRecipe[] = [];
  const baseToolIds = options.baseToolIds ?? MODIFIABLE_BASE_TOOL_IDS;

  if (
    capabilities.toolGrade >= GENERATED_MATERIAL_RECIPE_THRESHOLDS.toolGrade
  ) {
    recipes.push(
      ...toolUpgradeRecipes(material, capabilities.toolGrade, baseToolIds),
    );
  }

  if (
    capabilities.buildingGrade >=
    GENERATED_MATERIAL_RECIPE_THRESHOLDS.buildingGrade
  ) {
    recipes.push(
      materialRecipe(material, "stabilized_block", capabilities.buildingGrade, {
        id: materialRecipeId("stabilized_block", material.id),
        displayName: `Stabilized ${material.name} Block`,
        inputs: [materialItemInput(material)],
        outputs: [materialItemInput(material)],
      }),
    );
  }

  if (
    capabilities.fuelGrade >= GENERATED_MATERIAL_RECIPE_THRESHOLDS.fuelGrade
  ) {
    recipes.push(
      materialRecipe(material, "fuel_cell", capabilities.fuelGrade, {
        id: materialRecipeId("fuel_cell", material.id),
        displayName: `${material.name} Fuel Cell`,
        inputs: [materialItemInput(material)],
        outputs: [
          { itemId: GENERATED_MATERIAL_RECIPE_OUTPUTS.fuelCell, count: 1 },
        ],
      }),
    );
  }

  if (
    capabilities.magicFocusGrade >=
    GENERATED_MATERIAL_RECIPE_THRESHOLDS.magicFocusGrade
  ) {
    recipes.push(
      materialRecipe(material, "magic_core", capabilities.magicFocusGrade, {
        id: materialRecipeId("magic_core", material.id),
        displayName: `${material.name} Magic Core`,
        inputs: [materialItemInput(material)],
        outputs: [
          { itemId: GENERATED_MATERIAL_RECIPE_OUTPUTS.magicCore, count: 1 },
        ],
      }),
    );
  }

  if (
    capabilities.explosiveGrade >=
    GENERATED_MATERIAL_RECIPE_THRESHOLDS.explosiveGrade
  ) {
    recipes.push(
      materialRecipe(
        material,
        "explosive_compound",
        capabilities.explosiveGrade,
        {
          id: materialRecipeId("explosive_compound", material.id),
          displayName: `${material.name} Explosive Compound`,
          inputs: [materialItemInput(material)],
          outputs: [
            {
              itemId: GENERATED_MATERIAL_RECIPE_OUTPUTS.explosiveCompound,
              count: 1,
            },
          ],
        },
      ),
    );
  }

  if (
    capabilities.conductorGrade >=
    GENERATED_MATERIAL_RECIPE_THRESHOLDS.conductorGrade
  ) {
    recipes.push(
      materialRecipe(material, "circuit", capabilities.conductorGrade, {
        id: materialRecipeId("circuit", material.id),
        displayName: `${material.name} Circuit`,
        inputs: [materialItemInput(material)],
        outputs: [
          { itemId: GENERATED_MATERIAL_RECIPE_OUTPUTS.circuit, count: 1 },
        ],
      }),
    );
  }

  return recipes;
}

export function generatedMaterialRecipesForMaterials(
  materials: Iterable<MaterialDefinition>,
  options: GeneratedMaterialRecipeOptions = {},
): readonly GeneratedMaterialRecipe[] {
  const uniqueMaterials = new Map<string, MaterialDefinition>();

  for (const material of materials) {
    uniqueMaterials.set(material.id, material);
  }

  return [...uniqueMaterials.values()].flatMap((material) =>
    generatedMaterialRecipesForMaterial(material, options),
  );
}
