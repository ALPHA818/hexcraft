import type { WeatherKind } from "./Atmosphere.ts";
import { cloudWindForSeed } from "./CloudLayer.ts";

export const WEATHER_PARTICLE_RADIUS = 28;
export const WEATHER_PARTICLE_VERTICAL_SPAN = 18;

export type WorldWeatherParticle = Readonly<{
  worldX: number;
  worldY: number;
  worldZ: number;
  speed: number;
  length: number;
  drift: number;
  phase: number;
  kind: WeatherKind;
}>;

export type WorldWeatherParticleUpdate = Readonly<{
  deltaSeconds: number;
  timeSeconds: number;
  weather: WeatherKind;
  intensity: number;
  observerPosition: readonly [number, number, number];
}>;

type MutableWorldWeatherParticle = {
  worldX: number;
  worldY: number;
  worldZ: number;
  speed: number;
  length: number;
  drift: number;
  phase: number;
  kind: WeatherKind;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizedSeed(seed: number): number {
  return Number.isFinite(seed) ? Math.trunc(seed) : 1;
}

function random(seed: number, salt: number): number {
  let value = Math.imul(
    normalizedSeed(seed) ^ Math.imul(salt, 0x9e3779b1),
    0x85ebca6b,
  );
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;

  return (value >>> 0) / 0x1_0000_0000;
}

function weatherHasWorldParticles(weather: WeatherKind): boolean {
  return (
    weather === "rain" ||
    weather === "storm" ||
    weather === "snow" ||
    weather === "fog" ||
    weather === "sandstorm"
  );
}

export class WorldWeatherParticles {
  readonly #seed: number;
  readonly #particles: MutableWorldWeatherParticle[];

  #activeCount = 0;
  #spawnSalt = 100_000;

  constructor(seed: number, count: number) {
    this.#seed = normalizedSeed(seed);
    this.#particles = Array.from({ length: Math.max(0, count) }, (_, index) =>
      this.#createParticle(index, [0, 0, 0], "clear"),
    );
  }

  update(input: WorldWeatherParticleUpdate): number {
    const intensity = clamp01(input.intensity);

    if (!weatherHasWorldParticles(input.weather) || intensity <= 0) {
      this.#activeCount = 0;
      return 0;
    }

    const delta = Math.min(Math.max(0, input.deltaSeconds), 0.05);
    const desiredCount = Math.min(
      this.#particles.length,
      Math.floor(this.#particles.length * intensity),
    );
    const wind = cloudWindForSeed(this.#seed);

    this.#activeCount = desiredCount;
    for (let index = 0; index < desiredCount; index += 1) {
      const particle = this.#particles[index]!;

      if (
        particle.kind !== input.weather ||
        this.#isOutsideObserverBubble(particle, input.observerPosition)
      ) {
        this.#particles[index] = this.#createParticle(
          this.#spawnSalt++,
          input.observerPosition,
          input.weather,
        );
        continue;
      }

      if (input.weather === "sandstorm") {
        particle.worldX += wind[0] * delta * (5.5 + particle.speed);
        particle.worldZ += wind[1] * delta * (5.5 + particle.speed);
        particle.worldY +=
          Math.sin(input.timeSeconds * 4 + particle.phase) * delta * 0.24;
      } else if (input.weather === "fog") {
        particle.worldX += wind[0] * delta * (0.9 + particle.speed * 0.18);
        particle.worldZ += wind[1] * delta * (0.9 + particle.speed * 0.18);
        particle.worldY +=
          Math.sin(input.timeSeconds * 0.5 + particle.phase) * delta * 0.05;
      } else {
        const fallScale =
          input.weather === "snow"
            ? 1.65
            : input.weather === "storm"
              ? 10.8
              : 7.2;
        particle.worldY -= particle.speed * fallScale * delta;
        particle.worldX +=
          (wind[0] * 0.85 +
            particle.drift +
            Math.sin(input.timeSeconds + particle.phase) * 0.08) *
          delta;
        particle.worldZ += (wind[1] * 0.85 + particle.drift * 0.35) * delta;
      }

      if (
        particle.worldY < input.observerPosition[1] - 3 ||
        particle.worldY >
          input.observerPosition[1] + WEATHER_PARTICLE_VERTICAL_SPAN + 5 ||
        this.#isOutsideObserverBubble(particle, input.observerPosition)
      ) {
        this.#particles[index] = this.#createParticle(
          this.#spawnSalt++,
          input.observerPosition,
          input.weather,
        );
      }
    }

    return this.#activeCount;
  }

  activeParticleCount(): number {
    return this.#activeCount;
  }

  particle(index: number): WorldWeatherParticle | null {
    return index >= 0 && index < this.#activeCount
      ? (this.#particles[index] ?? null)
      : null;
  }

  snapshot(): readonly WorldWeatherParticle[] {
    return this.#particles.slice(0, this.#activeCount).map((particle) => ({
      ...particle,
    }));
  }

  #isOutsideObserverBubble(
    particle: WorldWeatherParticle,
    observerPosition: readonly [number, number, number],
  ): boolean {
    const dx = particle.worldX - observerPosition[0];
    const dz = particle.worldZ - observerPosition[2];

    return (
      dx * dx + dz * dz > WEATHER_PARTICLE_RADIUS * WEATHER_PARTICLE_RADIUS
    );
  }

  #createParticle(
    salt: number,
    observerPosition: readonly [number, number, number],
    kind: WeatherKind,
  ): MutableWorldWeatherParticle {
    const angle = random(this.#seed, salt * 7 + 1) * Math.PI * 2;
    const radius =
      Math.sqrt(random(this.#seed, salt * 7 + 2)) * WEATHER_PARTICLE_RADIUS;
    const height =
      random(this.#seed, salt * 7 + 3) * WEATHER_PARTICLE_VERTICAL_SPAN;

    return {
      worldX: observerPosition[0] + Math.cos(angle) * radius,
      worldY: observerPosition[1] + 2 + height,
      worldZ: observerPosition[2] + Math.sin(angle) * radius,
      speed: 0.65 + random(this.#seed, salt * 7 + 4) * 0.95,
      length: 8 + random(this.#seed, salt * 7 + 5) * 18,
      drift: -0.22 + random(this.#seed, salt * 7 + 6) * 0.44,
      phase: random(this.#seed, salt * 7 + 7) * Math.PI * 2,
      kind,
    };
  }
}
