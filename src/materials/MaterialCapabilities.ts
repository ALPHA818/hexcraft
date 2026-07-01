import type { MaterialDefinition } from "./MaterialTypes.ts";

export const MATERIAL_CAPABILITY_KEYS = [
  "weaponGrade",
  "toolGrade",
  "armorGrade",
  "fuelGrade",
  "magicFocusGrade",
  "conductorGrade",
  "explosiveGrade",
  "reactorGrade",
  "buildingGrade",
  "biologicalGrade",
] as const;

export type MaterialCapabilityKey = (typeof MATERIAL_CAPABILITY_KEYS)[number];

export type MaterialCapabilities = Readonly<
  Record<MaterialCapabilityKey, number>
>;

export const MATERIAL_CAPABILITY_LABELS = {
  weaponGrade: "Weapon grade",
  toolGrade: "Tool grade",
  armorGrade: "Armor grade",
  fuelGrade: "Fuel grade",
  magicFocusGrade: "Magic focus grade",
  conductorGrade: "Conductor grade",
  explosiveGrade: "Explosive grade",
  reactorGrade: "Reactor grade",
  buildingGrade: "Building grade",
  biologicalGrade: "Biological grade",
} as const satisfies Record<MaterialCapabilityKey, string>;

type WeightedScore = readonly [value: number, weight: number];
type TagWeights = Readonly<Record<string, number>>;

function clampGrade(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function stat(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function weightedGrade(scores: readonly WeightedScore[]): number {
  const totalWeight = scores.reduce((total, [, weight]) => total + weight, 0);

  if (totalWeight <= 0) {
    return 0;
  }

  return (
    scores.reduce((total, [value, weight]) => total + stat(value) * weight, 0) /
    totalWeight
  );
}

function normalizedTags(
  material: Pick<MaterialDefinition, "tags">,
): Set<string> {
  return new Set(material.tags.map((tag) => tag.toLowerCase()));
}

function tagBonus(
  tags: ReadonlySet<string>,
  weights: TagWeights,
  maximumBonus = 30,
): number {
  let bonus = 0;

  for (const [tag, weight] of Object.entries(weights)) {
    if (tags.has(tag)) {
      bonus += weight;
    }
  }

  return Math.min(maximumBonus, bonus);
}

export function classifyMaterialCapabilities(
  material: MaterialDefinition,
): MaterialCapabilities {
  const tags = normalizedTags(material);
  const instability = 100 - stat(material.stability);
  const lowToxicity = 100 - stat(material.toxicity);
  const lowRadiation = 100 - stat(material.radioactivity);

  return {
    weaponGrade: clampGrade(
      weightedGrade([
        [material.hardness, 0.25],
        [material.metal, 0.18],
        [material.density, 0.16],
        [material.heat, 0.14],
        [material.stability, 0.12],
        [material.toxicity, 0.08],
        [material.crystal, 0.05],
        [material.magic, 0.02],
      ]) +
        tagBonus(tags, {
          weapon: 16,
          blade: 12,
          sharp: 12,
          metal: 8,
          metallic: 8,
          alloy: 8,
          forged: 8,
          toxic: 5,
        }),
    ),
    toolGrade: clampGrade(
      weightedGrade([
        [material.hardness, 0.34],
        [material.metal, 0.25],
        [material.stability, 0.18],
        [material.conductivity, 0.12],
        [material.crystal, 0.06],
        [material.density, 0.05],
      ]) +
        tagBonus(tags, {
          tool: 16,
          hard: 12,
          metal: 8,
          metallic: 8,
          alloy: 8,
          forged: 8,
          stone: 5,
          composite: 5,
        }),
    ),
    armorGrade: clampGrade(
      weightedGrade([
        [material.hardness, 0.27],
        [material.stability, 0.24],
        [material.density, 0.18],
        [material.metal, 0.15],
        [material.crystal, 0.06],
        [lowToxicity, 0.05],
        [lowRadiation, 0.05],
      ]) +
        tagBonus(tags, {
          armor: 18,
          shield: 14,
          metal: 8,
          metallic: 8,
          alloy: 8,
          forged: 8,
          stone: 5,
          stable: 5,
        }),
    ),
    fuelGrade: clampGrade(
      weightedGrade([
        [material.heat, 0.28],
        [material.organic, 0.2],
        [material.gas, 0.18],
        [material.liquid, 0.12],
        [instability, 0.1],
        [material.toxicity, 0.04],
        [material.magic, 0.03],
        [100 - stat(material.density), 0.05],
      ]) +
        tagBonus(tags, {
          fuel: 18,
          fire: 14,
          coal: 12,
          oil: 12,
          wood: 8,
          gas: 8,
          explosive: 5,
          organic: 5,
        }),
    ),
    magicFocusGrade: clampGrade(
      weightedGrade([
        [material.magic, 0.42],
        [material.crystal, 0.28],
        [material.conductivity, 0.1],
        [material.stability, 0.08],
        [lowToxicity, 0.05],
        [lowRadiation, 0.07],
      ]) +
        tagBonus(tags, {
          magic: 18,
          arcane: 18,
          crystal: 12,
          crystalline: 12,
          infused: 10,
          focus: 10,
          catalyst: 6,
        }),
    ),
    conductorGrade: clampGrade(
      weightedGrade([
        [material.conductivity, 0.52],
        [material.metal, 0.22],
        [material.liquid, 0.08],
        [material.crystal, 0.06],
        [material.stability, 0.06],
        [material.heat, 0.03],
        [material.radioactivity, 0.03],
      ]) +
        tagBonus(tags, {
          conductive: 18,
          electric: 14,
          metal: 9,
          metallic: 9,
          copper: 8,
          gold: 8,
          silver: 8,
          alloy: 5,
        }),
    ),
    explosiveGrade: clampGrade(
      weightedGrade([
        [material.gas, 0.26],
        [material.heat, 0.24],
        [instability, 0.16],
        [material.liquid, 0.08],
        [material.toxicity, 0.07],
        [material.radioactivity, 0.05],
        [material.magic, 0.04],
        [100 - stat(material.density), 0.1],
      ]) +
        tagBonus(tags, {
          explosive: 22,
          volatile: 14,
          fire: 12,
          gas: 10,
          fuel: 8,
          unstable: 8,
          reactive: 8,
        }),
    ),
    reactorGrade: clampGrade(
      weightedGrade([
        [material.radioactivity, 0.42],
        [material.metal, 0.2],
        [material.density, 0.13],
        [material.heat, 0.08],
        [material.conductivity, 0.08],
        [material.stability, 0.05],
        [material.crystal, 0.04],
      ]) +
        tagBonus(tags, {
          radioactive: 20,
          reactor: 20,
          uranium: 18,
          actinide: 12,
          radiological: 12,
          unstable: 6,
          metal: 5,
          metallic: 5,
        }),
    ),
    buildingGrade: clampGrade(
      weightedGrade([
        [material.stability, 0.3],
        [material.hardness, 0.26],
        [material.density, 0.16],
        [lowToxicity, 0.09],
        [lowRadiation, 0.08],
        [material.metal, 0.05],
        [material.crystal, 0.03],
        [material.organic, 0.03],
      ]) +
        tagBonus(tags, {
          building: 18,
          stable: 10,
          stone: 8,
          earth: 8,
          wood: 6,
          assembled: 6,
          composite: 6,
          metal: 4,
        }),
    ),
    biologicalGrade: clampGrade(
      weightedGrade([
        [material.organic, 0.4],
        [material.toxicity, 0.22],
        [material.liquid, 0.1],
        [material.gas, 0.08],
        [instability, 0.06],
        [material.magic, 0.04],
        [material.heat, 0.04],
        [lowRadiation, 0.06],
      ]) +
        tagBonus(tags, {
          biological: 18,
          bio: 18,
          poison: 18,
          toxic: 14,
          organic: 12,
          "organic-core": 12,
          fungus: 8,
          plant: 8,
          alchemical: 6,
        }),
    ),
  };
}
