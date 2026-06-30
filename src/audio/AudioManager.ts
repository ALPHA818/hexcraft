import type { FirstPersonCameraState } from "../input/FirstPersonCamera.ts";
import { TerrainMaterial } from "../geometry/terrainChunk.ts";
import {
  AUDIO_VOLUME_KEYS,
  DEFAULT_AUDIO_VOLUME_SETTINGS,
  breakSoundForMaterial,
  normalizeAudioVolumeSettings,
  placeSoundForMaterial,
  soundDefinitionFor,
  stepSoundForMaterial,
  type AudioVolumeSettings,
  type GeneratedSoundDefinition,
  type SoundCategory,
} from "./SoundRegistry.ts";

export type PlayerStepAudioInput = Readonly<{
  position: readonly [number, number, number];
  state: FirstPersonCameraState;
  material: TerrainMaterial;
}>;

export type AudioManagerOptions = Readonly<{
  volumes?: Partial<AudioVolumeSettings>;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  random?: () => number;
}>;

const AUDIO_SETTINGS_STORAGE_KEY = "hexcraft.audioSettings.v1";
const STEP_DISTANCE = 1.35;
const SPRINT_STEP_DISTANCE = 1.1;
const MIN_STEP_INTERVAL_SECONDS = 0.12;

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function browserStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function readStoredVolumeSettings(
  storage: Pick<Storage, "getItem" | "setItem"> | null,
): AudioVolumeSettings {
  const rawSettings = storage?.getItem(AUDIO_SETTINGS_STORAGE_KEY);

  if (!rawSettings) {
    return DEFAULT_AUDIO_VOLUME_SETTINGS;
  }

  try {
    return normalizeAudioVolumeSettings(JSON.parse(rawSettings) as unknown);
  } catch {
    return DEFAULT_AUDIO_VOLUME_SETTINGS;
  }
}

function createBrowserAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextConstructor =
    window.AudioContext ?? (window as AudioWindow).webkitAudioContext;

  if (!AudioContextConstructor) {
    return null;
  }

  try {
    return new AudioContextConstructor();
  } catch {
    return null;
  }
}

export class AudioManager {
  readonly #storage: Pick<Storage, "getItem" | "setItem"> | null;
  readonly #random: () => number;
  readonly #categoryGains = new Map<SoundCategory, GainNode>();

  #volumes: AudioVolumeSettings;
  #context: AudioContext | null = null;
  #masterGain: GainNode | null = null;
  #hasUserInteraction = false;
  #removeInteractionListeners: (() => void) | null = null;
  #removeUiClickListener: (() => void) | null = null;
  #lastStepPosition: readonly [number, number, number] | null = null;
  #stepDistance = 0;
  #stepCooldown = 0;

  constructor(options: AudioManagerOptions = {}) {
    this.#storage = options.storage ?? browserStorage();
    this.#random = options.random ?? Math.random;
    this.#volumes = normalizeAudioVolumeSettings(
      options.volumes ?? readStoredVolumeSettings(this.#storage),
    );
  }

  volumeSettings(): AudioVolumeSettings {
    return { ...this.#volumes };
  }

  setVolumeSettings(settings: Partial<AudioVolumeSettings>): void {
    this.#volumes = normalizeAudioVolumeSettings(settings, this.#volumes);
    this.#applyVolumes();
  }

  saveVolumeSettings(): void {
    try {
      this.#storage?.setItem(
        AUDIO_SETTINGS_STORAGE_KEY,
        JSON.stringify(this.#volumes),
      );
    } catch {
      // Storage can be unavailable in private browsing; audio should keep going.
    }
  }

  attachUserInteractionListeners(target: Document = document): void {
    this.#removeInteractionListeners?.();

    const unlock = (): void => {
      this.#hasUserInteraction = true;
      this.#removeInteractionListeners?.();
      this.#removeInteractionListeners = null;
      void this.#resume();
    };
    const options: AddEventListenerOptions = {
      capture: true,
      passive: true,
    };

    target.addEventListener("pointerdown", unlock, options);
    target.addEventListener("keydown", unlock, options);
    target.addEventListener("touchstart", unlock, options);
    this.#removeInteractionListeners = () => {
      target.removeEventListener("pointerdown", unlock, options);
      target.removeEventListener("keydown", unlock, options);
      target.removeEventListener("touchstart", unlock, options);
    };
  }

  attachUiClickSounds(target: Document = document): void {
    this.#removeUiClickListener?.();

    const onClick = (event: MouseEvent): void => {
      if (!(event.target instanceof Element)) {
        return;
      }

      if (
        event.target.closest(
          'button, [role="button"], input[type="button"], input[type="submit"], a[href]',
        )
      ) {
        this.play("ui.click");
      }
    };

    target.addEventListener("click", onClick);
    this.#removeUiClickListener = () => {
      target.removeEventListener("click", onClick);
    };
  }

  play(id: string, volume = 1): boolean {
    const definition = soundDefinitionFor(id);

    if (!definition || !this.#hasUserInteraction) {
      return false;
    }

    const context = this.#ensureContext();
    const categoryGain = definition
      ? this.#categoryGains.get(definition.category)
      : null;

    if (!context || !categoryGain) {
      return false;
    }

    if (context.state === "suspended") {
      void this.#resume();
    }

    try {
      this.#playGeneratedSound(context, categoryGain, definition, volume);
      return true;
    } catch {
      return false;
    }
  }

  playBlockStep(material: TerrainMaterial, volume = 1): boolean {
    const soundId = stepSoundForMaterial(material);

    return soundId ? this.play(soundId, volume) : false;
  }

  playBlockBreak(material: TerrainMaterial, volume = 1): boolean {
    const soundId = breakSoundForMaterial(material);

    return soundId ? this.play(soundId, volume) : false;
  }

  playBlockPlace(material: TerrainMaterial, volume = 1): boolean {
    const soundId = placeSoundForMaterial(material);

    return soundId ? this.play(soundId, volume) : false;
  }

  updatePlayerSteps(deltaSeconds: number, input: PlayerStepAudioInput): void {
    const delta = Math.min(Math.max(deltaSeconds, 0), 0.25);
    this.#stepCooldown = Math.max(0, this.#stepCooldown - delta);

    if (!input.state.grounded || input.state.inWater) {
      this.#lastStepPosition = [...input.position];
      this.#stepDistance = 0;
      return;
    }

    if (!this.#lastStepPosition) {
      this.#lastStepPosition = [...input.position];
      return;
    }

    const distance = Math.hypot(
      input.position[0] - this.#lastStepPosition[0],
      input.position[2] - this.#lastStepPosition[2],
    );
    this.#lastStepPosition = [...input.position];

    if (distance < 0.001) {
      return;
    }

    this.#stepDistance += distance;
    const stepDistance = input.state.sprinting
      ? SPRINT_STEP_DISTANCE
      : STEP_DISTANCE;

    if (
      this.#stepDistance >= stepDistance &&
      this.#stepCooldown <= 0 &&
      input.material !== TerrainMaterial.Air
    ) {
      this.#stepDistance = 0;
      this.#stepCooldown = MIN_STEP_INTERVAL_SECONDS;
      this.playBlockStep(input.material, input.state.sprinting ? 1 : 0.86);
    }
  }

  destroy(): void {
    this.#removeInteractionListeners?.();
    this.#removeUiClickListener?.();
    this.#removeInteractionListeners = null;
    this.#removeUiClickListener = null;
    this.#context?.close().catch(() => {});
    this.#context = null;
    this.#masterGain = null;
    this.#categoryGains.clear();
  }

  #ensureContext(): AudioContext | null {
    if (this.#context && this.#context.state !== "closed") {
      return this.#context;
    }

    const context = createBrowserAudioContext();

    if (!context) {
      return null;
    }

    const masterGain = context.createGain();
    masterGain.connect(context.destination);
    this.#context = context;
    this.#masterGain = masterGain;
    this.#categoryGains.clear();

    for (const key of AUDIO_VOLUME_KEYS) {
      if (key === "master") {
        continue;
      }

      const categoryGain = context.createGain();
      categoryGain.connect(masterGain);
      this.#categoryGains.set(key, categoryGain);
    }

    this.#applyVolumes();
    return context;
  }

  async #resume(): Promise<void> {
    const context = this.#ensureContext();

    if (!context || context.state !== "suspended") {
      return;
    }

    try {
      await context.resume();
    } catch {
      // Browsers can still reject resume outside a trusted gesture.
    }
  }

  #applyVolumes(): void {
    if (!this.#context) {
      return;
    }

    const now = this.#context.currentTime;

    this.#masterGain?.gain.setTargetAtTime(this.#volumes.master, now, 0.018);
    for (const category of AUDIO_VOLUME_KEYS) {
      if (category === "master") {
        continue;
      }

      this.#categoryGains
        .get(category)
        ?.gain.setTargetAtTime(this.#volumes[category], now, 0.018);
    }
  }

  #playGeneratedSound(
    context: AudioContext,
    destination: AudioNode,
    definition: GeneratedSoundDefinition,
    volume: number,
  ): void {
    const now = context.currentTime;
    const duration = Math.max(0.01, definition.duration);
    const gain = context.createGain();
    const filter = definition.filter ? context.createBiquadFilter() : null;
    const jitteredGain =
      definition.gain *
      volume *
      (1 + (this.#random() * 2 - 1) * (definition.gainJitter ?? 0));
    const attack = Math.min(definition.attack ?? 0.004, duration * 0.45);
    const endTime = now + duration;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(
      Math.max(0.0001, jitteredGain),
      now + attack,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

    if (filter) {
      filter.type = definition.filter!.type;
      filter.frequency.setValueAtTime(definition.filter!.frequency, now);
      filter.Q.setValueAtTime(definition.filter!.q ?? 0.7, now);
      filter.connect(gain);
    }

    gain.connect(destination);

    const soundDestination = filter ?? gain;

    if (definition.noise && definition.noise.amount > 0) {
      this.#playNoise(context, soundDestination, definition, now, duration);
    }

    if (definition.oscillator) {
      const oscillator = context.createOscillator();
      const pitchJitter =
        1 + (this.#random() * 2 - 1) * (definition.pitchJitter ?? 0);

      oscillator.type = definition.oscillator.type;
      oscillator.frequency.setValueAtTime(
        definition.oscillator.frequencyStart * pitchJitter,
        now,
      );
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(
          1,
          (definition.oscillator.frequencyEnd ??
            definition.oscillator.frequencyStart) * pitchJitter,
        ),
        endTime,
      );
      oscillator.connect(soundDestination);
      oscillator.start(now);
      oscillator.stop(endTime);
    }
  }

  #playNoise(
    context: AudioContext,
    destination: AudioNode,
    definition: GeneratedSoundDefinition,
    startTime: number,
    duration: number,
  ): void {
    const sampleCount = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
    const data = buffer.getChannelData(0);
    const amount = definition.noise?.amount ?? 0;

    for (let index = 0; index < sampleCount; index += 1) {
      const envelope = 1 - index / sampleCount;
      data[index] = (this.#random() * 2 - 1) * amount * envelope;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);
    source.start(startTime);
    source.stop(startTime + duration);
  }
}

export function loadAudioVolumeSettingsFromLocalStorage(): AudioVolumeSettings {
  return readStoredVolumeSettings(browserStorage());
}
