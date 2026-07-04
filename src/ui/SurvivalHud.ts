import {
  PLAYER_STAT_LIMITS,
  type PlayerStatsSnapshot,
} from "../game/PlayerStats.ts";
import type { GameMode } from "../game/gameMode.ts";

type HudBar = Readonly<{
  root: HTMLElement;
  fill: HTMLElement;
  value: HTMLElement;
}>;

const BAR_META = [
  ["health", "Health", PLAYER_STAT_LIMITS.maxHealth],
  ["hunger", "Hunger", PLAYER_STAT_LIMITS.maxHunger],
  ["stamina", "Stamina", PLAYER_STAT_LIMITS.maxStamina],
  ["oxygen", "Oxygen", PLAYER_STAT_LIMITS.maxOxygen],
] as const;

export class SurvivalHud {
  readonly #root: HTMLElement;
  readonly #bars = new Map<keyof PlayerStatsSnapshot, HudBar>();
  readonly #mode: GameMode;
  readonly #warnings: HTMLElement;

  #warningText = "";

  constructor(root: HTMLElement, mode: GameMode) {
    this.#root = root;
    this.#mode = mode;
    this.#warnings = document.createElement("p");
    this.#warnings.className = "survival-warnings";
    this.#warnings.hidden = true;
    this.#root.className = "survival-hud";
    this.#root.replaceChildren(
      ...BAR_META.map(([key, label]) => this.#createBar(key, label)),
      this.#warnings,
    );
    this.#root.hidden = mode !== "survival";
  }

  update(stats: PlayerStatsSnapshot, warnings: readonly string[] = []): void {
    this.#root.hidden = this.#mode !== "survival";
    if (this.#root.hidden) {
      return;
    }

    for (const [key, , maximum] of BAR_META) {
      const value = stats[key];
      const bar = this.#bars.get(key);

      if (!bar) {
        continue;
      }

      const ratio = Math.max(0, Math.min(1, value / maximum));
      bar.root.style.setProperty("--value", String(ratio));
      bar.fill.style.transform = `scaleX(${ratio})`;
      bar.value.textContent = `${Math.ceil(value)}/${maximum}`;
    }

    this.#root.classList.toggle("is-dead", stats.isDead);
    this.#updateWarnings(warnings);
  }

  destroy(): void {
    this.#root.hidden = true;
    this.#root.replaceChildren();
    this.#bars.clear();
    this.#warningText = "";
  }

  #createBar(key: keyof PlayerStatsSnapshot, label: string): HTMLElement {
    const row = document.createElement("div");
    const name = document.createElement("span");
    const track = document.createElement("div");
    const fill = document.createElement("i");
    const value = document.createElement("strong");

    row.className = `survival-bar ${key}`;
    name.textContent = label;
    track.className = "survival-bar-track";
    fill.className = "survival-bar-fill";
    value.textContent = "100/100";
    track.append(fill);
    row.append(name, track, value);
    this.#bars.set(key, { root: row, fill, value });
    return row;
  }

  #updateWarnings(warnings: readonly string[]): void {
    const text = warnings.join(" · ");

    this.#warnings.hidden = text.length === 0;
    if (text !== this.#warningText) {
      this.#warningText = text;
      this.#warnings.textContent = text;
    }
  }
}
