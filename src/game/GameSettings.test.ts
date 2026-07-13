import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyGameModeToBodyClass,
  getDefaultGameSettings,
  loadGameSettingsFromLocalStorage,
  saveGameSettingsToLocalStorage,
  type GameSettings,
} from "./GameSettings.ts";

function stubLocalStorage(
  initialValue: string | null = null,
): Map<string, string> {
  const entries = new Map<string, string>();

  if (initialValue !== null) {
    entries.set("hexcraft.gameSettings.v1", initialValue);
  }

  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => entries.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      entries.set(key, value);
    }),
  });

  return entries;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("game settings", () => {
  it("defaults to creative testing behavior", () => {
    const settings = getDefaultGameSettings();

    expect(settings.gameMode).toBe("creative");
    expect(settings.worldName).toBe("New World");
    expect(settings.enableWeather).toBe(true);
    expect(settings.enableDayNightCycle).toBe(true);
    expect(settings.debugOverlay).toBe(false);
    expect(typeof settings.showMobileControls).toBe("boolean");
    expect(settings.chunkSize).toBeGreaterThan(0);
    expect(settings.renderDistance).toBeGreaterThan(0);
    expect(settings.startingInventoryMode).toBeUndefined();
  });

  it("falls back to defaults when localStorage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);

    expect(loadGameSettingsFromLocalStorage()).toEqual(
      getDefaultGameSettings(),
    );
  });

  it("merges saved localStorage settings over defaults", () => {
    stubLocalStorage(
      JSON.stringify({
        gameMode: "survival",
        worldName: "Mesa Test",
        worldSeed: 12345,
        renderDistance: 3,
        chunkSize: 9,
        enableWeather: false,
        enableDayNightCycle: false,
        debugOverlay: true,
        showMobileControls: true,
        startingInventoryMode: "creative_testing",
      } satisfies GameSettings),
    );

    expect(loadGameSettingsFromLocalStorage()).toEqual({
      gameMode: "survival",
      worldName: "Mesa Test",
      worldSeed: 12345,
      renderDistance: 3,
      chunkSize: 9,
      enableWeather: false,
      enableDayNightCycle: false,
      debugOverlay: true,
      showMobileControls: true,
      startingInventoryMode: "creative_testing",
    });
  });

  it("defaults missing starting inventory mode by game mode", () => {
    stubLocalStorage(
      JSON.stringify({
        gameMode: "survival",
      }),
    );

    expect(loadGameSettingsFromLocalStorage().startingInventoryMode).toBe(
      "survival_basic",
    );
  });

  it("saves settings to localStorage", () => {
    const entries = stubLocalStorage();
    const settings = {
      ...getDefaultGameSettings(),
      gameMode: "survival",
      worldSeed: 9876,
    } satisfies GameSettings;

    saveGameSettingsToLocalStorage(settings);

    expect(JSON.parse(entries.get("hexcraft.gameSettings.v1") ?? "")).toEqual(
      settings,
    );
  });

  it("applies game mode body classes", () => {
    const toggles = new Map<string, boolean>();
    const body = {
      classList: {
        toggle: vi.fn((className: string, enabled?: boolean) => {
          toggles.set(className, Boolean(enabled));
          return Boolean(enabled);
        }),
      },
    } as unknown as Pick<HTMLElement, "classList">;

    applyGameModeToBodyClass({ gameMode: "creative" }, body);

    expect(toggles.get("creative-game")).toBe(true);
    expect(toggles.get("survival-game")).toBe(false);
  });
});
