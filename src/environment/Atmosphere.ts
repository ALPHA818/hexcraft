import { DEVICE_PROFILE } from "../platform/deviceProfile.ts";
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

type Particle = {
  x: number;
  y: number;
  speed: number;
  length: number;
  drift: number;
  phase: number;
};

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
  readonly #particles: Particle[] = [];
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
  #particleSpawnSalt = 50_000;
  #isActive = true;
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
    this.#weatherSchedule = createWeatherSchedule(
      this.#weatherSeed,
      initialWeather,
      this.#weatherAvailability(),
    );
    this.#state = this.#calculateState();

    for (let index = 0; index < DEVICE_PROFILE.weatherParticles; index += 1) {
      this.#particles.push({
        x: seededWeatherRandom(this.#weatherSeed, 10_000 + index * 6),
        y: seededWeatherRandom(this.#weatherSeed, 10_001 + index * 6),
        speed:
          0.45 +
          seededWeatherRandom(this.#weatherSeed, 10_002 + index * 6) * 0.75,
        length:
          8 + seededWeatherRandom(this.#weatherSeed, 10_003 + index * 6) * 18,
        drift:
          -0.1 +
          seededWeatherRandom(this.#weatherSeed, 10_004 + index * 6) * 0.08,
        phase:
          seededWeatherRandom(this.#weatherSeed, 10_005 + index * 6) *
          Math.PI *
          2,
      });
    }

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

  update(deltaSeconds: number): void {
    if (!this.#isActive) {
      return;
    }

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
    this.#state = this.#calculateState();
    this.#applyDom();
    this.#drawWeather(delta);
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
    this.#state = this.#calculateState();
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
    this.#state = this.#calculateState();
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
    return calculateAtmosphereState(
      this.#gameTime.timeSeconds,
      weather,
      this.#lightning,
    );
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
    const dayTop: [number, number, number] = [0.18, 0.46, 0.72];
    const dayHorizon: [number, number, number] = [0.76, 0.88, 0.9];
    const nightTop: [number, number, number] = [0.015, 0.025, 0.075];
    const nightHorizon: [number, number, number] = [0.08, 0.11, 0.18];
    const twilightTop: [number, number, number] = [0.19, 0.08, 0.27];
    const twilightHorizon: [number, number, number] = [1, 0.31, 0.12];
    const overcast: [number, number, number] = [0.25, 0.31, 0.35];
    const sunPhase = this.#gameTime.timeOfDay;
    const sunAngle = this.#gameTime.sunAngle;
    const sunHeight = Math.sin(sunAngle);
    const night = smoothStep(
      Math.max(0, Math.min(1, (-sunHeight + 0.04) / 0.52)),
    );
    const twilight = Math.max(0, 1 - Math.abs(sunHeight + 0.01) / 0.3);
    let top = mixColor(nightTop, dayTop, state.daylight);
    let horizon = mixColor(nightHorizon, dayHorizon, state.daylight);
    top = mixColor(top, twilightTop, twilight * 0.7);
    horizon = mixColor(horizon, twilightHorizon, twilight * 0.88);
    top = mixColor(top, overcast, state.cloudCover * 0.42);
    horizon = mixColor(horizon, overcast, state.cloudCover * 0.32);
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
      state.weather === "clear" ? "0" : `${Math.pow(state.cloudCover, 1.35)}`;
    this.#clouds.style.filter = `brightness(${0.48 + state.daylight * 0.62}) blur(${state.weather === "fog" ? 4 : 2}px)`;
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
      `${Math.min(0.42, state.weatherIntensity * profile.fogMix * 0.28)}`,
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

  #nextParticleSpawnX(): number {
    const x = seededWeatherRandom(this.#weatherSeed, this.#particleSpawnSalt);
    this.#particleSpawnSalt += 1;

    return x;
  }

  #drawFogLikeWeather(
    count: number,
    delta: number,
    color: string,
    speedScale: number,
  ): void {
    const context = this.#context;
    const width = this.#canvas.width;
    const height = this.#canvas.height;
    const timeSeconds = this.#gameTime.timeSeconds;

    context.fillStyle = color;
    for (let index = 0; index < count; index += 1) {
      const particle = this.#particles[index]!;
      particle.x += (particle.drift * 0.28 + 0.012) * delta * speedScale;
      particle.y += Math.sin(timeSeconds * 0.4 + particle.phase) * 0.0008;

      if (particle.x > 1.12) {
        particle.x = -0.12;
        particle.y = seededWeatherRandom(
          this.#weatherSeed,
          this.#particleSpawnSalt++,
        );
      }

      context.beginPath();
      context.ellipse(
        particle.x * width,
        particle.y * height,
        particle.length * 4.8,
        particle.length * 1.1,
        Math.sin(particle.phase) * 0.2,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  }

  #drawWeather(delta: number): void {
    const context = this.#context;
    const width = this.#canvas.width;
    const height = this.#canvas.height;
    const state = this.#state;
    const timeSeconds = this.#gameTime.timeSeconds;
    context.clearRect(0, 0, width, height);

    if (state.weather === "clear") {
      return;
    }

    const count = Math.floor(this.#particles.length * state.weatherIntensity);
    const scale = Math.min(
      window.devicePixelRatio,
      DEVICE_PROFILE.maxPixelRatio,
    );

    if (state.weather === "snow") {
      context.fillStyle = "rgb(245 250 255 / 78%)";
      for (let index = 0; index < count; index += 1) {
        const particle = this.#particles[index]!;
        particle.y += particle.speed * delta * 0.22;
        particle.x +=
          (particle.drift +
            Math.sin(timeSeconds * 1.8 + particle.phase) * 0.035) *
          delta;
        if (particle.y > 1.04) {
          particle.y = -0.04;
          particle.x = this.#nextParticleSpawnX();
        }
        if (particle.x < -0.04) particle.x = 1.04;
        if (particle.x > 1.04) particle.x = -0.04;
        context.beginPath();
        context.arc(
          particle.x * width,
          particle.y * height,
          (1.5 + particle.length * 0.08) * scale,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
      return;
    }

    if (state.weather === "fog") {
      this.#drawFogLikeWeather(count, delta, "rgb(226 232 225 / 10%)", 0.8);
      return;
    }

    if (state.weather === "cloudy") {
      this.#drawFogLikeWeather(
        Math.floor(count * 0.55),
        delta,
        "rgb(214 224 224 / 5%)",
        0.35,
      );
      return;
    }

    if (state.weather === "sandstorm") {
      context.strokeStyle = "rgb(226 176 92 / 36%)";
      context.lineWidth = Math.max(1, scale * 1.25);
      context.beginPath();
      for (let index = 0; index < count; index += 1) {
        const particle = this.#particles[index]!;
        particle.x -= particle.speed * delta * 0.6;
        particle.y +=
          Math.sin(timeSeconds * 4 + particle.phase) * delta * 0.015;
        if (particle.x < -0.1) {
          particle.x = 1.1;
          particle.y = seededWeatherRandom(
            this.#weatherSeed,
            this.#particleSpawnSalt++,
          );
        }
        const x = particle.x * width;
        const y = particle.y * height;
        const length = particle.length * scale * 2.4;
        context.moveTo(x, y);
        context.lineTo(x - length, y + length * 0.18);
      }
      context.stroke();
      this.#drawFogLikeWeather(
        Math.floor(count * 0.28),
        delta,
        "rgb(190 126 47 / 9%)",
        1.35,
      );
      return;
    }

    context.strokeStyle =
      state.weather === "storm"
        ? "rgb(180 213 230 / 62%)"
        : "rgb(190 225 239 / 48%)";
    context.lineWidth = scale;
    context.beginPath();
    for (let index = 0; index < count; index += 1) {
      const particle = this.#particles[index]!;
      particle.y +=
        particle.speed * delta * (state.weather === "storm" ? 1.5 : 1);
      particle.x += particle.drift * delta;
      if (particle.y > 1.08) {
        particle.y = -0.08;
        particle.x = this.#nextParticleSpawnX();
      }
      if (particle.x < -0.05) particle.x = 1.05;
      const x = particle.x * width;
      const y = particle.y * height;
      context.moveTo(x, y);
      context.lineTo(
        x + particle.drift * particle.length * scale * 2,
        y + particle.length * scale,
      );
    }
    context.stroke();
  }
}
