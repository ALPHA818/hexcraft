import { TerrainMaterial } from "../geometry/terrainChunk.ts";

export type SoundCategory = "blocks" | "player" | "weather" | "ui";

export type AudioVolumeSettings = Readonly<{
  master: number;
  blocks: number;
  player: number;
  weather: number;
  ui: number;
}>;

export type SoundOscillatorDefinition = Readonly<{
  type: OscillatorType;
  frequencyStart: number;
  frequencyEnd?: number;
}>;

export type SoundNoiseDefinition = Readonly<{
  amount: number;
}>;

export type GeneratedSoundDefinition = Readonly<{
  id: string;
  category: SoundCategory;
  duration: number;
  gain: number;
  attack?: number;
  pitchJitter?: number;
  gainJitter?: number;
  oscillator?: SoundOscillatorDefinition;
  noise?: SoundNoiseDefinition;
  filter?: Readonly<{
    type: BiquadFilterType;
    frequency: number;
    q?: number;
  }>;
}>;

type BlockSoundGroup =
  | "grass"
  | "dirt"
  | "stone"
  | "sand"
  | "snow"
  | "wood"
  | "leaves"
  | "water"
  | "plant";

export const DEFAULT_AUDIO_VOLUME_SETTINGS: AudioVolumeSettings = {
  master: 0.75,
  blocks: 0.85,
  player: 0.8,
  weather: 0.55,
  ui: 0.65,
};

export const AUDIO_VOLUME_KEYS = [
  "master",
  "blocks",
  "player",
  "weather",
  "ui",
] as const;

const BLOCK_SOUND_GROUPS: Partial<Record<TerrainMaterial, BlockSoundGroup>> = {
  [TerrainMaterial.Grass]: "grass",
  [TerrainMaterial.Dirt]: "dirt",
  [TerrainMaterial.DryGrass]: "grass",
  [TerrainMaterial.Stone]: "stone",
  [TerrainMaterial.DeepStone]: "stone",
  [TerrainMaterial.AlpineRock]: "stone",
  [TerrainMaterial.CoalOre]: "stone",
  [TerrainMaterial.IronOre]: "stone",
  [TerrainMaterial.CopperOre]: "stone",
  [TerrainMaterial.GoldOre]: "stone",
  [TerrainMaterial.CrystalOre]: "stone",
  [TerrainMaterial.Bedrock]: "stone",
  [TerrainMaterial.Sand]: "sand",
  [TerrainMaterial.Snow]: "snow",
  [TerrainMaterial.Wood]: "wood",
  [TerrainMaterial.Planks]: "wood",
  [TerrainMaterial.Torch]: "wood",
  [TerrainMaterial.Leaves]: "leaves",
  [TerrainMaterial.Water]: "water",
  [TerrainMaterial.Cactus]: "plant",
  [TerrainMaterial.Flower]: "plant",
  [TerrainMaterial.Mushroom]: "plant",
};

const BLOCK_GROUP_PROFILES: Record<
  BlockSoundGroup,
  Readonly<{
    stepFrequency: number;
    placeFrequency: number;
    breakFrequency: number;
    filterFrequency: number;
    gain: number;
  }>
> = {
  grass: {
    stepFrequency: 165,
    placeFrequency: 130,
    breakFrequency: 105,
    filterFrequency: 900,
    gain: 0.42,
  },
  dirt: {
    stepFrequency: 135,
    placeFrequency: 110,
    breakFrequency: 95,
    filterFrequency: 720,
    gain: 0.48,
  },
  stone: {
    stepFrequency: 260,
    placeFrequency: 210,
    breakFrequency: 170,
    filterFrequency: 1400,
    gain: 0.38,
  },
  sand: {
    stepFrequency: 115,
    placeFrequency: 96,
    breakFrequency: 82,
    filterFrequency: 620,
    gain: 0.38,
  },
  snow: {
    stepFrequency: 190,
    placeFrequency: 145,
    breakFrequency: 115,
    filterFrequency: 1100,
    gain: 0.32,
  },
  wood: {
    stepFrequency: 210,
    placeFrequency: 160,
    breakFrequency: 125,
    filterFrequency: 1250,
    gain: 0.44,
  },
  leaves: {
    stepFrequency: 150,
    placeFrequency: 120,
    breakFrequency: 95,
    filterFrequency: 1050,
    gain: 0.3,
  },
  water: {
    stepFrequency: 95,
    placeFrequency: 82,
    breakFrequency: 72,
    filterFrequency: 520,
    gain: 0.34,
  },
  plant: {
    stepFrequency: 170,
    placeFrequency: 125,
    breakFrequency: 95,
    filterFrequency: 980,
    gain: 0.3,
  },
};

function blockSoundDefinitions(): GeneratedSoundDefinition[] {
  const definitions: GeneratedSoundDefinition[] = [];

  for (const [group, profile] of Object.entries(BLOCK_GROUP_PROFILES) as Array<
    [BlockSoundGroup, (typeof BLOCK_GROUP_PROFILES)[BlockSoundGroup]]
  >) {
    definitions.push(
      {
        id: `block.step.${group}`,
        category: "player",
        duration: group === "water" ? 0.16 : 0.09,
        gain: profile.gain,
        attack: 0.004,
        pitchJitter: 0.16,
        gainJitter: 0.12,
        oscillator: {
          type: group === "stone" ? "triangle" : "sine",
          frequencyStart: profile.stepFrequency,
          frequencyEnd: profile.stepFrequency * 0.62,
        },
        noise: { amount: group === "water" ? 0.55 : 0.38 },
        filter: {
          type: group === "stone" ? "highpass" : "lowpass",
          frequency: profile.filterFrequency,
          q: 0.7,
        },
      },
      {
        id: `block.place.${group}`,
        category: "blocks",
        duration: 0.12,
        gain: profile.gain * 1.15,
        attack: 0.003,
        pitchJitter: 0.1,
        gainJitter: 0.1,
        oscillator: {
          type: "triangle",
          frequencyStart: profile.placeFrequency,
          frequencyEnd: profile.placeFrequency * 0.55,
        },
        noise: { amount: 0.32 },
        filter: {
          type: "lowpass",
          frequency: profile.filterFrequency,
          q: 0.9,
        },
      },
      {
        id: `block.break.${group}`,
        category: "blocks",
        duration: 0.18,
        gain: profile.gain * 1.28,
        attack: 0.002,
        pitchJitter: 0.2,
        gainJitter: 0.16,
        oscillator: {
          type: "sawtooth",
          frequencyStart: profile.breakFrequency,
          frequencyEnd: profile.breakFrequency * 0.34,
        },
        noise: { amount: group === "stone" ? 0.72 : 0.52 },
        filter: {
          type: "lowpass",
          frequency: profile.filterFrequency * 1.12,
          q: 0.8,
        },
      },
    );
  }

  return definitions;
}

export const SOUND_DEFINITIONS: readonly GeneratedSoundDefinition[] = [
  ...blockSoundDefinitions(),
  {
    id: "ui.click",
    category: "ui",
    duration: 0.055,
    gain: 0.28,
    attack: 0.002,
    pitchJitter: 0.04,
    oscillator: {
      type: "triangle",
      frequencyStart: 520,
      frequencyEnd: 760,
    },
  },
  {
    id: "ui.error",
    category: "ui",
    duration: 0.12,
    gain: 0.22,
    attack: 0.002,
    oscillator: {
      type: "sawtooth",
      frequencyStart: 190,
      frequencyEnd: 110,
    },
    filter: {
      type: "lowpass",
      frequency: 900,
    },
  },
  {
    id: "weather.rain",
    category: "weather",
    duration: 0.24,
    gain: 0.22,
    attack: 0.01,
    gainJitter: 0.12,
    noise: { amount: 0.75 },
    filter: {
      type: "highpass",
      frequency: 1100,
      q: 0.4,
    },
  },
  {
    id: "weather.storm",
    category: "weather",
    duration: 0.35,
    gain: 0.3,
    attack: 0.015,
    gainJitter: 0.15,
    oscillator: {
      type: "sawtooth",
      frequencyStart: 80,
      frequencyEnd: 36,
    },
    noise: { amount: 0.5 },
    filter: {
      type: "lowpass",
      frequency: 640,
    },
  },
];

const SOUND_DEFINITION_MAP = new Map(
  SOUND_DEFINITIONS.map((definition) => [definition.id, definition]),
);

function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isVolumeRecord(
  value: unknown,
): value is Partial<Record<keyof AudioVolumeSettings, unknown>> {
  return typeof value === "object" && value !== null;
}

function numericVolume(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clampVolume(value)
    : fallback;
}

export function normalizeAudioVolumeSettings(
  value: unknown,
  fallback: AudioVolumeSettings = DEFAULT_AUDIO_VOLUME_SETTINGS,
): AudioVolumeSettings {
  const record = isVolumeRecord(value) ? value : {};

  return {
    master: numericVolume(record.master, fallback.master),
    blocks: numericVolume(record.blocks, fallback.blocks),
    player: numericVolume(record.player, fallback.player),
    weather: numericVolume(record.weather, fallback.weather),
    ui: numericVolume(record.ui, fallback.ui),
  };
}

export function soundDefinitionFor(
  id: string,
): GeneratedSoundDefinition | null {
  return SOUND_DEFINITION_MAP.get(id) ?? null;
}

export function soundGroupForMaterial(
  material: TerrainMaterial,
): BlockSoundGroup | null {
  return BLOCK_SOUND_GROUPS[material] ?? null;
}

export function stepSoundForMaterial(material: TerrainMaterial): string | null {
  const group = soundGroupForMaterial(material);

  return group ? `block.step.${group}` : null;
}

export function placeSoundForMaterial(
  material: TerrainMaterial,
): string | null {
  const group = soundGroupForMaterial(material);

  return group ? `block.place.${group}` : null;
}

export function breakSoundForMaterial(
  material: TerrainMaterial,
): string | null {
  const group = soundGroupForMaterial(material);

  return group ? `block.break.${group}` : null;
}
