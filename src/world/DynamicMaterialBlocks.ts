import type { TerrainMaterial } from "../geometry/terrainChunk.ts";
import {
  itemIdForMaterial,
  type GeneratedMaterialItemId,
  type MaterialItemResolver,
} from "../items/MaterialItemResolver.ts";
import {
  materialVisualsForMaterial,
  UNKNOWN_MATERIAL_VISUALS,
  type MaterialVisuals,
} from "../materials/MaterialVisuals.ts";
import { voxelKey, type VoxelPosition } from "./voxelRules.ts";

export const DYNAMIC_MATERIAL_BLOCK_ID = "dynamic_material_block";
export const DYNAMIC_MATERIAL_BLOCK_DISPLAY_NAME = "Stabilized Material";
export const UNKNOWN_DYNAMIC_MATERIAL_BLOCK_DISPLAY_NAME =
  "Unknown Stabilized Material";
export const DYNAMIC_MATERIAL_BLOCK_TEXTURE = "dynamic_material";
export const DYNAMIC_MATERIAL_TERRAIN_MATERIAL =
  23 as TerrainMaterial.DynamicMaterial;

export type DynamicMaterialBlockPlacement = Readonly<{
  material: TerrainMaterial.DynamicMaterial;
  materialId: string;
}>;

export function isDynamicMaterialBlock(
  material: TerrainMaterial,
): material is TerrainMaterial.DynamicMaterial {
  return material === DYNAMIC_MATERIAL_TERRAIN_MATERIAL;
}

export function dynamicMaterialVoxelKey(position: VoxelPosition): string {
  return voxelKey(position.q, position.r, position.level);
}

export function normalizeDynamicMaterialId(
  materialId: string | null | undefined,
): string | null {
  if (typeof materialId !== "string") {
    return null;
  }

  const normalized = materialId.trim();

  return normalized === "" ? null : normalized;
}

export function dynamicMaterialBlockPlacement(
  materialId: string,
): DynamicMaterialBlockPlacement | null {
  const normalizedMaterialId = normalizeDynamicMaterialId(materialId);

  return normalizedMaterialId
    ? {
        material: DYNAMIC_MATERIAL_TERRAIN_MATERIAL,
        materialId: normalizedMaterialId,
      }
    : null;
}

export function dynamicMaterialBlockDisplayName(
  materialId: string | null | undefined,
  resolver: MaterialItemResolver | null | undefined,
): string {
  const normalizedMaterialId = normalizeDynamicMaterialId(materialId);

  if (!normalizedMaterialId) {
    return DYNAMIC_MATERIAL_BLOCK_DISPLAY_NAME;
  }

  return (
    resolver?.getMaterialById(normalizedMaterialId)?.name ??
    UNKNOWN_DYNAMIC_MATERIAL_BLOCK_DISPLAY_NAME
  );
}

export function dynamicMaterialBlockVisuals(
  materialId: string | null | undefined,
  resolver: MaterialItemResolver | null | undefined,
): MaterialVisuals {
  const normalizedMaterialId = normalizeDynamicMaterialId(materialId);
  const material = normalizedMaterialId
    ? resolver?.getMaterialById(normalizedMaterialId)
    : null;

  return material
    ? materialVisualsForMaterial(material)
    : UNKNOWN_MATERIAL_VISUALS;
}

export function dynamicMaterialBlockDropItemId(
  materialId: string | null | undefined,
  resolver: MaterialItemResolver | null | undefined,
): GeneratedMaterialItemId | null {
  const normalizedMaterialId = normalizeDynamicMaterialId(materialId);
  const material = normalizedMaterialId
    ? resolver?.getMaterialById(normalizedMaterialId)
    : null;

  return material ? itemIdForMaterial(material.id) : null;
}
