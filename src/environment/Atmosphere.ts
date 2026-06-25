import { DEVICE_PROFILE } from "../platform/deviceProfile.ts";

export type WeatherKind = "clear" | "rain" | "storm" | "snow";

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
}>;

type Particle = {
  x: number;
  y: number;
  speed: number;
  length: number;
  drift: number;
  phase: number;
};

const WEATHER_SEQUENCE: readonly WeatherKind[] = [
  "clear",
  "rain",
  "storm",
  "snow",
];
export const DAY_NIGHT_CYCLE_SECONDS = 30 * 60;
export const DAY_OR_NIGHT_SECONDS = DAY_NIGHT_CYCLE_SECONDS / 2;
const INITIAL_DAY_PHASE = 0.4;

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

export function calculateAtmosphereState(
  timeSeconds: number,
  weather: WeatherKind,
  lightning = 0,
): AtmosphereState {
  const dayPhase = timeSeconds / DAY_NIGHT_CYCLE_SECONDS;
  const sunAngle = dayPhase * Math.PI * 2 - Math.PI / 2;
  const sunHeight = Math.sin(sunAngle);
  const daylight = smoothStep(
    Math.max(0, Math.min(1, (sunHeight + 0.12) / 0.88)),
  );
  const twilight = Math.max(0, 1 - Math.abs(sunHeight) / 0.32);
  const cloudCover =
    weather === "clear"
      ? 0.03
      : weather === "rain"
        ? 0.68
        : weather === "storm"
          ? 0.94
          : 0.62;
  const weatherIntensity =
    weather === "clear"
      ? 0
      : weather === "rain"
        ? 0.68
        : weather === "storm"
          ? 1
          : 0.58;
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
  const weatherFog: [number, number, number] =
    weather === "snow" ? [0.72, 0.78, 0.82] : [0.25, 0.33, 0.38];
  const baseFog = mixColor(nightFog, dayFog, daylight);
  let fogColor = mixColor(
    baseFog,
    weatherFog,
    cloudCover * (weather === "clear" ? 0.1 : 0.55),
  );
  fogColor = mixColor(
    fogColor,
    [0.88, 0.31, 0.16],
    twilight * (1 - cloudCover) * 0.34,
  );
  const ambient =
    (0.09 + daylight * 0.27) * (1 - cloudCover * 0.38) +
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

  #weatherIndex = 0;
  #timeSeconds = DAY_NIGHT_CYCLE_SECONDS * INITIAL_DAY_PHASE;
  #paused = false;
  #lightning = 0;
  #lightningTimer = 5;
  #state: AtmosphereState;

  constructor() {
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
    const parameters = new URLSearchParams(window.location.search);
    const requestedHour = Number(parameters.get("time"));
    const requestedWeather = parameters.get("weather") as WeatherKind | null;

    if (Number.isFinite(requestedHour) && requestedHour >= 0) {
      this.#timeSeconds =
        ((requestedHour % 24) / 24) * DAY_NIGHT_CYCLE_SECONDS;
    }
    if (requestedWeather && WEATHER_SEQUENCE.includes(requestedWeather)) {
      this.#weatherIndex = WEATHER_SEQUENCE.indexOf(requestedWeather);
    }
    this.#state = this.#calculateState();

    for (let index = 0; index < DEVICE_PROFILE.weatherParticles; index += 1) {
      this.#particles.push({
        x: Math.random(),
        y: Math.random(),
        speed: 0.45 + Math.random() * 0.75,
        length: 8 + Math.random() * 18,
        drift: -0.1 + Math.random() * 0.08,
        phase: Math.random() * Math.PI * 2,
      });
    }

    document.addEventListener("keydown", (event) => {
      if (event.code === "KeyT" && !event.repeat) {
        this.cycleWeather();
      } else if (event.code === "KeyN" && !event.repeat) {
        this.skipHours(3);
      } else if (event.code === "KeyP" && !event.repeat) {
        this.#paused = !this.#paused;
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
    const delta = Math.min(deltaSeconds, 0.05);
    if (!this.#paused) {
      this.#timeSeconds =
        (this.#timeSeconds + delta) % DAY_NIGHT_CYCLE_SECONDS;
    }
    this.#state = this.#calculateState();

    if (this.#state.weather === "storm") {
      this.#lightningTimer -= delta;
      if (this.#lightningTimer <= 0) {
        this.#lightning = 1;
        this.#lightningTimer = 4 + Math.random() * 8;
      }
    }
    this.#lightning = Math.max(0, this.#lightning - delta * 4.5);
    this.#applyDom();
    this.#drawWeather(delta);
  }

  cycleWeather(): void {
    this.#weatherIndex =
      (this.#weatherIndex + 1) % WEATHER_SEQUENCE.length;
    this.#state = this.#calculateState();
    this.#applyDom();
  }

  skipHours(hours: number): void {
    const secondsPerHour = DAY_NIGHT_CYCLE_SECONDS / 24;
    this.#timeSeconds =
      (this.#timeSeconds + hours * secondsPerHour) %
      DAY_NIGHT_CYCLE_SECONDS;
    this.#state = this.#calculateState();
    this.#applyDom();
  }

  #calculateState(): AtmosphereState {
    const weather = WEATHER_SEQUENCE[this.#weatherIndex]!;
    return calculateAtmosphereState(
      this.#timeSeconds,
      weather,
      this.#lightning,
    );
  }

  #applyDom(): void {
    const state = this.#state;
    const dayTop: [number, number, number] = [0.18, 0.46, 0.72];
    const dayHorizon: [number, number, number] = [0.76, 0.88, 0.9];
    const nightTop: [number, number, number] = [0.015, 0.025, 0.075];
    const nightHorizon: [number, number, number] = [0.08, 0.11, 0.18];
    const twilightTop: [number, number, number] = [0.19, 0.08, 0.27];
    const twilightHorizon: [number, number, number] = [1, 0.31, 0.12];
    const overcast: [number, number, number] = [0.25, 0.31, 0.35];
    const sunPhase = this.#timeSeconds / DAY_NIGHT_CYCLE_SECONDS;
    const sunAngle = sunPhase * Math.PI * 2 - Math.PI / 2;
    const sunHeight = Math.sin(sunAngle);
    const night = smoothStep(
      Math.max(0, Math.min(1, (-sunHeight + 0.04) / 0.52)),
    );
    const twilight = Math.max(
      0,
      1 - Math.abs(sunHeight + 0.01) / 0.3,
    );
    let top = mixColor(nightTop, dayTop, state.daylight);
    let horizon = mixColor(nightHorizon, dayHorizon, state.daylight);
    top = mixColor(top, twilightTop, twilight * 0.7);
    horizon = mixColor(horizon, twilightHorizon, twilight * 0.88);
    top = mixColor(top, overcast, state.cloudCover * 0.62);
    horizon = mixColor(horizon, overcast, state.cloudCover * 0.45);
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
    this.#stars.style.opacity =
      `${night * (1 - state.cloudCover * 0.86)}`;
    this.#moon.style.left = `${moonX}%`;
    this.#moon.style.top = `${moonY}%`;
    this.#moon.style.opacity = `${night * celestialCloudFade}`;
    this.#clouds.style.opacity =
      state.weather === "clear"
        ? "0"
        : `${Math.pow(state.cloudCover, 1.35)}`;
    this.#clouds.style.filter =
      `brightness(${0.55 + state.daylight * 0.62}) blur(2px)`;
    this.#status.textContent =
      `${state.weather[0]!.toUpperCase()}${state.weather.slice(1)} · ` +
      `${Math.floor(sunPhase * 24)
        .toString()
        .padStart(2, "0")}:00${this.#paused ? " · Paused" : ""} · ` +
      "T weather · N +3h · P pause";
    document.body.style.setProperty(
      "--lightning",
      `${this.#lightning * 0.68}`,
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

  #drawWeather(delta: number): void {
    const context = this.#context;
    const width = this.#canvas.width;
    const height = this.#canvas.height;
    const state = this.#state;
    context.clearRect(0, 0, width, height);

    if (state.weather === "clear") {
      return;
    }

    const count = Math.floor(
      this.#particles.length * state.weatherIntensity,
    );
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
            Math.sin(this.#timeSeconds * 1.8 + particle.phase) * 0.035) *
          delta;
        if (particle.y > 1.04) {
          particle.y = -0.04;
          particle.x = Math.random();
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

    context.strokeStyle =
      state.weather === "storm"
        ? "rgb(180 213 230 / 62%)"
        : "rgb(190 225 239 / 48%)";
    context.lineWidth = scale;
    context.beginPath();
    for (let index = 0; index < count; index += 1) {
      const particle = this.#particles[index]!;
      particle.y += particle.speed * delta * (state.weather === "storm" ? 1.5 : 1);
      particle.x += particle.drift * delta;
      if (particle.y > 1.08) {
        particle.y = -0.08;
        particle.x = Math.random();
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
