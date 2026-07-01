import type { MaterialConfig } from "./MaterialConfig.ts";
import {
  MATERIAL_STAT_KEYS,
  type MaterialDefinition,
  type MaterialStatKey,
  type MaterialStats,
} from "./MaterialTypes.ts";
import { stableHashFloat } from "./MaterialHash.ts";
import {
  materialTraitTags,
  statModifiersForTags,
  type MaterialReaction,
} from "./MaterialReactions.ts";

export function clampMaterialStat(
  value: number,
  config: Pick<MaterialConfig, "statMin" | "statMax">,
): number {
  return Math.max(config.statMin, Math.min(config.statMax, value));
}

export function materialStatsFrom(material: MaterialDefinition): MaterialStats {
  return Object.fromEntries(
    MATERIAL_STAT_KEYS.map((key) => [key, material[key]]),
  ) as MaterialStats;
}

export function combineMaterialStats(
  materialA: MaterialDefinition,
  materialB: MaterialDefinition,
  recipeKey: string,
  config: MaterialConfig,
  reaction: MaterialReaction | null = null,
): MaterialStats {
  const weightA = stableHashFloat(
    `${config.seed}|${recipeKey}|parent-weight`,
    0.42,
    0.58,
  );
  const weightB = 1 - weightA;
  const parentTraitTags = new Set([
    ...materialTraitTags(materialA),
    ...materialTraitTags(materialB),
  ]);
  const tagModifiers = statModifiersForTags(parentTraitTags);
  const entries = MATERIAL_STAT_KEYS.map(
    (key): readonly [MaterialStatKey, number] => {
      const average = materialA[key] * weightA + materialB[key] * weightB;
      const variance = stableHashFloat(
        `${config.seed}|${recipeKey}|stat|${key}`,
        -5,
        5,
      );
      const inheritedBias = Math.abs(materialA[key] - materialB[key]) * 0.05;
      const traitModifier = (tagModifiers[key] ?? 0) * 0.22;
      const reactionModifier = reaction?.statModifiers[key] ?? 0;

      return [
        key,
        clampMaterialStat(
          average + variance + inheritedBias + traitModifier + reactionModifier,
          config,
        ),
      ];
    },
  );

  return Object.fromEntries(entries) as MaterialStats;
}
