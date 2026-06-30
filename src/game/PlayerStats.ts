export type PlayerStatsSnapshot = Readonly<{
  health: number;
  hunger: number;
  stamina: number;
  oxygen: number;
  isDead: boolean;
}>;

export const PLAYER_STAT_LIMITS = {
  maxHealth: 100,
  maxHunger: 100,
  maxStamina: 100,
  maxOxygen: 100,
} as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export class PlayerStats {
  #health: number = PLAYER_STAT_LIMITS.maxHealth;
  #hunger: number = PLAYER_STAT_LIMITS.maxHunger;
  #stamina: number = PLAYER_STAT_LIMITS.maxStamina;
  #oxygen: number = PLAYER_STAT_LIMITS.maxOxygen;
  #isDead = false;

  snapshot(): PlayerStatsSnapshot {
    return {
      health: this.#health,
      hunger: this.#hunger,
      stamina: this.#stamina,
      oxygen: this.#oxygen,
      isDead: this.#isDead,
    };
  }

  reset(): void {
    this.#health = PLAYER_STAT_LIMITS.maxHealth;
    this.#hunger = PLAYER_STAT_LIMITS.maxHunger;
    this.#stamina = PLAYER_STAT_LIMITS.maxStamina;
    this.#oxygen = PLAYER_STAT_LIMITS.maxOxygen;
    this.#isDead = false;
  }

  damage(amount: number): void {
    if (this.#isDead || amount <= 0) {
      return;
    }

    this.#health = clamp(
      this.#health - amount,
      0,
      PLAYER_STAT_LIMITS.maxHealth,
    );
    if (this.#health <= 0) {
      this.#isDead = true;
    }
  }

  restoreHealth(amount: number): void {
    if (this.#isDead || amount <= 0) {
      return;
    }

    this.#health = clamp(
      this.#health + amount,
      0,
      PLAYER_STAT_LIMITS.maxHealth,
    );
  }

  setHunger(value: number): void {
    this.#hunger = clamp(value, 0, PLAYER_STAT_LIMITS.maxHunger);
  }

  changeHunger(amount: number): void {
    this.setHunger(this.#hunger + amount);
  }

  setStamina(value: number): void {
    this.#stamina = clamp(value, 0, PLAYER_STAT_LIMITS.maxStamina);
  }

  changeStamina(amount: number): void {
    this.setStamina(this.#stamina + amount);
  }

  setOxygen(value: number): void {
    this.#oxygen = clamp(value, 0, PLAYER_STAT_LIMITS.maxOxygen);
  }

  changeOxygen(amount: number): void {
    this.setOxygen(this.#oxygen + amount);
  }

  get health(): number {
    return this.#health;
  }

  get hunger(): number {
    return this.#hunger;
  }

  get stamina(): number {
    return this.#stamina;
  }

  get oxygen(): number {
    return this.#oxygen;
  }

  get isDead(): boolean {
    return this.#isDead;
  }
}
