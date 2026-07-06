import { DEVICE_PROFILE } from "../platform/deviceProfile.ts";
import {
  WorldAtmosphere,
  type AtmosphereObserver,
  type WorldAtmosphereSnapshot,
} from "./WorldAtmosphere.ts";
import {
  WorldWeatherParticles,
  type WorldWeatherParticle,
} from "./WorldWeatherParticles.ts";
import {
  rendererLightingValues,
  type RendererLightingValues,
} from "../world/Lighting.ts";
import {
  DAY_NIGHT_CYCLE_SECONDS,
  DAY_OR_NIGHT_SECONDS,
  DEFAULT_TIME_OF_DAY,
  GameTime,
} from "../world/GameTime.ts";

export { DAY_NIGHT_CYCLE_SECONDS, DAY_OR_NIGHT_SECONDS };

export type WeatherKind =
  "clear" | "cloudy" | "rain" | "storm" | "snow" | "fog" | "sandstorm";

export type AtmosphereState = Readonly<{
  lightDirection: readonly [number, number, number];
  lightColor: readonly [number, number, number];
  fogColor: readonly [number, number, number];
  ambient: number;
  weatherIntensity: number;
  cloudCover: number;
  daylight: number;
  timeSeconds: number;
  weather: WeatherKind;
  rendererLighting: RendererLightingValues;
  fogDensity?: number;
  worldAtmosphere?: WorldAtmosphereSnapshot;
  weatherParticles?: readonly WorldWeatherParticle[];
}>;

export type AtmosphereOptions = Readonly<{
  enableWeather?: boolean;
  enableDayNightCycle?: boolean;
  gameTime?: GameTime;
  weatherSeed?: number;
  allowManualWeatherCycle?: boolean;
  allowManualTimeCycle?: boolean;
  enableSandstorms?: boolean;
  isSandstormAllowed?: () => boolean;
}>;

export type WeatherSchedule = Readonly<{
  weather: WeatherKind;
  transitionIndex: number;
  secondsUntilChange: number;
}>;

type WeatherProfile = Readonly<{
  displayName: string;
  cloudCover: number;
  weatherIntensity: number;
  fogColor: readonly [number, number, number];
  fogMix: number;
  ambientMultiplier: number;
  skyTop: readonly [number, number, number];
  skyHorizon: readonly [number, number, number];
  skyTint: number;
}>;

type WeatherAvailability = Readonly<{
  enableWeather?: boolean;
  allowSandstorm?: boolean;
}>;

export const WEATHER_SEQUENCE: readonly WeatherKind[] = [
  "clear",
  "cloudy",
  "rain",
  "storm",
  "snow",
  "fog",
  "sandstorm",
];
export const WEATHER_TRANSITION_MIN_SECONDS = 75;
export const WEATHER_TRANSITION_VARIANCE_SECONDS = 105;
export const STORM_LIGHTNING_CHANCE_PER_SECOND = 0.035;
const WEATHER_PROFILES: Record<WeatherKind, WeatherProfile> = {
  clear: {
    displayName: "Clear",
    cloudCover: 0.03,
    weatherIntensity: 0,
    fogColor: [0.55, 0.72, 0.82],
    fogMix: 0.08,
    ambientMultiplier: 1,
    skyTop: [0.18, 0.46, 0.72],
    skyHorizon: [0.76, 0.88, 0.9],
    skyTint: 0,
  },
  cloudy: {
    displayName: "Cloudy",
    cloudCover: 0.74,
    weatherIntensity: 0.24,
    fogColor: [0.38, 0.46, 0.5],
    fogMix: 0.42,
    ambientMultiplier: 0.86,
    skyTop: [0.31, 0.39, 0.43],
    skyHorizon: [0.52, 0.58, 0.58],
    skyTint: 0.46,
  },
  rain: {
    displayName: "Rain",
    cloudCover: 0.78,
    weatherIntensity: 0.68,
    fogColor: [0.25, 0.33, 0.38],
    fogMix: 0.58,
    ambientMultiplier: 0.78,
    skyTop: [0.22, 0.28, 0.32],
    skyHorizon: [0.34, 0.42, 0.45],
    skyTint: 0.62,
  },
  storm: {
    displayName: "Storm",
    cloudCover: 0.96,
    weatherIntensity: 1,
    fogColor: [0.14, 0.18, 0.22],
    fogMix: 0.75,
    ambientMultiplier: 0.64,
    skyTop: [0.1, 0.12, 0.16],
    skyHorizon: [0.2, 0.23, 0.27],
    skyTint: 0.84,
  },
  snow: {
    displayName: "Snow",
    cloudCover: 0.7,
    weatherIntensity: 0.58,
    fogColor: [0.72, 0.78, 0.82],
    fogMix: 0.62,
    ambientMultiplier: 0.9,
    skyTop: [0.58, 0.66, 0.74],
    skyHorizon: [0.78, 0.84, 0.87],
    skyTint: 0.52,
  },
  fog: {
    displayName: "Fog",
    cloudCover: 0.52,
    weatherIntensity: 0.82,
    fogColor: [0.67, 0.72, 0.72],
    fogMix: 0.86,
    ambientMultiplier: 0.82,
    skyTop: [0.48, 0.54, 0.57],
    skyHorizon: [0.66, 0.7, 0.69],
    skyTint: 0.68,
  },
  sandstorm: {
    displayName: "Sandstorm",
    cloudCover: 0.82,
    weatherIntensity: 0.92,
    fogColor: [0.72, 0.52, 0.28],
    fogMix: 0.88,
    ambientMultiplier: 0.62,
    skyTop: [0.57, 0.39, 0.2],
    skyHorizon: [0.86, 0.64, 0.34],
    skyTint: 0.82,
  },
};
const AUTOMATIC_WEATHER_WEIGHTS: Record<WeatherKind, number> = {
  clear: 0.28,
  cloudy: 0.2,
  rain: 0.18,
  storm: 0.08,
  snow: 0.1,
  fog: 0.12,
  sandstorm: 0.04,
};

function mix(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function smoothStep(value: number): number {
  return value * value * (3 - 2 * value);
}

function mixColor(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  amount: number,
): [number, number, number] {
  return [
    mix(a[0], b[0], amount),
    mix(a[1], b[1], amount),
    mix(a[2], b[2], amount),
  ];
}

function cssColor(color: readonly [number, number, number]): string {
  return `rgb(${color.map((value) => Math.round(value * 255)).join(" ")})`;
}

function normalizedSeed(seed: number): number {
  return Number.isFinite(seed) ? Math.trunc(seed) : 1;
}

export function seededWeatherRandom(seed: number, salt: number): number {
  let value = Math.imul(
    normalizedSeed(seed) ^ Math.imul(Math.trunc(salt), 0x9e3779b1),
    0x85ebca6b,
  );
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;

  return (value >>> 0) / 0x1_0000_0000;
}

function weatherSequenceForAvailability(
  availability: WeatherAvailability = {},
): readonly WeatherKind[] {
  if (availability.enableWeather === false) {
    return ["clear"];
  }

  return availability.allowSandstorm === true
    ? WEATHER_SEQUENCE
    : WEATHER_SEQUENCE.filter((weather) => weather !== "sandstorm");
}

function normalizeWeatherForAvailability(
  weather: WeatherKind,
  availability: WeatherAvailability = {},
): WeatherKind {
  return weatherSequenceForAvailability(availability).includes(weather)
    ? weather
    : "clear";
}

function transitionDelaySeconds(seed: number, transitionIndex: number): number {
  return (
    WEATHER_TRANSITION_MIN_SECONDS +
    seededWeatherRandom(seed, 1000 + transitionIndex * 17) *
      WEATHER_TRANSITION_VARIANCE_SECONDS
  );
}

function pickAutomaticWeather(
  currentWeather: WeatherKind,
  seed: number,
  transitionIndex: number,
  availability: WeatherAvailability = {},
): WeatherKind {
  const sequence = weatherSequenceForAvailability(availability);
  const candidates = sequence.filter((weather) => weather !== currentWeather);
  const weightedCandidates = candidates.length > 0 ? candidates : sequence;
  const totalWeight = weightedCandidates.reduce(
    (total, weather) => total + AUTOMATIC_WEATHER_WEIGHTS[weather],
    0,
  );
  let roll =
    seededWeatherRandom(seed, 2000 + transitionIndex * 31) * totalWeight;

  for (const weather of weightedCandidates) {
    roll -= AUTOMATIC_WEATHER_WEIGHTS[weather];
    if (roll <= 0) {
      return weather;
    }
  }

  return weightedCandidates.at(-1) ?? "clear";
}

export function cycleWeatherKind(
  weather: WeatherKind,
  availability: WeatherAvailability = {},
): WeatherKind {
  const sequence = weatherSequenceForAvailability(availability);
  if (!sequence.includes(weather)) {
    return "clear";
  }

  const current = normalizeWeatherForAvailability(weather, availability);
  const currentIndex = sequence.indexOf(current);

  return sequence[(currentIndex + 1) % sequence.length] ?? "clear";
}

export function createWeatherSchedule(
  seed: number,
  initialWeather: WeatherKind = "clear",
  availability: WeatherAvailability = {},
): WeatherSchedule {
  const weather =
    availability.enableWeather === false
      ? "clear"
      : normalizeWeatherForAvailability(initialWeather, availability);

  return {
    weather,
    transitionIndex: 0,
    secondsUntilChange: transitionDelaySeconds(seed, 0),
  };
}

export function weatherScheduleAtTime(
  seed: number,
  timeSeconds: number,
  initialWeather: WeatherKind = "clear",
  availability: WeatherAvailability = {},
): WeatherSchedule {
  return advanceWeatherSchedule(
    createWeatherSchedule(seed, initialWeather, availability),
    Math.max(0, timeSeconds),
    seed,
    availability,
  );
}

export function advanceWeatherSchedule(
  schedule: WeatherSchedule,
  deltaSeconds: number,
  seed: number,
  availability: WeatherAvailability = {},
): WeatherSchedule {
  if (availability.enableWeather === false) {
    return createWeatherSchedule(seed, "clear", availability);
  }

  let weather = normalizeWeatherForAvailability(schedule.weather, availability);
  let transitionIndex = schedule.transitionIndex;
  let secondsUntilChange =
    schedule.secondsUntilChange - Math.max(0, deltaSeconds);

  while (secondsUntilChange <= 0) {
    transitionIndex += 1;
    weather = pickAutomaticWeather(
      weather,
      seed,
      transitionIndex,
      availability,
    );
    secondsUntilChange += transitionDelaySeconds(seed, transitionIndex);
  }

  return {
    weather,
    transitionIndex,
    secondsUntilChange,
  };
}

export function stormCreatesLightningEvent(
  seed: number,
  transitionIndex: number,
  stormSecondIndex: number,
): boolean {
  return (
    seededWeatherRandom(
      seed,
      9000 + transitionIndex * 4099 + stormSecondIndex * 53,
    ) < STORM_LIGHTNING_CHANCE_PER_SECOND
  );
}

export function countStormLightningEvents(
  seed: number,
  seconds: number,
  transitionIndex = 0,
): number {
  let events = 0;

  for (let second = 0; second < seconds; second += 1) {
    if (stormCreatesLightningEvent(seed, transitionIndex, second)) {
      events += 1;
    }
  }

  return events;
}

export function calculateAtmosphereState(
  timeSeconds: number,
  weather: WeatherKind,
  lightning = 0,
): AtmosphereState {
  const profile = WEATHER_PROFILES[weather];
  const dayPhase = timeSeconds / DAY_NIGHT_CYCLE_SECONDS;
  const sunAngle = dayPhase * Math.PI * 2 - Math.PI / 2;
  const sunHeight = Math.sin(sunAngle);
  const daylight = smoothStep(
    Math.max(0, Math.min(1, (sunHeight + 0.12) / 0.88)),
  );
  const twilight = Math.max(0, 1 - Math.abs(sunHeight) / 0.32);
  const cloudCover = profile.cloudCover;
  const weatherIntensity = profile.weatherIntensity;
  const activeOrbitAngle = sunHeight >= 0 ? sunAngle : sunAngle + Math.PI;
  const azimuth = activeOrbitAngle * 0.72;
  const elevation = Math.max(0.12, Math.abs(sunHeight));
  const horizontal = Math.sqrt(Math.max(0, 1 - elevation * elevation));
  const lightDirection: [number, number, number] = [
    Math.cos(azimuth) * horizontal,
    -elevation,
    Math.sin(azimuth) * horizontal,
  ];
  const daylightColor: [number, number, number] =
    sunHeight < 0.28 ? [1, 0.61, 0.34] : [1, 0.94, 0.78];
  const moonColor: [number, number, number] = [0.4, 0.5, 0.72];
  const lightColor = mixColor(
    moonColor,
    daylightColor,
    Math.max(daylight, twilight * 0.78),
  );
  const dayFog: [number, number, number] = [0.55, 0.72, 0.82];
  const nightFog: [number, number, number] = [0.035, 0.055, 0.1];
  const baseFog = mixColor(nightFog, dayFog, daylight);
  let fogColor = mixColor(baseFog, profile.fogColor, profile.fogMix);
  fogColor = mixColor(
    fogColor,
    [0.88, 0.31, 0.16],
    twilight * (1 - cloudCover) * 0.34,
  );
  const ambient =
    (0.09 + daylight * 0.27) *
      (1 - cloudCover * 0.38) *
      profile.ambientMultiplier +
    twilight * 0.08 +
    lightning * 0.32;

  return {
    lightDirection,
    lightColor,
    fogColor,
    ambient,
    weatherIntensity,
    cloudCover,
    daylight,
    timeSeconds,
    weather,
    rendererLighting: rendererLightingValues({
      ambient,
      daylight,
      weatherIntensity,
    }),
  };
}

export class Atmosphere {
  readonly #sky: HTMLElement;
  readonly #stars: HTMLElement;
  readonly #moon: HTMLElement;
  readonly #clouds: HTMLElement;
  readonly #canvas: HTMLCanvasElement;
  readonly #context: CanvasRenderingContext2D;
  readonly #status: HTMLElement;
  readonly #worldAtmosphere: WorldAtmosphere;
  readonly #weatherParticles: WorldWeatherParticles;
  readonly #enableWeather: boolean;
  readonly #enableDayNightCycle: boolean;
  readonly #gameTime: GameTime;
  readonly #weatherSeed: number;
  readonly #allowManualWeatherCycle: boolean;
  readonly #allowManualTimeCycle: boolean;
  readonly #enableSandstorms: boolean;
  readonly #isSandstormAllowed: () => boolean;

  #weatherSchedule: WeatherSchedule;
  #lightning = 0;
  #lightningSecondAccumulator = 0;
  #lightningSecondIndex = 0;
  #isActive = true;
  #observer: AtmosphereObserver = {
    position: [0, 0, 0],
    direction: [0, 0, -1],
    biome: null,
  };
  #state: AtmosphereState;

  constructor(options: AtmosphereOptions = {}) {
    const sky = document.querySelector<HTMLElement>("#sky");
    const stars = document.querySelector<HTMLElement>("#stars");
    const moon = document.querySelector<HTMLElement>("#moon");
    const clouds = document.querySelector<HTMLElement>("#clouds");
    const canvas = document.querySelector<HTMLCanvasElement>("#weather");
    const status = document.querySelector<HTMLElement>("#weather-status");
    const context = canvas?.getContext("2d");

    if (!sky || !stars || !moon || !clouds || !canvas || !status || !context) {
      throw new Error("Atmosphere interface elements are missing.");
    }

    this.#sky = sky;
    this.#stars = stars;
    this.#moon = moon;
    this.#clouds = clouds;
    this.#canvas = canvas;
    this.#status = status;
    this.#context = context;
    this.#enableWeather = options.enableWeather ?? true;
    this.#enableDayNightCycle = options.enableDayNightCycle ?? true;
    this.#gameTime =
      options.gameTime ?? new GameTime({ timeOfDay: DEFAULT_TIME_OF_DAY });
    this.#weatherSeed = normalizedSeed(options.weatherSeed ?? 1);
    this.#worldAtmosphere = new WorldAtmosphere({ seed: this.#weatherSeed });
    this.#weatherParticles = new WorldWeatherParticles(
      this.#weatherSeed,
      DEVICE_PROFILE.weatherParticles,
    );
    this.#allowManualWeatherCycle = options.allowManualWeatherCycle ?? false;
    this.#allowManualTimeCycle = options.allowManualTimeCycle ?? false;
    this.#enableSandstorms = options.enableSandstorms ?? false;
    this.#isSandstormAllowed = options.isSandstormAllowed ?? (() => false);
    const parameters = new URLSearchParams(window.location.search);
    const requestedHour = Number(parameters.get("time"));
    const requestedWeather = parameters.get("weather") as WeatherKind | null;

    if (Number.isFinite(requestedHour) && requestedHour >= 0) {
      this.#gameTime.setTimeOfDay((requestedHour % 24) / 24);
    }
    const initialWeather =
      requestedWeather && WEATHER_SEQUENCE.includes(requestedWeather)
        ? requestedWeather
        : "clear";
    this.#weatherSchedule = weatherScheduleAtTime(
      this.#weatherSeed,
      this.#gameTime.totalTimeSeconds,
      initialWeather,
      this.#weatherAvailability(),
    );
    this.#state = this.#calculateStateWithParticles(0);

    document.addEventListener("keydown", (event) => {
      if (!this.#isActive) {
        return;
      }

      if (event.code === "KeyT" && !event.repeat) {
        this.cycleWeather();
      } else if (event.code === "KeyN" && !event.repeat) {
        this.skipHours(3);
      } else if (event.code === "KeyP" && !event.repeat) {
        this.#gameTime.togglePause();
        this.#applyDom();
      }
    });
    window.addEventListener("resize", () => this.#resize());
    this.#resize();
    this.#applyDom();
  }

  state(): AtmosphereState {
    return this.#state;
  }

  update(
    deltaSeconds: number,
    observer: AtmosphereObserver = this.#observer,
  ): void {
    if (!this.#isActive) {
      return;
    }

    this.#observer = observer;
    const delta = Math.min(deltaSeconds, 0.05);
    const previousWeather = this.#weatherSchedule.weather;

    if (!this.#gameTime.isPaused) {
      if (this.#enableDayNightCycle) {
        this.#gameTime.advance(delta);
      }

      this.#weatherSchedule = advanceWeatherSchedule(
        this.#weatherSchedule,
        delta,
        this.#weatherSeed,
        this.#weatherAvailability(),
      );
    } else if (this.#weatherSchedule.weather === "sandstorm") {
      this.#weatherSchedule = advanceWeatherSchedule(
        this.#weatherSchedule,
        0,
        this.#weatherSeed,
        this.#weatherAvailability(),
      );
    }

    if (previousWeather !== this.#weatherSchedule.weather) {
      this.#resetLightningClock();
    }

    this.#updateLightning(delta);
    this.#state = this.#calculateStateWithParticles(delta);
    this.#applyDom();
    this.#drawWeather();
  }

  cycleWeather(): void {
    if (
      !this.#isActive ||
      !this.#enableWeather ||
      !this.#allowManualWeatherCycle
    ) {
      return;
    }

    const nextWeather = cycleWeatherKind(
      this.#weatherSchedule.weather,
      this.#weatherAvailability(),
    );
    this.#weatherSchedule = {
      weather: nextWeather,
      transitionIndex: this.#weatherSchedule.transitionIndex + 1,
      secondsUntilChange: transitionDelaySeconds(
        this.#weatherSeed,
        this.#weatherSchedule.transitionIndex + 1,
      ),
    };
    this.#resetLightningClock();
    this.#state = this.#calculateStateWithParticles(0);
    this.#applyDom();
  }

  skipHours(hours: number): void {
    if (
      !this.#isActive ||
      !this.#enableDayNightCycle ||
      !this.#allowManualTimeCycle
    ) {
      return;
    }

    this.#gameTime.skipHours(hours);
    this.#state = this.#calculateStateWithParticles(0);
    this.#applyDom();
  }

  destroy(): void {
    this.#isActive = false;
  }

  #weatherAvailability(): WeatherAvailability {
    return {
      enableWeather: this.#enableWeather,
      allowSandstorm:
        this.#enableSandstorms || this.#isSandstormAllowed() === true,
    };
  }

  #calculateState(): AtmosphereState {
    const weather = this.#enableWeather
      ? this.#weatherSchedule.weather
      : "clear";
    const weatherTimeSeconds = this.#gameTime.totalTimeSeconds;
    const worldAtmosphere = this.#worldAtmosphere.snapshot({
      observer: this.#observer,
      timeSeconds: weatherTimeSeconds,
      baseWeather: weather,
      enableWeather: this.#enableWeather,
      allowSandstorm: this.#weatherAvailability().allowSandstorm,
    });
    const state = calculateAtmosphereState(
      weatherTimeSeconds,
      worldAtmosphere.weather,
      this.#lightning,
    );
    const ambient = Math.max(
      0.04,
      state.ambient * (1 - worldAtmosphere.fogDensity * 0.16),
    );

    return {
      ...state,
      ambient,
      weatherIntensity: worldAtmosphere.weatherIntensity,
      cloudCover: worldAtmosphere.cloudCover,
      fogDensity: worldAtmosphere.fogDensity,
      worldAtmosphere,
      rendererLighting: rendererLightingValues({
        ambient,
        daylight: state.daylight,
        weatherIntensity: worldAtmosphere.weatherIntensity,
      }),
    };
  }

  #calculateStateWithParticles(delta: number): AtmosphereState {
    const state = this.#calculateState();

    this.#weatherParticles.update({
      deltaSeconds: delta,
      timeSeconds: state.timeSeconds,
      weather: state.weather,
      intensity: state.weatherIntensity,
      observerPosition: this.#observer.position,
    });

    return {
      ...state,
      weatherParticles: this.#weatherParticles.snapshot(),
    };
  }

  #resetLightningClock(): void {
    this.#lightning = 0;
    this.#lightningSecondAccumulator = 0;
    this.#lightningSecondIndex = 0;
  }

  #updateLightning(delta: number): void {
    this.#lightning = Math.max(0, this.#lightning - delta * 4.5);

    if (this.#weatherSchedule.weather !== "storm" || this.#gameTime.isPaused) {
      return;
    }

    this.#lightningSecondAccumulator += delta;
    while (this.#lightningSecondAccumulator >= 1) {
      this.#lightningSecondAccumulator -= 1;
      this.#lightningSecondIndex += 1;

      if (
        stormCreatesLightningEvent(
          this.#weatherSeed,
          this.#weatherSchedule.transitionIndex,
          this.#lightningSecondIndex,
        )
      ) {
        this.#lightning = 1;
      }
    }
  }

  #applyDom(): void {
    const state = this.#state;
    const profile = WEATHER_PROFILES[state.weather];
    const worldAtmosphere = state.worldAtmosphere;
    const sunPhase = this.#gameTime.timeOfDay;
    const sunAngle = this.#gameTime.sunAngle;
    const sunHeight = Math.sin(sunAngle);
    const night = smoothStep(
      Math.max(0, Math.min(1, (-sunHeight + 0.04) / 0.52)),
    );
    let top = worldAtmosphere?.celestial.skyColor ?? [0.18, 0.46, 0.72];
    let horizon = worldAtmosphere?.celestial.horizonColor ?? [0.76, 0.88, 0.9];

    top = mixColor(top, profile.skyTop, profile.skyTint);
    horizon = mixColor(horizon, profile.skyHorizon, profile.skyTint * 0.86);
    const sunX = 50 + Math.cos(sunPhase * Math.PI * 2) * 37;
    const sunY = 82 - Math.max(0, sunHeight) * 67;
    const moonX = 50 + Math.cos(sunPhase * Math.PI * 2 + Math.PI) * 37;
    const moonY = 82 - Math.max(0, -sunHeight) * 67;
    const celestialCloudFade = 1 - state.cloudCover * 0.72;

    this.#sky.style.setProperty("--sky-top", cssColor(top));
    this.#sky.style.setProperty("--sky-horizon", cssColor(horizon));
    this.#sky.style.setProperty("--sun-x", `${sunX}%`);
    this.#sky.style.setProperty("--sun-y", `${sunY}%`);
    this.#sky.style.setProperty(
      "--sun-opacity",
      `${state.daylight * celestialCloudFade}`,
    );
    this.#stars.style.opacity = `${night * (1 - state.cloudCover * 0.86)}`;
    this.#moon.style.left = `${moonX}%`;
    this.#moon.style.top = `${moonY}%`;
    this.#moon.style.opacity = `${night * celestialCloudFade}`;
    this.#clouds.style.opacity =
      state.weather === "clear"
        ? "0"
        : `${worldAtmosphere?.clouds.opacity ?? Math.pow(state.cloudCover, 1.35)}`;
    this.#clouds.style.filter = `brightness(${0.48 + state.daylight * 0.62}) blur(${state.weather === "fog" ? 4 : 2}px)`;
    if (worldAtmosphere) {
      this.#clouds.style.setProperty(
        "--cloud-offset-x",
        `${worldAtmosphere.clouds.textureOffsetX}px`,
      );
      this.#clouds.style.setProperty(
        "--cloud-offset-y",
        `${worldAtmosphere.clouds.textureOffsetY}px`,
      );
      this.#clouds.style.setProperty(
        "--cloud-screen-x",
        `${worldAtmosphere.clouds.screenOffsetX}px`,
      );
      this.#clouds.style.setProperty(
        "--cloud-screen-y",
        `${worldAtmosphere.clouds.screenOffsetY}px`,
      );
    }
    const controls = [
      this.#enableWeather && this.#allowManualWeatherCycle ? "T weather" : null,
      this.#enableDayNightCycle && this.#allowManualTimeCycle ? "N +3h" : null,
      "P pause",
    ].filter(Boolean);
    this.#status.textContent =
      `${this.#enableWeather ? profile.displayName : "Weather off"} · ` +
      `Day ${this.#gameTime.dayNumber} · ` +
      `${Math.floor(sunPhase * 24)
        .toString()
        .padStart(2, "0")}:00${this.#gameTime.isPaused ? " · Paused" : ""} · ` +
      controls.join(" · ");
    document.body.style.setProperty("--lightning", `${this.#lightning * 0.68}`);
    document.body.style.setProperty(
      "--weather-haze",
      `${Math.min(
        0.42,
        (state.fogDensity ?? state.weatherIntensity * profile.fogMix) * 0.32,
      )}`,
    );
    document.body.style.setProperty(
      "--weather-haze-color",
      profile.fogColor.map((value) => Math.round(value * 255)).join(" "),
    );
  }

  #resize(): void {
    const scale = Math.min(
      window.devicePixelRatio,
      DEVICE_PROFILE.maxPixelRatio,
    );
    this.#canvas.width = Math.max(
      1,
      Math.floor(this.#canvas.clientWidth * scale),
    );
    this.#canvas.height = Math.max(
      1,
      Math.floor(this.#canvas.clientHeight * scale),
    );
  }

  #drawWeather(): void {
    this.#context.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
  }
}
