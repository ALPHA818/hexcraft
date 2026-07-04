import { stableHashFloat } from "./MaterialHash.ts";
import {
  MATERIAL_STAT_KEYS,
  type MaterialDefinition,
  type MaterialStatKey,
} from "./MaterialTypes.ts";

export type HexColor = `#${string}`;
export type RgbColor = readonly [red: number, green: number, blue: number];

export type MaterialVisuals = Readonly<{
  baseColor: HexColor;
  accentColor: HexColor;
  roughness: number;
  metallic: number;
  emissiveStrength: number;
  alpha: number;
}>;

export const UNKNOWN_MATERIAL_VISUALS: MaterialVisuals = {
  baseColor: "#6f7f86",
  accentColor: "#d7e6ed",
  roughness: 0.82,
  metallic: 0,
  emissiveStrength: 0,
  alpha: 1,
};

type VisualFamily =
  | "toxic"
  | "fire"
  | "radioactive"
  | "magic"
  | "crystal"
  | "metal"
  | "liquid"
  | "gas"
  | "organic"
  | "earth"
  | "default";

type FamilyColorProfile = Readonly<{
  hue: number;
  hueJitter: number;
  saturation: number;
  saturationJitter: number;
  lightness: number;
  lightnessJitter: number;
  accentHueOffset: number;
  accentLightness: number;
}>;

const FAMILY_COLOR_PROFILES = {
  toxic: {
    hue: 105,
    hueJitter: 16,
    saturation: 78,
    saturationJitter: 8,
    lightness: 42,
    lightnessJitter: 6,
    accentHueOffset: -30,
    accentLightness: 68,
  },
  fire: {
    hue: 24,
    hueJitter: 14,
    saturation: 82,
    saturationJitter: 7,
    lightness: 45,
    lightnessJitter: 5,
    accentHueOffset: 22,
    accentLightness: 64,
  },
  radioactive: {
    hue: 126,
    hueJitter: 18,
    saturation: 78,
    saturationJitter: 9,
    lightness: 43,
    lightnessJitter: 6,
    accentHueOffset: -44,
    accentLightness: 70,
  },
  magic: {
    hue: 282,
    hueJitter: 34,
    saturation: 64,
    saturationJitter: 9,
    lightness: 48,
    lightnessJitter: 7,
    accentHueOffset: -72,
    accentLightness: 72,
  },
  crystal: {
    hue: 196,
    hueJitter: 58,
    saturation: 66,
    saturationJitter: 8,
    lightness: 56,
    lightnessJitter: 6,
    accentHueOffset: 30,
    accentLightness: 78,
  },
  metal: {
    hue: 212,
    hueJitter: 30,
    saturation: 18,
    saturationJitter: 7,
    lightness: 50,
    lightnessJitter: 6,
    accentHueOffset: 18,
    accentLightness: 70,
  },
  liquid: {
    hue: 200,
    hueJitter: 28,
    saturation: 64,
    saturationJitter: 8,
    lightness: 45,
    lightnessJitter: 6,
    accentHueOffset: -18,
    accentLightness: 68,
  },
  gas: {
    hue: 174,
    hueJitter: 40,
    saturation: 44,
    saturationJitter: 10,
    lightness: 68,
    lightnessJitter: 6,
    accentHueOffset: 36,
    accentLightness: 82,
  },
  organic: {
    hue: 116,
    hueJitter: 26,
    saturation: 48,
    saturationJitter: 9,
    lightness: 36,
    lightnessJitter: 6,
    accentHueOffset: 34,
    accentLightness: 56,
  },
  earth: {
    hue: 38,
    hueJitter: 24,
    saturation: 46,
    saturationJitter: 9,
    lightness: 42,
    lightnessJitter: 6,
    accentHueOffset: -18,
    accentLightness: 60,
  },
  default: {
    hue: 0,
    hueJitter: 180,
    saturation: 54,
    saturationJitter: 14,
    lightness: 46,
    lightnessJitter: 9,
    accentHueOffset: 54,
    accentLightness: 66,
  },
} as const satisfies Record<VisualFamily, FamilyColorProfile>;

const TRAIT_TAGS = {
  toxic: ["toxic", "poison", "halogen"],
  fire: ["fire", "fuel", "explosive"],
  radioactive: ["radioactive", "actinide"],
  magic: ["magic", "arcane", "void", "light", "dark"],
  crystal: ["crystal", "crystalline", "metalloid"],
  metal: ["metal", "metallic", "alloy", "forged", "conductive"],
  liquid: ["liquid", "water", "fluidic", "liquid-prone"],
  gas: ["gas", "air", "volatile", "noble-gas"],
  organic: ["organic", "organic-core", "nonmetal"],
  earth: ["earth", "clay"],
} as const satisfies Record<
  Exclude<VisualFamily, "default">,
  readonly string[]
>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replaceAll(/\s+/g, "-");
}

function normalizedTags(
  material: Pick<MaterialDefinition, "tags">,
): Set<string> {
  return new Set(material.tags.map(normalizeTag));
}

function hasAnyTag(
  tags: ReadonlySet<string>,
  candidates: readonly string[],
): boolean {
  return candidates.some((tag) => tags.has(tag));
}

function materialVisualSeed(material: MaterialDefinition): string {
  const stats = MATERIAL_STAT_KEYS.map(
    (key) => `${key}:${material[key].toFixed(3)}`,
  ).join("|");

  return `${material.id}|${stats}|${material.tags.map(normalizeTag).join(",")}`;
}

function traitScore(
  family: Exclude<VisualFamily, "default">,
  material: MaterialDefinition,
  tags: ReadonlySet<string>,
): number {
  const tagBonus = hasAnyTag(tags, TRAIT_TAGS[family]) ? 28 : 0;

  switch (family) {
    case "toxic":
      return material.toxicity + tagBonus;
    case "fire":
      return material.heat + tagBonus;
    case "radioactive":
      return material.radioactivity + tagBonus;
    case "magic":
      return material.magic + tagBonus;
    case "crystal":
      return material.crystal + tagBonus;
    case "metal":
      return material.metal + material.conductivity * 0.18 + tagBonus;
    case "liquid":
      return material.liquid + tagBonus;
    case "gas":
      return material.gas + tagBonus;
    case "organic":
      return material.organic + tagBonus;
    case "earth":
      return Math.max(material.hardness, material.density) * 0.76 + tagBonus;
  }
}

function dominantVisualFamily(material: MaterialDefinition): VisualFamily {
  const tags = normalizedTags(material);
  const families = Object.keys(TRAIT_TAGS) as Array<
    Exclude<VisualFamily, "default">
  >;
  const [bestFamily, bestScore] = families
    .map((family) => [family, traitScore(family, material, tags)] as const)
    .sort((a, b) => b[1] - a[1])[0]!;

  return bestScore >= 45 ? bestFamily : "default";
}

function dominantStatForFamily(
  family: VisualFamily,
  material: MaterialDefinition,
): number {
  switch (family) {
    case "toxic":
      return material.toxicity;
    case "fire":
      return material.heat;
    case "radioactive":
      return material.radioactivity;
    case "magic":
      return material.magic;
    case "crystal":
      return material.crystal;
    case "metal":
      return material.metal;
    case "liquid":
      return material.liquid;
    case "gas":
      return material.gas;
    case "organic":
      return material.organic;
    case "earth":
      return Math.max(material.hardness, material.density);
    case "default":
      return averageMaterialStat(material);
  }
}

function averageMaterialStat(material: MaterialDefinition): number {
  return (
    MATERIAL_STAT_KEYS.reduce((total, key) => total + material[key], 0) /
    MATERIAL_STAT_KEYS.length
  );
}

function materialStat(
  material: MaterialDefinition,
  key: MaterialStatKey,
): number {
  return clamp(material[key] / 100, 0, 1);
}

function wrapHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

function hueToRgb(p: number, q: number, t: number): number {
  let adjusted = t;
  if (adjusted < 0) adjusted += 1;
  if (adjusted > 1) adjusted -= 1;
  if (adjusted < 1 / 6) return p + (q - p) * 6 * adjusted;
  if (adjusted < 1 / 2) return q;
  if (adjusted < 2 / 3) return p + (q - p) * (2 / 3 - adjusted) * 6;
  return p;
}

function hslToRgb(
  hue: number,
  saturation: number,
  lightness: number,
): RgbColor {
  const normalizedHue = wrapHue(hue) / 360;
  const normalizedSaturation = clamp(saturation, 0, 100) / 100;
  const normalizedLightness = clamp(lightness, 0, 100) / 100;

  if (normalizedSaturation === 0) {
    return [normalizedLightness, normalizedLightness, normalizedLightness];
  }

  const q =
    normalizedLightness < 0.5
      ? normalizedLightness * (1 + normalizedSaturation)
      : normalizedLightness +
        normalizedSaturation -
        normalizedLightness * normalizedSaturation;
  const p = 2 * normalizedLightness - q;

  return [
    hueToRgb(p, q, normalizedHue + 1 / 3),
    hueToRgb(p, q, normalizedHue),
    hueToRgb(p, q, normalizedHue - 1 / 3),
  ];
}

function channelToHex(value: number): string {
  return Math.round(clamp01(value) * 255)
    .toString(16)
    .padStart(2, "0");
}

function rgbToHex(color: RgbColor): HexColor {
  return `#${channelToHex(color[0])}${channelToHex(color[1])}${channelToHex(
    color[2],
  )}`;
}

function hslToHex(
  hue: number,
  saturation: number,
  lightness: number,
): HexColor {
  return rgbToHex(hslToRgb(hue, saturation, lightness));
}

export function hexColorToRgb(color: HexColor | string): RgbColor {
  const match = /^#([0-9a-f]{6})$/i.exec(color);

  if (!match) {
    throw new Error(`Invalid hex color: ${color}`);
  }

  const value = Number.parseInt(match[1]!, 16);

  return [
    ((value >> 16) & 0xff) / 255,
    ((value >> 8) & 0xff) / 255,
    (value & 0xff) / 255,
  ];
}

export function relativeLuminance(color: HexColor | string): number {
  const [red, green, blue] = hexColorToRgb(color);
  const linearize = (channel: number): number =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

  return (
    linearize(red) * 0.2126 +
    linearize(green) * 0.7152 +
    linearize(blue) * 0.0722
  );
}

export function materialVisualsForMaterial(
  material: MaterialDefinition,
): MaterialVisuals {
  const family = dominantVisualFamily(material);
  const profile = FAMILY_COLOR_PROFILES[family];
  const seed = materialVisualSeed(material);
  const dominantStat = dominantStatForFamily(family, material);
  const statShift = (dominantStat - 50) * 0.09;
  const defaultHue =
    family === "default" ? stableHashFloat(`${seed}|default-hue`, 0, 360) : 0;
  const baseHue =
    profile.hue +
    defaultHue +
    stableHashFloat(`${seed}|hue`, -profile.hueJitter, profile.hueJitter) +
    statShift;
  const baseSaturation = clamp(
    profile.saturation +
      stableHashFloat(
        `${seed}|saturation`,
        -profile.saturationJitter,
        profile.saturationJitter,
      ) +
      materialStat(material, "magic") * 5 +
      materialStat(material, "crystal") * 4 -
      materialStat(material, "metal") * (family === "metal" ? 0 : 6),
    16,
    92,
  );
  const baseLightness = clamp(
    profile.lightness +
      stableHashFloat(
        `${seed}|lightness`,
        -profile.lightnessJitter,
        profile.lightnessJitter,
      ) +
      (material.stability - 50) * 0.04 -
      material.density * 0.03 +
      material.crystal * 0.04,
    22,
    74,
  );
  const accentLightness = clamp(
    Math.max(
      profile.accentLightness +
        stableHashFloat(`${seed}|accent-lightness`, -5, 5),
      family === "crystal" ? baseLightness + 18 : baseLightness + 10,
    ),
    36,
    88,
  );
  const accentSaturation = clamp(
    baseSaturation + 8 + stableHashFloat(`${seed}|accent-saturation`, -5, 7),
    24,
    96,
  );
  const metallic = clamp01(
    materialStat(material, "metal") * 0.74 +
      materialStat(material, "conductivity") * 0.16 +
      (family === "metal" ? 0.18 : 0) -
      materialStat(material, "organic") * 0.12 -
      materialStat(material, "gas") * 0.08,
  );
  const roughness = clamp01(
    0.82 -
      metallic * 0.36 -
      materialStat(material, "crystal") * 0.14 +
      materialStat(material, "organic") * 0.08 +
      materialStat(material, "gas") * 0.1 +
      stableHashFloat(`${seed}|roughness`, -0.045, 0.045),
  );
  const emissiveStrength = clamp01(
    materialStat(material, "magic") * 0.3 +
      materialStat(material, "radioactivity") * 0.34 +
      materialStat(material, "crystal") * 0.12 +
      materialStat(material, "heat") * (family === "fire" ? 0.12 : 0.04) +
      (family === "magic" || family === "radioactive" ? 0.12 : 0) +
      (family === "crystal" ? 0.06 : 0),
  );
  const alpha = clamp(
    1 -
      materialStat(material, "gas") * 0.32 -
      materialStat(material, "liquid") * 0.14 +
      materialStat(material, "metal") * 0.04,
    0.58,
    1,
  );

  return {
    baseColor: hslToHex(baseHue, baseSaturation, baseLightness),
    accentColor: hslToHex(
      baseHue + profile.accentHueOffset,
      accentSaturation,
      accentLightness,
    ),
    roughness,
    metallic,
    emissiveStrength,
    alpha,
  };
}
