import type { MaterialDefinition } from "../materials/MaterialTypes.ts";

const GENERATED_MATERIAL_ITEM_PREFIX = "generated-material:";

export type GeneratedMaterialItemId =
  `${typeof GENERATED_MATERIAL_ITEM_PREFIX}${string}`;

export type MaterialItemResolver = Readonly<{
  getMaterialById: (materialId: string) => MaterialDefinition | null;
}>;

export type GeneratedMaterialItemDefinition = Readonly<{
  id: GeneratedMaterialItemId;
  displayName: string;
  shortName: string;
  maxStackSize: 64;
  placeable: false;
  kind: "generated_material";
  materialId: string;
  material: MaterialDefinition | null;
}>;

export function itemIdForMaterial(materialId: string): GeneratedMaterialItemId {
  return `${GENERATED_MATERIAL_ITEM_PREFIX}${materialId}` as GeneratedMaterialItemId;
}

export function materialIdFromItemId(itemId: string): string | null {
  if (!itemId.startsWith(GENERATED_MATERIAL_ITEM_PREFIX)) {
    return null;
  }

  const materialId = itemId.slice(GENERATED_MATERIAL_ITEM_PREFIX.length);

  return materialId.trim() === "" ? null : materialId;
}

export function isGeneratedMaterialItemId(
  itemId: string,
): itemId is GeneratedMaterialItemId {
  return materialIdFromItemId(itemId) !== null;
}

export function generatedMaterialItemDefinitionFor(
  itemId: string,
  resolver: MaterialItemResolver | null | undefined,
): GeneratedMaterialItemDefinition | null {
  const materialId = materialIdFromItemId(itemId);

  if (!materialId) {
    return null;
  }

  const material = resolver?.getMaterialById(materialId) ?? null;

  return {
    id: itemIdForMaterial(material?.id ?? materialId),
    displayName: material?.name ?? "Unknown Material",
    shortName: material?.name ?? "Unknown Material",
    maxStackSize: 64,
    placeable: false,
    kind: "generated_material",
    materialId: material?.id ?? materialId,
    material,
  };
}
