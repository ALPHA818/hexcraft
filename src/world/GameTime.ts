export type SerializedGameTimeState = Readonly<{
  timeOfDay: number;
  dayNumber: number;
  paused: boolean;
}>;

export type GameTimeOptions = Readonly<{
  timeOfDay?: number;
  dayNumber?: number;
  paused?: boolean;
  dayLengthSeconds?: number;
}>;

export const DAY_NIGHT_CYCLE_SECONDS = 30 * 60;
export const DAY_OR_NIGHT_SECONDS = DAY_NIGHT_CYCLE_SECONDS / 2;
export const DEFAULT_TIME_OF_DAY = 0.4;
const TAU = Math.PI * 2;

function smoothStep(value: number): number {
  return value * value * (3 - 2 * value);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizedTimeOfDay(value: unknown): number {
  const finite = finiteNumber(value, DEFAULT_TIME_OF_DAY);
  const wrapped = finite - Math.floor(finite);

  return wrapped < 0 ? wrapped + 1 : wrapped;
}

function normalizedDayNumber(value: unknown): number {
  return Math.max(1, Math.floor(finiteNumber(value, 1)));
}

function normalizedPaused(value: unknown): boolean {
  return typeof value === "boolean" ? value : false;
}

export function defaultSerializedGameTimeState(): SerializedGameTimeState {
  return {
    timeOfDay: DEFAULT_TIME_OF_DAY,
    dayNumber: 1,
    paused: false,
  };
}

export function normalizeSerializedGameTimeState(
  value: unknown,
): SerializedGameTimeState {
  if (typeof value !== "object" || value === null) {
    return defaultSerializedGameTimeState();
  }

  const state = value as Partial<SerializedGameTimeState>;

  return {
    timeOfDay: normalizedTimeOfDay(state.timeOfDay),
    dayNumber: normalizedDayNumber(state.dayNumber),
    paused: normalizedPaused(state.paused),
  };
}

export class GameTime {
  readonly #dayLengthSeconds: number;

  #timeOfDay: number;
  #dayNumber: number;
  #paused: boolean;

  constructor(options: GameTimeOptions = {}) {
    this.#timeOfDay = normalizedTimeOfDay(options.timeOfDay);
    this.#dayNumber = normalizedDayNumber(options.dayNumber);
    this.#paused = normalizedPaused(options.paused);
    this.#dayLengthSeconds = Math.max(
      1,
      finiteNumber(options.dayLengthSeconds, DAY_NIGHT_CYCLE_SECONDS),
    );
  }

  static fromSerialized(state: unknown): GameTime {
    return new GameTime(normalizeSerializedGameTimeState(state));
  }

  get timeOfDay(): number {
    return this.#timeOfDay;
  }

  get dayNumber(): number {
    return this.#dayNumber;
  }

  get isPaused(): boolean {
    return this.#paused;
  }

  get timeSeconds(): number {
    return this.#timeOfDay * this.#dayLengthSeconds;
  }

  get sunAngle(): number {
    return this.#timeOfDay * TAU - Math.PI / 2;
  }

  get moonAngle(): number {
    return this.sunAngle + Math.PI;
  }

  get isDay(): boolean {
    return Math.sin(this.sunAngle) >= 0;
  }

  get isNight(): boolean {
    return !this.isDay;
  }

  get daylight(): number {
    return smoothStep(
      Math.max(0, Math.min(1, (Math.sin(this.sunAngle) + 0.12) / 0.88)),
    );
  }

  get ambientLight(): number {
    const sunHeight = Math.sin(this.sunAngle);
    const twilight = Math.max(0, 1 - Math.abs(sunHeight) / 0.32);

    return 0.09 + this.daylight * 0.27 + twilight * 0.08;
  }

  advance(deltaSeconds: number): void {
    if (this.#paused) {
      return;
    }

    this.#advanceTimeFraction(
      Math.max(0, deltaSeconds) / this.#dayLengthSeconds,
    );
  }

  skipHours(hours: number): void {
    this.#advanceTimeFraction(finiteNumber(hours, 0) / 24);
  }

  setTimeOfDay(timeOfDay: number): void {
    this.#timeOfDay = normalizedTimeOfDay(timeOfDay);
  }

  pause(): void {
    this.#paused = true;
  }

  resume(): void {
    this.#paused = false;
  }

  togglePause(): void {
    this.#paused = !this.#paused;
  }

  snapshot(): SerializedGameTimeState {
    return {
      timeOfDay: this.#timeOfDay,
      dayNumber: this.#dayNumber,
      paused: this.#paused,
    };
  }

  #advanceTimeFraction(deltaTimeOfDay: number): void {
    if (deltaTimeOfDay <= 0) {
      return;
    }

    const next = this.#timeOfDay + deltaTimeOfDay;
    const elapsedDays = Math.floor(next);

    this.#timeOfDay = next - elapsedDays;
    this.#dayNumber += elapsedDays;
  }
}
