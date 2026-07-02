import {
  DEFAULT_MATERIAL_CONFIG,
  normalizeMaterialConfig,
  type MaterialConfig,
} from "../materials/MaterialConfig.ts";
import { BASE_ELEMENT_MATERIALS } from "../materials/BaseElements.ts";
import { combineMaterials } from "../materials/MaterialCombiner.ts";
import { MaterialRegistry } from "../materials/MaterialRegistry.ts";
import {
  createMaterialResearchState,
  type MaterialResearchMode,
  type MaterialResearchState,
} from "../materials/MaterialResearch.ts";
import { isMaterialProcessingStationType } from "../materials/MaterialStations.ts";
import type {
  MaterialCombinationFailure,
  MaterialCombinationResult,
  MaterialDefinition,
  MaterialProcessingStationType,
} from "../materials/MaterialTypes.ts";
import {
  createStartingMaterialCodex,
  materialRegistryFromSerializedCodex,
  normalizeSerializedMaterialCodex,
  serializeMaterialCodex,
  type SerializedMaterialCodex,
  type SerializedMaterialRecipe,
} from "../save/WorldSaveTypes.ts";

export type MaterialWorldControllerOptions = Readonly<{
  materialCodex?: SerializedMaterialCodex | null;
  config?: MaterialConfig;
  mode?: MaterialResearchMode;
}>;

type MaterialWorldControllerInput =
  MaterialWorldControllerOptions | SerializedMaterialCodex | null | undefined;

function isSerializedMaterialCodex(
  value: MaterialWorldControllerInput,
): value is SerializedMaterialCodex {
  return (
    !!value &&
    typeof value === "object" &&
    "generatedMaterials" in value &&
    ("discoveredMaterialIds" in value || "discoveredBaseMaterialIds" in value)
  );
}

function missingMaterialFailure(
  parentAId: unknown,
  parentBId: unknown,
): MaterialCombinationFailure {
  const missingIds = [parentAId, parentBId]
    .filter((id): id is string => typeof id === "string" && id.trim() !== "")
    .join(", ");

  return {
    ok: false,
    reason: "missing_parent",
    message:
      missingIds.length > 0
        ? `Unknown material id: ${missingIds}`
        : "Material ids must be non-empty strings.",
  };
}

function invalidStationFailure(
  stationType: unknown,
): MaterialCombinationFailure {
  return {
    ok: false,
    reason: "invalid_parent",
    message: `Unknown material station: ${String(stationType)}`,
  };
}

export class MaterialWorldController {
  readonly #config: MaterialConfig;
  readonly #mode: MaterialResearchMode;
  readonly #registry: MaterialRegistry;
  #research: MaterialResearchState;

  constructor(options: MaterialWorldControllerInput = {}) {
    const controllerOptions: MaterialWorldControllerOptions =
      isSerializedMaterialCodex(options)
        ? { materialCodex: options }
        : (options ?? {});

    this.#config = normalizeMaterialConfig(
      controllerOptions.config ?? DEFAULT_MATERIAL_CONFIG,
    );
    this.#mode = controllerOptions.mode ?? "creative";

    const startingCodex =
      controllerOptions.materialCodex ??
      createStartingMaterialCodex({ gameMode: this.#mode }, this.#config);
    const materialCodex = normalizeSerializedMaterialCodex(
      startingCodex,
      this.#config,
    );

    this.#registry = materialRegistryFromSerializedCodex(
      materialCodex,
      this.#config,
    );
    if (this.#mode === "creative") {
      for (const material of BASE_ELEMENT_MATERIALS) {
        this.#registry.discoverBaseMaterial(material.id);
      }
    }
    this.#research = createMaterialResearchState(
      materialCodex.unlockedResearchTiers,
    );
  }

  get registry(): MaterialRegistry {
    return this.#registry;
  }

  serialize(): SerializedMaterialCodex {
    return serializeMaterialCodex(this.#registry, this.#research.unlockedTiers);
  }

  discoverMaterial(materialId: string): boolean {
    return this.#registry.discoverMaterial(materialId);
  }

  hasDiscovered(materialId: string): boolean {
    return this.#registry.hasDiscoveredMaterial(materialId);
  }

  combine(
    parentAId: string,
    parentBId: string,
    stationType: MaterialProcessingStationType = "combiner",
  ): MaterialCombinationResult {
    if (!isMaterialProcessingStationType(stationType)) {
      return invalidStationFailure(stationType);
    }

    if (
      typeof parentAId !== "string" ||
      parentAId.trim() === "" ||
      typeof parentBId !== "string" ||
      parentBId.trim() === ""
    ) {
      return missingMaterialFailure(parentAId, parentBId);
    }

    const parentA = this.#registry.getMaterialById(parentAId);
    const parentB = this.#registry.getMaterialById(parentBId);

    if (!parentA || !parentB) {
      return missingMaterialFailure(
        parentA ? undefined : parentAId,
        parentB ? undefined : parentBId,
      );
    }

    return combineMaterials(
      parentA,
      parentB,
      this.#registry,
      this.#config,
      {
        mode: this.#mode,
        research: this.#research,
      },
      stationType,
    );
  }

  listDiscoveredMaterials(): readonly MaterialDefinition[] {
    return [...this.#registry.allDiscoveredMaterials()].sort(
      (a, b) =>
        a.generation - b.generation ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );
  }

  getMaterialById(materialId: string): MaterialDefinition | null {
    return this.#registry.getMaterialById(materialId);
  }

  getRecipeForMaterial(materialId: string): SerializedMaterialRecipe | null {
    const material = this.getMaterialById(materialId);

    if (!material || material.generation === 0) {
      return null;
    }

    return (
      this.serialize().recipeResults.find(
        (recipe) => recipe.resultMaterialId === material.id,
      ) ?? null
    );
  }

  getKnownResult(
    parentAId: string,
    parentBId: string,
    stationType: MaterialProcessingStationType = "combiner",
  ): MaterialDefinition | null {
    if (
      !isMaterialProcessingStationType(stationType) ||
      !this.#registry.hasMaterial(parentAId) ||
      !this.#registry.hasMaterial(parentBId)
    ) {
      return null;
    }

    return this.#registry.getRecipeResult(
      parentAId,
      parentBId,
      this.#config,
      stationType,
    );
  }
}
