import { DEVICE_PROFILE } from "../platform/deviceProfile.ts";
import { DEFAULT_WORLD_SEED } from "../world/InfiniteTerrain.ts";
import { isCreativeMode, type GameMode } from "./gameMode.ts";
import {
  defaultStartingInventoryMode,
  normalizeStartingInventoryMode,
  type StartingInventoryMode,
} from "./StartingInventory.ts";

export type GameSettings = Readonly<{
  worldName: string;
  gameMode: GameMode;
  worldSeed: number;
  renderDistance: number;
  chunkSize: number;
  enableWeather: boolean;
  enableDayNightCycle: boolean;
  debugOverlay: boolean;
  showMobileControls: boolean;
  startingInventoryMode?: StartingInventoryMode;
}>;

const GAME_SETTINGS_STORAGE_KEY = "hexcraft.gameSettings.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validGameMode(value: unknown, fallback: GameMode): GameMode {
  return value === "creative" || value === "survival" ? value : fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function positiveInteger(value: unknown, fallback: number): number {
  const number = finiteNumber(value, fallback);
  return Math.max(1, Math.floor(number));
}

function booleanSetting(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringSetting(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : fallback;
}

function storage(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function getDefaultGameSettings(): GameSettings {
  return {
    worldName: "New World",
    gameMode: "creative",
    worldSeed: DEFAULT_WORLD_SEED,
    renderDistance: DEVICE_PROFILE.renderDistance,
    chunkSize: DEVICE_PROFILE.chunkSize,
    enableWeather: true,
    enableDayNightCycle: true,
    debugOverlay: false,
    showMobileControls: DEVICE_PROFILE.isMobile,
  };
}

export function loadGameSettingsFromLocalStorage(): GameSettings {
  const defaults = getDefaultGameSettings();
  const savedSettings = storage()?.getItem(GAME_SETTINGS_STORAGE_KEY);

  if (!savedSettings) {
    return defaults;
  }

  try {
    const parsed: unknown = JSON.parse(savedSettings);

    if (!isRecord(parsed)) {
      return defaults;
    }

    const gameMode = validGameMode(parsed.gameMode, defaults.gameMode);

    return {
      worldName: stringSetting(parsed.worldName, defaults.worldName),
      gameMode,
      worldSeed: finiteNumber(parsed.worldSeed, defaults.worldSeed),
      renderDistance: positiveInteger(
        parsed.renderDistance,
        defaults.renderDistance,
      ),
      chunkSize: positiveInteger(parsed.chunkSize, defaults.chunkSize),
      enableWeather: booleanSetting(
        parsed.enableWeather,
        defaults.enableWeather,
      ),
      enableDayNightCycle: booleanSetting(
        parsed.enableDayNightCycle,
        defaults.enableDayNightCycle,
      ),
      debugOverlay: booleanSetting(parsed.debugOverlay, defaults.debugOverlay),
      showMobileControls: booleanSetting(
        parsed.showMobileControls,
        defaults.showMobileControls,
      ),
      startingInventoryMode: normalizeStartingInventoryMode(
        parsed.startingInventoryMode,
        defaultStartingInventoryMode(gameMode),
      ),
    };
  } catch {
    return defaults;
  }
}

export function saveGameSettingsToLocalStorage(settings: GameSettings): void {
  storage()?.setItem(GAME_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function applyGameModeToBodyClass(
  settings: Pick<GameSettings, "gameMode">,
  body: Pick<HTMLElement, "classList"> = document.body,
): void {
  body.classList.toggle("creative-game", isCreativeMode(settings.gameMode));
  body.classList.toggle("survival-game", !isCreativeMode(settings.gameMode));
}
