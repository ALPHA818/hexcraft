import {
  DEFAULT_MATERIAL_CONFIG,
  normalizeMaterialConfig,
  type MaterialConfig,
} from "../materials/MaterialConfig.ts";
import type { MaterialDefinition } from "../materials/MaterialTypes.ts";
import type { GameMode } from "./gameMode.ts";

export type MaterialHazardKind = "radioactive" | "toxic" | "hot" | "unstable";

export type MaterialHazardProtection = Partial<
  Record<MaterialHazardKind, number>
>;

export type MaterialHazard = Readonly<{
  kind: MaterialHazardKind;
  warning: string;
  damagePerTick: number;
  radiationExposurePerTick: number;
}>;

export type MaterialHazardState = {
  activeHazardKey: string | null;
  elapsedSeconds: number;
  radiationExposure: number;
};

export type MaterialHazardUpdate = Readonly<{
  hazards: readonly MaterialHazard[];
  warnings: readonly string[];
  damage: number;
  radiationExposureDelta: number;
  radiationExposure: number;
}>;

export type MaterialHazardUpdateOptions = Readonly<{
  mode: GameMode;
  material: MaterialDefinition | null;
  deltaSeconds: number;
  state: MaterialHazardState;
  protection?: MaterialHazardProtection;
  config?: Partial<
    Pick<
      MaterialConfig,
      | "enableMaterialHazards"
      | "hazardDamageInterval"
      | "hazardRadioactivityThreshold"
      | "hazardToxicityThreshold"
      | "hazardHeatThreshold"
      | "hazardUnstableStabilityThreshold"
    >
  >;
}>;

const RADIOACTIVE_WARNING = "Radioactive material";
const TOXIC_WARNING = "Toxic material";
const HOT_WARNING = "Burning hot material";
const UNSTABLE_WARNING = "Unstable material";
const MAX_HAZARD_TICKS_PER_UPDATE = 1;

const NO_HAZARD_UPDATE: MaterialHazardUpdate = {
  hazards: [],
  warnings: [],
  damage: 0,
  radiationExposureDelta: 0,
  radiationExposure: 0,
};

function normalizedTagSet(material: MaterialDefinition): ReadonlySet<string> {
  return new Set(material.tags.map((tag) => tag.trim().toLowerCase()));
}

function hasAnyTag(
  tags: ReadonlySet<string>,
  candidates: readonly string[],
): boolean {
  return candidates.some((candidate) => tags.has(candidate));
}

function isStabilizedMaterial(
  material: MaterialDefinition,
  tags: ReadonlySet<string>,
): boolean {
  return (
    material.stationType === "stabilizer" ||
    hasAnyTag(tags, ["stable", "stabilized"])
  );
}

export function createMaterialHazardState(): MaterialHazardState {
  return {
    activeHazardKey: null,
    elapsedSeconds: 0,
    radiationExposure: 0,
  };
}

export function materialHazardsForMaterial(
  material: MaterialDefinition | null,
  config: Partial<
    Pick<
      MaterialConfig,
      | "hazardRadioactivityThreshold"
      | "hazardToxicityThreshold"
      | "hazardHeatThreshold"
      | "hazardUnstableStabilityThreshold"
    >
  > = DEFAULT_MATERIAL_CONFIG,
): readonly MaterialHazard[] {
  if (!material) {
    return [];
  }

  const normalizedConfig = normalizeMaterialConfig({
    ...DEFAULT_MATERIAL_CONFIG,
    ...config,
  });
  const tags = normalizedTagSet(material);
  const hazards: MaterialHazard[] = [];

  if (
    material.radioactivity >= normalizedConfig.hazardRadioactivityThreshold ||
    hasAnyTag(tags, ["radioactive", "radiological", "uranium", "reactor"])
  ) {
    hazards.push({
      kind: "radioactive",
      warning: RADIOACTIVE_WARNING,
      damagePerTick: 1.2,
      radiationExposurePerTick: 4,
    });
  }

  if (
    material.toxicity >= normalizedConfig.hazardToxicityThreshold ||
    hasAnyTag(tags, ["toxic", "poison", "venom"])
  ) {
    hazards.push({
      kind: "toxic",
      warning: TOXIC_WARNING,
      damagePerTick: 1,
      radiationExposurePerTick: 0,
    });
  }

  if (
    !isStabilizedMaterial(material, tags) &&
    (material.heat >= normalizedConfig.hazardHeatThreshold ||
      hasAnyTag(tags, ["fire", "burning", "ember", "lava", "hot"]))
  ) {
    hazards.push({
      kind: "hot",
      warning: HOT_WARNING,
      damagePerTick: 1.4,
      radiationExposurePerTick: 0,
    });
  }

  if (
    material.stability <= normalizedConfig.hazardUnstableStabilityThreshold ||
    hasAnyTag(tags, ["unstable", "volatile"])
  ) {
    hazards.push({
      kind: "unstable",
      warning: UNSTABLE_WARNING,
      damagePerTick: 0,
      radiationExposurePerTick: 0,
    });
  }

  return hazards;
}

function protectionMultiplier(
  protection: MaterialHazardProtection | undefined,
  kind: MaterialHazardKind,
): number {
  const reduction = protection?.[kind] ?? 0;

  return 1 - Math.max(0, Math.min(1, reduction));
}

export function updateHeldMaterialHazards({
  mode,
  material,
  deltaSeconds,
  state,
  protection,
  config = DEFAULT_MATERIAL_CONFIG,
}: MaterialHazardUpdateOptions): MaterialHazardUpdate {
  const normalizedConfig = normalizeMaterialConfig({
    ...DEFAULT_MATERIAL_CONFIG,
    ...config,
  });

  if (
    mode !== "survival" ||
    !normalizedConfig.enableMaterialHazards ||
    !material
  ) {
    state.activeHazardKey = null;
    state.elapsedSeconds = 0;
    return {
      ...NO_HAZARD_UPDATE,
      radiationExposure: state.radiationExposure,
    };
  }

  const hazards = materialHazardsForMaterial(material, normalizedConfig);

  if (hazards.length === 0) {
    state.activeHazardKey = null;
    state.elapsedSeconds = 0;
    return {
      ...NO_HAZARD_UPDATE,
      radiationExposure: state.radiationExposure,
    };
  }

  const hazardKey = `${material.id}:${hazards
    .map((hazard) => hazard.kind)
    .join("|")}`;

  if (state.activeHazardKey !== hazardKey) {
    state.activeHazardKey = hazardKey;
    state.elapsedSeconds = 0;
  }

  state.elapsedSeconds += Math.max(0, deltaSeconds);

  const rawTicks = Math.floor(
    state.elapsedSeconds / normalizedConfig.hazardDamageInterval,
  );
  const ticks = Math.min(rawTicks, MAX_HAZARD_TICKS_PER_UPDATE);

  if (rawTicks > 0) {
    state.elapsedSeconds -= rawTicks * normalizedConfig.hazardDamageInterval;
  }

  const damage =
    ticks *
    hazards.reduce(
      (total, hazard) =>
        total +
        hazard.damagePerTick * protectionMultiplier(protection, hazard.kind),
      0,
    );
  const radiationExposureDelta =
    ticks *
    hazards.reduce(
      (total, hazard) =>
        total +
        hazard.radiationExposurePerTick *
          protectionMultiplier(protection, hazard.kind),
      0,
    );

  state.radiationExposure += radiationExposureDelta;

  return {
    hazards,
    warnings: hazards.map((hazard) => hazard.warning),
    damage,
    radiationExposureDelta,
    radiationExposure: state.radiationExposure,
  };
}
