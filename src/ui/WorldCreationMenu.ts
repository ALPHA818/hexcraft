import type { GameSettings } from "../game/GameSettings.ts";
import type { GameMode } from "../game/gameMode.ts";
import {
  defaultStartingInventoryMode,
  isStartingInventoryMode,
  type StartingInventoryMode,
} from "../game/StartingInventory.ts";

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export type WorldCreationMenuCallbacks = Readonly<{
  startWorld: (settings: GameSettings) => void;
  back: () => void;
}>;

export class WorldCreationMenu {
  readonly #root: HTMLElement;
  readonly #callbacks: WorldCreationMenuCallbacks;

  constructor(root: HTMLElement, callbacks: WorldCreationMenuCallbacks) {
    this.#root = root;
    this.#callbacks = callbacks;
  }

  show(settings: GameSettings): void {
    const panel = document.createElement("section");
    const title = document.createElement("h2");
    const form = document.createElement("form");

    panel.className = "menu-panel wide";
    title.textContent = "Create New World";
    form.className = "menu-form";
    form.innerHTML = `
      <label>
        <span>World name</span>
        <input name="worldName" type="text" value="${escapeAttribute(settings.worldName)}" autocomplete="off" />
      </label>
      <label>
        <span>Seed</span>
        <input name="worldSeed" type="number" value="${settings.worldSeed}" inputmode="numeric" />
      </label>
      <label>
        <span>Game mode</span>
        <select name="gameMode">
          <option value="creative">Creative</option>
          <option value="survival">Survival</option>
        </select>
      </label>
      <label>
        <span>Starting inventory</span>
        <select name="startingInventoryMode">
          <option value="none">None</option>
          <option value="survival_basic">Survival Basic</option>
          <option value="creative_testing">Creative Testing</option>
        </select>
      </label>
      <label>
        <span>Render distance</span>
        <input name="renderDistance" type="number" min="1" max="8" value="${settings.renderDistance}" inputmode="numeric" />
      </label>
      <div class="menu-actions">
        <button class="menu-button primary" type="submit">Start World</button>
        <button class="menu-button secondary" type="button" data-action="back">Back</button>
      </div>
    `;

    const modeSelect = form.elements.namedItem("gameMode") as HTMLSelectElement;
    const startingInventorySelect = form.elements.namedItem(
      "startingInventoryMode",
    ) as HTMLSelectElement;
    modeSelect.value = settings.gameMode;
    startingInventorySelect.value =
      settings.startingInventoryMode ??
      defaultStartingInventoryMode(settings.gameMode);
    modeSelect.addEventListener("change", () => {
      const mode =
        modeSelect.value === "survival" || modeSelect.value === "creative"
          ? modeSelect.value
          : settings.gameMode;

      startingInventorySelect.value = defaultStartingInventoryMode(mode);
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.#callbacks.startWorld(this.#settingsFromForm(form, settings));
    });
    form
      .querySelector<HTMLButtonElement>('[data-action="back"]')
      ?.addEventListener("click", () => this.#callbacks.back());

    panel.append(title, form);
    this.#root.hidden = false;
    this.#root.replaceChildren(panel);
  }

  #settingsFromForm(
    form: HTMLFormElement,
    fallback: GameSettings,
  ): GameSettings {
    const data = new FormData(form);
    const worldName = String(data.get("worldName") ?? "").trim();
    const worldSeed = Number(data.get("worldSeed"));
    const gameMode = data.get("gameMode");
    const startingInventoryMode = data.get("startingInventoryMode");
    const renderDistance = Number(data.get("renderDistance"));
    const resolvedGameMode =
      gameMode === "creative" || gameMode === "survival"
        ? (gameMode as GameMode)
        : fallback.gameMode;

    return {
      ...fallback,
      worldName: worldName || fallback.worldName,
      worldSeed: Number.isFinite(worldSeed) ? worldSeed : fallback.worldSeed,
      gameMode: resolvedGameMode,
      startingInventoryMode: isStartingInventoryMode(startingInventoryMode)
        ? (startingInventoryMode as StartingInventoryMode)
        : defaultStartingInventoryMode(resolvedGameMode),
      renderDistance: Number.isFinite(renderDistance)
        ? Math.max(1, Math.floor(renderDistance))
        : fallback.renderDistance,
    };
  }
}
