import {
  DEFAULT_MATERIAL_CONFIG,
  normalizeMaterialConfig,
  type MaterialConfig,
} from "../materials/MaterialConfig.ts";
import type { MaterialDefinition } from "../materials/MaterialTypes.ts";
import type { GameMode } from "./gameMode.ts";

export type MaterialHazardKind = "radioactive" | "toxic" | "hot";

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
  config?: Partial<
    Pick<MaterialConfig, "enableMaterialHazards" | "hazardDamageInterval">
  >;
}>;

const RADIOACTIVE_WARNING = "Radioactive material";
const TOXIC_WARNING = "Toxic material";
const HOT_WARNING = "Burning hot material";

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
): readonly MaterialHazard[] {
  if (!material) {
    return [];
  }

  const tags = normalizedTagSet(material);
  const hazards: MaterialHazard[] = [];

  if (
    material.radioactivity >= 70 ||
    hasAnyTag(tags, ["radioactive", "radiological", "uranium", "reactor"])
  ) {
    hazards.push({
      kind: "radioactive",
      warning: RADIOACTIVE_WARNING,
      damagePerTick: 2,
      radiationExposurePerTick: 4,
    });
  }

  if (
    material.toxicity >= 70 ||
    hasAnyTag(tags, ["toxic", "poison", "venom"])
  ) {
    hazards.push({
      kind: "toxic",
      warning: TOXIC_WARNING,
      damagePerTick: 1.5,
      radiationExposurePerTick: 0,
    });
  }

  if (
    !isStabilizedMaterial(material, tags) &&
    (material.heat >= 82 ||
      hasAnyTag(tags, ["fire", "burning", "ember", "lava", "hot"]))
  ) {
    hazards.push({
      kind: "hot",
      warning: HOT_WARNING,
      damagePerTick: 2.5,
      radiationExposurePerTick: 0,
    });
  }

  return hazards;
}

export function updateHeldMaterialHazards({
  mode,
  material,
  deltaSeconds,
  state,
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

  const hazards = materialHazardsForMaterial(material);

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

  const ticks = Math.floor(
    state.elapsedSeconds / normalizedConfig.hazardDamageInterval,
  );

  if (ticks > 0) {
    state.elapsedSeconds -= ticks * normalizedConfig.hazardDamageInterval;
  }

  const damage =
    ticks * hazards.reduce((total, hazard) => total + hazard.damagePerTick, 0);
  const radiationExposureDelta =
    ticks *
    hazards.reduce(
      (total, hazard) => total + hazard.radiationExposurePerTick,
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
