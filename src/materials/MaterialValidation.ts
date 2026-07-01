import type { MaterialConfig } from "./MaterialConfig.ts";
import type {
  MaterialCombinationFailure,
  MaterialDefinition,
} from "./MaterialTypes.ts";

export type MaterialLookup = Readonly<{
  hasMaterial: (id: string) => boolean;
}>;

export function validateMaterialDefinition(
  material: MaterialDefinition,
  config: Pick<MaterialConfig, "statMin" | "statMax">,
): MaterialCombinationFailure | null {
  if (!material.id || !material.name || material.generation < 0) {
    return {
      ok: false,
      reason: "invalid_parent",
      message: "Material is missing required identity fields.",
    };
  }

  const validationMinimum = Math.min(0, config.statMin);
  const validationMaximum = Math.max(100, config.statMax);

  for (const value of [
    material.stability,
    material.hardness,
    material.density,
    material.heat,
    material.conductivity,
    material.toxicity,
    material.radioactivity,
    material.magic,
    material.organic,
    material.metal,
    material.crystal,
    material.gas,
    material.liquid,
  ]) {
    if (
      !Number.isFinite(value) ||
      value < validationMinimum ||
      value > validationMaximum
    ) {
      return {
        ok: false,
        reason: "invalid_parent",
        message: "Material stats are outside the configured bounds.",
      };
    }
  }

  return null;
}

export function validateCombinationParents(
  materialA: MaterialDefinition,
  materialB: MaterialDefinition,
  registry: MaterialLookup,
  config: MaterialConfig,
): MaterialCombinationFailure | null {
  if (
    !registry.hasMaterial(materialA.id) ||
    !registry.hasMaterial(materialB.id)
  ) {
    return {
      ok: false,
      reason: "missing_parent",
      message: "Both parent materials must be registered before combining.",
    };
  }

  const invalidA = validateMaterialDefinition(materialA, config);
  const invalidB = validateMaterialDefinition(materialB, config);

  if (invalidA ?? invalidB) {
    return invalidA ?? invalidB;
  }

  const nextGeneration =
    Math.max(materialA.generation, materialB.generation) + 1;

  if (nextGeneration > config.maxGenerationDepth) {
    return {
      ok: false,
      reason: "max_generation_exceeded",
      message: `Generation ${nextGeneration} exceeds the configured maximum.`,
    };
  }

  return null;
}
