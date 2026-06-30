import {
  AUDIO_VOLUME_KEYS,
  DEFAULT_AUDIO_VOLUME_SETTINGS,
  normalizeAudioVolumeSettings,
  type AudioVolumeSettings,
} from "../audio/SoundRegistry.ts";
import type { GameSettings } from "../game/GameSettings.ts";

export type SettingsMenuCallbacks = Readonly<{
  save: (settings: GameSettings, audioVolumes: AudioVolumeSettings) => void;
  back: () => void;
}>;

function volumePercent(
  settings: AudioVolumeSettings,
  key: keyof AudioVolumeSettings,
): number {
  return Math.round(settings[key] * 100);
}

function volumeSlider(
  settings: AudioVolumeSettings,
  key: keyof AudioVolumeSettings,
  label: string,
): string {
  return `
      <label>
        <span>${label} volume</span>
        <input name="volume.${key}" type="range" min="0" max="100" value="${volumePercent(settings, key)}" />
      </label>
    `;
}

export class SettingsMenu {
  readonly #root: HTMLElement;
  readonly #callbacks: SettingsMenuCallbacks;

  constructor(root: HTMLElement, callbacks: SettingsMenuCallbacks) {
    this.#root = root;
    this.#callbacks = callbacks;
  }

  show(
    settings: GameSettings,
    audioVolumes: AudioVolumeSettings = DEFAULT_AUDIO_VOLUME_SETTINGS,
  ): void {
    const panel = document.createElement("section");
    const title = document.createElement("h2");
    const form = document.createElement("form");
    const normalizedAudioVolumes = normalizeAudioVolumeSettings(audioVolumes);

    panel.className = "menu-panel wide";
    title.textContent = "Settings";
    form.className = "menu-form";
    form.innerHTML = `
      <label>
        <span>Render distance</span>
        <input name="renderDistance" type="number" min="1" max="8" value="${settings.renderDistance}" inputmode="numeric" />
      </label>
      <label class="menu-check">
        <input name="showMobileControls" type="checkbox" ${settings.showMobileControls ? "checked" : ""} />
        <span>Show mobile controls</span>
      </label>
      <label class="menu-check">
        <input name="enableWeather" type="checkbox" ${settings.enableWeather ? "checked" : ""} />
        <span>Enable weather</span>
      </label>
      <label class="menu-check">
        <input name="debugOverlay" type="checkbox" ${settings.debugOverlay ? "checked" : ""} />
        <span>Debug overlay (F3)</span>
      </label>
      <fieldset class="menu-fieldset">
        <legend>Audio</legend>
        ${volumeSlider(normalizedAudioVolumes, "master", "Master")}
        ${volumeSlider(normalizedAudioVolumes, "blocks", "Blocks")}
        ${volumeSlider(normalizedAudioVolumes, "player", "Player")}
        ${volumeSlider(normalizedAudioVolumes, "weather", "Weather")}
        ${volumeSlider(normalizedAudioVolumes, "ui", "UI")}
      </fieldset>
      <div class="menu-actions">
        <button class="menu-button primary" type="submit">Save Settings</button>
        <button class="menu-button secondary" type="button" data-action="back">Back</button>
      </div>
    `;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const renderDistance = Number(data.get("renderDistance"));

      this.#callbacks.save(
        {
          ...settings,
          renderDistance: Number.isFinite(renderDistance)
            ? Math.max(1, Math.floor(renderDistance))
            : settings.renderDistance,
          showMobileControls: data.get("showMobileControls") === "on",
          enableWeather: data.get("enableWeather") === "on",
          debugOverlay: data.get("debugOverlay") === "on",
        },
        normalizeAudioVolumeSettings(
          Object.fromEntries(
            AUDIO_VOLUME_KEYS.map((key) => [
              key,
              Number(data.get(`volume.${key}`)) / 100,
            ]),
          ),
        ),
      );
    });
    form
      .querySelector<HTMLButtonElement>('[data-action="back"]')
      ?.addEventListener("click", () => this.#callbacks.back());

    panel.append(title, form);
    this.#root.hidden = false;
    this.#root.replaceChildren(panel);
  }
}
