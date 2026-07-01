import type { MaterialConfig } from "./MaterialConfig.ts";
import { clampMaterialStat } from "./MaterialStats.ts";
import type {
  MaterialProcessingStationType,
  MaterialStatKey,
  MaterialStats,
} from "./MaterialTypes.ts";

export type { MaterialProcessingStationType } from "./MaterialTypes.ts";

export const MATERIAL_PROCESSING_STATION_TYPES = [
  "combiner",
  "forge",
  "crystallizer",
  "distiller",
  "stabilizer",
  "infuser",
  "assembler",
] as const satisfies readonly MaterialProcessingStationType[];

export type MaterialStationDefinition = Readonly<{
  type: MaterialProcessingStationType;
  displayName: string;
  namePrefix?: string;
  statModifiers: Partial<Record<MaterialStatKey, number>>;
  tags: readonly string[];
}>;

const MATERIAL_STATION_DEFINITIONS = {
  combiner: {
    type: "combiner",
    displayName: "Combiner",
    statModifiers: {},
    tags: [],
  },
  forge: {
    type: "forge",
    displayName: "Forge",
    namePrefix: "Forged",
    statModifiers: {
      hardness: 10,
      density: 7,
      heat: 8,
      conductivity: 4,
      metal: 10,
      gas: -8,
      liquid: -6,
    },
    tags: ["forged", "heated"],
  },
  crystallizer: {
    type: "crystallizer",
    displayName: "Crystallizer",
    namePrefix: "Crystallized",
    statModifiers: {
      crystal: 16,
      hardness: 6,
      stability: 3,
      liquid: -5,
      organic: -4,
    },
    tags: ["crystal", "crystalline"],
  },
  distiller: {
    type: "distiller",
    displayName: "Distiller",
    namePrefix: "Distilled",
    statModifiers: {
      liquid: 12,
      gas: 8,
      toxicity: -4,
      density: -5,
      stability: 4,
    },
    tags: ["distilled", "fluidic"],
  },
  stabilizer: {
    type: "stabilizer",
    displayName: "Stabilizer",
    namePrefix: "Stabilized",
    statModifiers: {
      stability: 18,
      radioactivity: -8,
      toxicity: -5,
      heat: -4,
      magic: -2,
    },
    tags: ["stable"],
  },
  infuser: {
    type: "infuser",
    displayName: "Infuser",
    namePrefix: "Infused",
    statModifiers: {
      magic: 14,
      conductivity: 5,
      crystal: 4,
      stability: -3,
    },
    tags: ["infused", "arcane"],
  },
  assembler: {
    type: "assembler",
    displayName: "Assembler",
    namePrefix: "Assembled",
    statModifiers: {
      hardness: 5,
      conductivity: 6,
      metal: 4,
      stability: 6,
      organic: -2,
    },
    tags: ["assembled", "composite"],
  },
} as const satisfies Record<
  MaterialProcessingStationType,
  MaterialStationDefinition
>;

export function materialStationDefinition(
  stationType: MaterialProcessingStationType = "combiner",
): MaterialStationDefinition {
  return MATERIAL_STATION_DEFINITIONS[stationType];
}

export function isMaterialProcessingStationType(
  value: unknown,
): value is MaterialProcessingStationType {
  return (
    typeof value === "string" &&
    MATERIAL_PROCESSING_STATION_TYPES.includes(
      value as MaterialProcessingStationType,
    )
  );
}

export function applyMaterialStationModifiers(
  stats: MaterialStats,
  stationType: MaterialProcessingStationType,
  config: Pick<MaterialConfig, "statMin" | "statMax">,
): MaterialStats {
  const station = materialStationDefinition(stationType);

  if (station.type === "combiner") {
    return stats;
  }

  return Object.fromEntries(
    Object.entries(stats).map(([key, value]) => {
      const stat = key as MaterialStatKey;
      const modifier = station.statModifiers[stat] ?? 0;

      return [stat, clampMaterialStat(value + modifier, config)];
    }),
  ) as MaterialStats;
}

export function materialStationTags(
  stationType: MaterialProcessingStationType,
): readonly string[] {
  return materialStationDefinition(stationType).tags;
}

export function materialStationGeneratedName(
  baseName: string,
  stationType: MaterialProcessingStationType,
): string {
  const prefix = materialStationDefinition(stationType).namePrefix;

  if (!prefix || baseName.toLowerCase().startsWith(prefix.toLowerCase())) {
    return baseName;
  }

  return `${prefix} ${baseName}`;
}
