import { PlayerStats } from "./PlayerStats.ts";
import type { GameMode } from "./gameMode.ts";

export type SurvivalFrameState = Readonly<{
  grounded: boolean;
  fallDistance: number;
  sprinting: boolean;
  inWater: boolean;
}>;

export type SurvivalStatsControllerOptions = Readonly<{
  mode: GameMode;
  stats?: PlayerStats;
  onDeath?: () => void;
  onRespawn?: () => void;
}>;

const HUNGER_DRAIN_PER_SECOND = 0.18;
const SPRINT_STAMINA_DRAIN_PER_SECOND = 18;
const STAMINA_RECOVERY_PER_SECOND = 14;
const OXYGEN_DRAIN_PER_SECOND = 28;
const OXYGEN_RECOVERY_PER_SECOND = 42;
const DROWNING_DAMAGE_PER_SECOND = 10;
const STARVATION_DAMAGE_PER_SECOND = 3;
const SAFE_FALL_DISTANCE = 3.2;
const FALL_DAMAGE_PER_BLOCK = 6;
const RESPAWN_DELAY_SECONDS = 2;

export class SurvivalStatsController {
  readonly #mode: GameMode;
  readonly #stats: PlayerStats;
  readonly #onDeath: () => void;
  readonly #onRespawn: () => void;

  #deathElapsed = 0;
  #deathAnnounced = false;

  constructor(options: SurvivalStatsControllerOptions) {
    this.#mode = options.mode;
    this.#stats = options.stats ?? new PlayerStats();
    this.#onDeath = options.onDeath ?? (() => {});
    this.#onRespawn = options.onRespawn ?? (() => {});

    if (this.#mode === "creative") {
      this.#stats.reset();
    }
  }

  get stats(): PlayerStats {
    return this.#stats;
  }

  get enabled(): boolean {
    return this.#mode === "survival";
  }

  update(deltaSeconds: number, frame: SurvivalFrameState): void {
    const delta = Math.min(Math.max(deltaSeconds, 0), 0.25);

    if (!this.enabled) {
      this.#stats.reset();
      return;
    }

    if (this.#stats.isDead) {
      this.#advanceDeath(delta);
      return;
    }

    this.#stats.changeHunger(-HUNGER_DRAIN_PER_SECOND * delta);

    if (frame.sprinting && this.#stats.stamina > 0) {
      this.#stats.changeStamina(-SPRINT_STAMINA_DRAIN_PER_SECOND * delta);
    } else {
      this.#stats.changeStamina(STAMINA_RECOVERY_PER_SECOND * delta);
    }

    if (frame.inWater) {
      this.#stats.changeOxygen(-OXYGEN_DRAIN_PER_SECOND * delta);
    } else {
      this.#stats.changeOxygen(OXYGEN_RECOVERY_PER_SECOND * delta);
    }

    if (frame.grounded && frame.fallDistance > SAFE_FALL_DISTANCE) {
      this.#stats.damage(
        (frame.fallDistance - SAFE_FALL_DISTANCE) * FALL_DAMAGE_PER_BLOCK,
      );
    }

    if (this.#stats.oxygen <= 0) {
      this.#stats.damage(DROWNING_DAMAGE_PER_SECOND * delta);
    }
    if (this.#stats.hunger <= 0) {
      this.#stats.damage(STARVATION_DAMAGE_PER_SECOND * delta);
    }

    if (this.#stats.isDead && !this.#deathAnnounced) {
      this.#deathAnnounced = true;
      this.#deathElapsed = 0;
      this.#onDeath();
    }
  }

  damage(amount: number): void {
    if (!this.enabled) {
      return;
    }

    this.#stats.damage(amount);
    if (this.#stats.isDead && !this.#deathAnnounced) {
      this.#deathAnnounced = true;
      this.#deathElapsed = 0;
      this.#onDeath();
    }
  }

  respawn(): void {
    this.#stats.reset();
    this.#deathElapsed = 0;
    this.#deathAnnounced = false;
    this.#onRespawn();
  }

  #advanceDeath(deltaSeconds: number): void {
    if (!this.#deathAnnounced) {
      this.#deathAnnounced = true;
      this.#deathElapsed = 0;
      this.#onDeath();
    }

    this.#deathElapsed += deltaSeconds;
    if (this.#deathElapsed >= RESPAWN_DELAY_SECONDS) {
      this.respawn();
    }
  }
}
