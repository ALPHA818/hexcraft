import {
  DEFAULT_MATERIAL_CONFIG,
  type MaterialConfig,
} from "./MaterialConfig.ts";
import { BASE_ELEMENT_MATERIALS } from "./BaseElements.ts";
import {
  legacyRecipeKeyForMaterialIds,
  recipeKeyForMaterialIds,
} from "./MaterialReactions.ts";
import type {
  MaterialDefinition,
  MaterialProcessingStationType,
} from "./MaterialTypes.ts";

export type MaterialRecipeResult = Readonly<{
  recipeKey: string;
  resultMaterialId: string;
}>;

export class MaterialRegistry {
  readonly #materialsById = new Map<string, MaterialDefinition>();
  readonly #materialsByName = new Map<string, MaterialDefinition>();
  readonly #recipeResults = new Map<string, string>();
  readonly #discoveredBaseMaterialIds = new Set<string>();
  readonly #config: MaterialConfig;

  constructor(config: MaterialConfig = DEFAULT_MATERIAL_CONFIG) {
    this.#config = config;
  }

  registerBaseMaterials(
    materials: readonly MaterialDefinition[] = BASE_ELEMENT_MATERIALS,
    discoveredMaterialIds: Iterable<string> | null = materials.map(
      (material) => material.id,
    ),
  ): void {
    const discoveredIds = discoveredMaterialIds
      ? new Set(discoveredMaterialIds)
      : new Set<string>();

    for (const material of materials) {
      this.#registerMaterial(material);
      if (discoveredIds.has(material.id)) {
        this.#discoveredBaseMaterialIds.add(material.id);
      }
    }
  }

  getMaterialById(id: string): MaterialDefinition | null {
    return this.#materialsById.get(id) ?? null;
  }

  getMaterialByName(name: string): MaterialDefinition | null {
    return this.#materialsByName.get(name.toLowerCase()) ?? null;
  }

  hasMaterial(id: string): boolean {
    return this.#materialsById.has(id);
  }

  allMaterials(): readonly MaterialDefinition[] {
    return [...this.#materialsById.values()];
  }

  allDiscoveredMaterials(): readonly MaterialDefinition[] {
    return this.allMaterials().filter(
      (material) =>
        (material.generation === 0 &&
          this.#discoveredBaseMaterialIds.has(material.id)) ||
        (material.generation > 0 && material.discoveredAt !== undefined),
    );
  }

  discoveredMaterialIds(): readonly string[] {
    return this.allDiscoveredMaterials()
      .map((material) => material.id)
      .sort();
  }

  hasDiscoveredMaterial(materialId: string): boolean {
    const material = this.getMaterialById(materialId);

    if (!material) {
      return false;
    }

    return material.generation === 0
      ? this.#discoveredBaseMaterialIds.has(material.id)
      : material.discoveredAt !== undefined;
  }

  discoverBaseMaterial(materialId: string): boolean {
    const material = this.getMaterialById(materialId);

    if (
      !material ||
      material.generation !== 0 ||
      this.#discoveredBaseMaterialIds.has(material.id)
    ) {
      return false;
    }

    this.#discoveredBaseMaterialIds.add(material.id);
    return true;
  }

  discoverMaterial(materialId: string, discoveredAt = 0): boolean {
    const material = this.getMaterialById(materialId);

    if (!material || this.hasDiscoveredMaterial(material.id)) {
      return false;
    }
    if (material.generation === 0) {
      this.#discoveredBaseMaterialIds.add(material.id);
      return true;
    }

    const discoveredMaterial = {
      ...material,
      discoveredAt,
    };

    this.#materialsById.set(discoveredMaterial.id, discoveredMaterial);
    this.#materialsByName.set(
      discoveredMaterial.name.toLowerCase(),
      discoveredMaterial,
    );
    return true;
  }

  allRecipeResults(): readonly MaterialRecipeResult[] {
    return [...this.#recipeResults.entries()]
      .map(([recipeKey, resultMaterialId]) => ({
        recipeKey,
        resultMaterialId,
      }))
      .sort((a, b) => a.recipeKey.localeCompare(b.recipeKey));
  }

  registerGeneratedMaterial(material: MaterialDefinition): void {
    this.#registerMaterial(material);
  }

  getRecipeResult(
    parentAId: string,
    parentBId: string,
    config: Pick<MaterialConfig, "deterministicVersion" | "orderMatters"> = this
      .#config,
    stationType: MaterialProcessingStationType = "combiner",
  ): MaterialDefinition | null {
    const recipeKey = recipeKeyForMaterialIds(
      parentAId,
      parentBId,
      config,
      stationType,
    );
    const materialId =
      this.#recipeResults.get(recipeKey) ??
      (stationType === "combiner"
        ? this.#recipeResults.get(
            legacyRecipeKeyForMaterialIds(parentAId, parentBId, config),
          )
        : undefined);

    return materialId ? this.getMaterialById(materialId) : null;
  }

  storeRecipeResult(recipeKey: string, resultMaterialId: string): void {
    this.#recipeResults.set(recipeKey, resultMaterialId);
  }

  #registerMaterial(material: MaterialDefinition): void {
    if (this.#materialsById.has(material.id)) {
      return;
    }

    this.#materialsById.set(material.id, material);
    this.#materialsByName.set(material.name.toLowerCase(), material);
  }
}
