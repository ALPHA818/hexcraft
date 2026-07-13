export type StartingElementMode = "all" | "basic" | "creativeAll";

export type MaterialConfig = Readonly<{
  maxGenerationDepth: number;
  orderMatters: boolean;
  unstableCombinationsCanFail: boolean;
  enableMaterialHazards: boolean;
  hazardDamageInterval: number;
  hazardRadioactivityThreshold: number;
  hazardToxicityThreshold: number;
  hazardHeatThreshold: number;
  hazardUnstableStabilityThreshold: number;
  materialTraceDiscoveryChance: number;
  seed: number;
  statMin: number;
  statMax: number;
  instantDiscovery: boolean;
  deterministicVersion: string;
  startingElementMode: StartingElementMode;
}>;

export const DEFAULT_MATERIAL_CONFIG: MaterialConfig = {
  maxGenerationDepth: 12,
  orderMatters: false,
  unstableCombinationsCanFail: false,
  enableMaterialHazards: true,
  hazardDamageInterval: 2,
  hazardRadioactivityThreshold: 70,
  hazardToxicityThreshold: 70,
  hazardHeatThreshold: 82,
  hazardUnstableStabilityThreshold: 25,
  materialTraceDiscoveryChance: 0.08,
  seed: 0x484558,
  statMin: 0,
  statMax: 100,
  instantDiscovery: true,
  deterministicVersion: "material-combiner-v1",
  startingElementMode: "all",
};

export function normalizeMaterialConfig(
  config: Partial<MaterialConfig> = {},
): MaterialConfig {
  const statMin = Number.isFinite(config.statMin)
    ? Number(config.statMin)
    : DEFAULT_MATERIAL_CONFIG.statMin;
  const statMax = Number.isFinite(config.statMax)
    ? Number(config.statMax)
    : DEFAULT_MATERIAL_CONFIG.statMax;

  return {
    maxGenerationDepth:
      config.maxGenerationDepth !== undefined &&
      Number.isFinite(config.maxGenerationDepth)
        ? Math.max(0, Math.floor(config.maxGenerationDepth))
        : DEFAULT_MATERIAL_CONFIG.maxGenerationDepth,
    orderMatters: config.orderMatters ?? DEFAULT_MATERIAL_CONFIG.orderMatters,
    unstableCombinationsCanFail:
      config.unstableCombinationsCanFail ??
      DEFAULT_MATERIAL_CONFIG.unstableCombinationsCanFail,
    enableMaterialHazards:
      config.enableMaterialHazards ??
      DEFAULT_MATERIAL_CONFIG.enableMaterialHazards,
    hazardDamageInterval:
      config.hazardDamageInterval !== undefined &&
      Number.isFinite(config.hazardDamageInterval)
        ? Math.max(0.1, Number(config.hazardDamageInterval))
        : DEFAULT_MATERIAL_CONFIG.hazardDamageInterval,
    hazardRadioactivityThreshold:
      config.hazardRadioactivityThreshold !== undefined &&
      Number.isFinite(config.hazardRadioactivityThreshold)
        ? Math.max(
            0,
            Math.min(100, Number(config.hazardRadioactivityThreshold)),
          )
        : DEFAULT_MATERIAL_CONFIG.hazardRadioactivityThreshold,
    hazardToxicityThreshold:
      config.hazardToxicityThreshold !== undefined &&
      Number.isFinite(config.hazardToxicityThreshold)
        ? Math.max(0, Math.min(100, Number(config.hazardToxicityThreshold)))
        : DEFAULT_MATERIAL_CONFIG.hazardToxicityThreshold,
    hazardHeatThreshold:
      config.hazardHeatThreshold !== undefined &&
      Number.isFinite(config.hazardHeatThreshold)
        ? Math.max(0, Math.min(100, Number(config.hazardHeatThreshold)))
        : DEFAULT_MATERIAL_CONFIG.hazardHeatThreshold,
    hazardUnstableStabilityThreshold:
      config.hazardUnstableStabilityThreshold !== undefined &&
      Number.isFinite(config.hazardUnstableStabilityThreshold)
        ? Math.max(
            0,
            Math.min(100, Number(config.hazardUnstableStabilityThreshold)),
          )
        : DEFAULT_MATERIAL_CONFIG.hazardUnstableStabilityThreshold,
    materialTraceDiscoveryChance:
      config.materialTraceDiscoveryChance !== undefined &&
      Number.isFinite(config.materialTraceDiscoveryChance)
        ? Math.max(0, Math.min(1, config.materialTraceDiscoveryChance))
        : DEFAULT_MATERIAL_CONFIG.materialTraceDiscoveryChance,
    seed:
      config.seed !== undefined && Number.isFinite(config.seed)
        ? Math.floor(config.seed)
        : DEFAULT_MATERIAL_CONFIG.seed,
    statMin: Math.min(statMin, statMax),
    statMax: Math.max(statMin, statMax),
    instantDiscovery:
      config.instantDiscovery ?? DEFAULT_MATERIAL_CONFIG.instantDiscovery,
    deterministicVersion:
      config.deterministicVersion ??
      DEFAULT_MATERIAL_CONFIG.deterministicVersion,
    startingElementMode:
      config.startingElementMode ?? DEFAULT_MATERIAL_CONFIG.startingElementMode,
  };
}
