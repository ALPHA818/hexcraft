import { describe, expect, it, vi } from "vitest";

import type { GameProfile } from "../SimulationTypes.ts";
import {
  BROWSER_ADAPTER_FIELDS,
  browserAdapterHelpLabel,
} from "./BrowserAdapterFields.ts";
import { BrowserAdapter } from "./BrowserAdapter.ts";

class FakeConsoleMessage {
  constructor(
    readonly kind: string,
    readonly message: string,
  ) {}

  type(): string {
    return this.kind;
  }

  text(): string {
    return this.message;
  }

  location(): { url: string; lineNumber: number; columnNumber: number } {
    return {
      url: "http://game.test/main.js",
      lineNumber: 10,
      columnNumber: 4,
    };
  }
}

class FakeKeyboard {
  readonly presses: string[] = [];
  readonly downs: string[] = [];
  readonly ups: string[] = [];

  async press(key: string): Promise<void> {
    this.presses.push(key);
  }

  async down(key: string): Promise<void> {
    this.downs.push(key);
  }

  async up(key: string): Promise<void> {
    this.ups.push(key);
  }
}

class FakeMouse {
  readonly clicks: { x: number; y: number; button: string }[] = [];

  async click(
    x: number,
    y: number,
    options: Readonly<{ button?: string }> = {},
  ): Promise<void> {
    this.clicks.push({ x, y, button: options.button ?? "left" });
  }
}

type FakePageListener = (payload?: unknown) => void;

class FakePage {
  readonly keyboard = new FakeKeyboard();
  readonly mouse = new FakeMouse();
  readonly globals: Record<string, unknown> = {};
  readonly waits: number[] = [];
  readonly screenshots: string[] = [];
  readonly reloads: string[] = [];
  readonly listeners = new Map<string, FakePageListener[]>();
  urlValue = "";
  titleValue = "Fake Game";
  closed = false;
  viewport = { width: 1000, height: 600 };

  on(event: string, listener: FakePageListener): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }

  emit(event: string, payload?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(payload);
    }
  }

  async goto(
    url: string,
    _options: Readonly<{ waitUntil?: string }> = {},
  ): Promise<void> {
    this.urlValue = url;
  }

  url(): string {
    return this.urlValue;
  }

  async title(): Promise<string> {
    return this.titleValue;
  }

  async evaluate<T>(
    callback: (input?: unknown) => T | Promise<T>,
    input?: unknown,
  ): Promise<T> {
    const previous = new Map<string, unknown>();
    const missing = new Set<string>();

    for (const [key, value] of Object.entries(this.globals)) {
      if (Object.hasOwn(globalThis, key)) {
        previous.set(key, (globalThis as Record<string, unknown>)[key]);
      } else {
        missing.add(key);
      }
      (globalThis as Record<string, unknown>)[key] = value;
    }

    try {
      return await callback(input);
    } finally {
      for (const key of missing) {
        delete (globalThis as Record<string, unknown>)[key];
      }
      for (const [key, value] of previous) {
        (globalThis as Record<string, unknown>)[key] = value;
      }
    }
  }

  async waitForTimeout(ms: number): Promise<void> {
    this.waits.push(ms);
  }

  async reload(options: Readonly<{ waitUntil?: string }> = {}): Promise<void> {
    this.reloads.push(options.waitUntil ?? "");
  }

  async screenshot(
    options: Readonly<{ path: string; fullPage?: boolean }>,
  ): Promise<void> {
    this.screenshots.push(options.path);
  }

  viewportSize(): { width: number; height: number } {
    return this.viewport;
  }

  isClosed(): boolean {
    return this.closed;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.emit("close");
  }
}

class FakeContext {
  closed = false;

  constructor(readonly page: FakePage) {}

  async newPage(): Promise<FakePage> {
    return this.page;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

class FakeBrowser {
  closed = false;

  constructor(readonly context: FakeContext) {}

  async newContext(
    _options: Readonly<Record<string, unknown>> = {},
  ): Promise<FakeContext> {
    return this.context;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

function fakePlaywright(page = new FakePage()): Readonly<{
  adapter: BrowserAdapter;
  page: FakePage;
  context: FakeContext;
  browser: FakeBrowser;
  launcher: { launches: unknown[] };
}> {
  const context = new FakeContext(page);
  const browser = new FakeBrowser(context);
  const launcher = {
    launches: [] as unknown[],
    async launch(options: unknown): Promise<FakeBrowser> {
      this.launches.push(options);
      return browser;
    },
  };
  const adapter = new BrowserAdapter({
    playwright: {
      chromium: launcher,
      firefox: launcher,
      webkit: launcher,
    },
    now: () => 1234,
    createInstanceId: () => "browser-test",
  });

  return { adapter, browser, context, launcher, page };
}

async function launchedAdapter(page = new FakePage()): Promise<
  Readonly<{
    adapter: BrowserAdapter;
    page: FakePage;
    instanceId: string;
    context: FakeContext;
    browser: FakeBrowser;
  }>
> {
  const fake = fakePlaywright(page);
  const instance = await fake.adapter.launchInstance({
    gameUrl: "http://game.test",
    screenshotDirectory: "artifacts/browser-adapter-test",
  });

  return {
    adapter: fake.adapter,
    page: fake.page,
    instanceId: instance.instanceId,
    context: fake.context,
    browser: fake.browser,
  };
}

describe("BrowserAdapter", () => {
  it("defines hover help for every browser adapter field", () => {
    const ids = BROWSER_ADAPTER_FIELDS.map((field) => field.id);

    expect(ids).toEqual([
      "gameUrl",
      "browserType",
      "readBrowserGameState",
      "captureConsoleErrors",
      "capturePageErrors",
      "useKeyboardInput",
      "useMouseInput",
      "reloadPage",
      "browserContext",
    ]);
    for (const field of BROWSER_ADAPTER_FIELDS) {
      expect(browserAdapterHelpLabel(field.id)).toBe(`${field.label} ?`);
      expect(field.help.length).toBeGreaterThan(40);
    }
  });

  it("launches chromium by default and opens the configured URL", async () => {
    const { adapter, launcher, page } = fakePlaywright();
    const instance = await adapter.launchInstance({
      gameUrl: "http://localhost:5173",
    });

    expect(instance).toEqual({
      instanceId: "browser-test",
      url: "http://localhost:5173",
      browserType: "chromium",
    });
    expect(launcher.launches).toEqual([expect.objectContaining({})]);
    expect(page.url()).toBe("http://localhost:5173");
  });

  it("reads instrumented browser state when available", async () => {
    const page = new FakePage();
    page.globals.__GAMEPLAY_SIM_STATE__ = {
      summary: "Player is alive",
      player: { health: 10 },
    };
    const { adapter, instanceId } = await launchedAdapter(page);

    const state = await adapter.getState(instanceId);

    expect(state.source).toBe("instrumented");
    expect(state.summary).toBe("Player is alive");
    expect(state.data).toMatchObject({ player: { health: 10 } });
  });

  it("returns basic state with console and page errors", async () => {
    const { adapter, instanceId, page } = await launchedAdapter();

    page.emit("console", new FakeConsoleMessage("error", "boom"));
    page.emit("console", new FakeConsoleMessage("warning", "careful"));
    page.emit("pageerror", new Error("uncaught"));
    page.emit("crash");

    const state = await adapter.getState(instanceId);

    expect(state.source).toBe("basic");
    expect(state.status).toBe("crashed");
    expect(state.diagnostics.consoleErrors).toEqual(["boom"]);
    expect(state.diagnostics.consoleWarnings).toEqual(["careful"]);
    expect(state.diagnostics.pageErrors).toEqual(["uncaught"]);
    expect(state.diagnostics.pageEvents).toContain("crashed");
  });

  it("uses browser action hooks before input fallbacks", async () => {
    const page = new FakePage();
    const hook = vi.fn(() => ({ ok: true }));
    page.globals.__GAMEPLAY_SIM_ACTIONS__ = [
      { id: "dash", label: "Dash", type: "keyboard", key: "ShiftLeft" },
    ];
    page.globals.__GAMEPLAY_SIM_PERFORM_ACTION__ = hook;
    const { adapter, instanceId } = await launchedAdapter(page);

    const actions = await adapter.getAvailableActions(instanceId);
    const result = await adapter.performAction(instanceId, "dash");

    expect(actions.map((action) => action.id)).toEqual(["dash"]);
    expect(result.ok).toBe(true);
    expect(result.hookResult).toEqual({ ok: true });
    expect(hook).toHaveBeenCalledWith(expect.objectContaining({ id: "dash" }));
    expect(page.keyboard.presses).toEqual([]);
  });

  it("uses profile mappings when hooks are unavailable", async () => {
    const fake = fakePlaywright();
    const profile: GameProfile = {
      id: "hexcraft",
      name: "Hexcraft",
      controlMappings: [
        { id: "forward", key: "KeyW" },
        { id: "click-center", mouse: { x: 0.5, y: 0.25, button: "left" } },
        { id: "pause", menuKey: "Escape" },
        { id: "reload", reload: true },
        { id: "wait", waitMs: 250 },
      ],
    };
    const instance = await fake.adapter.launchInstance(
      { gameUrl: "http://game.test" },
      profile,
    );

    expect(
      (await fake.adapter.getAvailableActions(instance.instanceId)).map(
        (action) => action.id,
      ),
    ).toEqual(["forward", "click-center", "pause", "reload", "wait"]);

    await fake.adapter.performAction(instance.instanceId, "forward");
    await fake.adapter.performAction(instance.instanceId, "click-center");
    await fake.adapter.performAction(instance.instanceId, "pause");
    await fake.adapter.performAction(instance.instanceId, "reload");
    await fake.adapter.performAction(instance.instanceId, "wait");

    expect(fake.page.keyboard.presses).toEqual(["KeyW", "Escape"]);
    expect(fake.page.mouse.clicks).toEqual([
      { x: 500, y: 150, button: "left" },
    ]);
    expect(fake.page.reloads).toEqual(["domcontentloaded"]);
    expect(fake.page.waits).toEqual([250]);
  });

  it("captures screenshots and includes the last path in basic state", async () => {
    const { adapter, instanceId, page } = await launchedAdapter();

    const screenshotPath = await adapter.captureScreenshot(instanceId, "State");
    const state = await adapter.getState(instanceId);

    expect(page.screenshots).toEqual([screenshotPath]);
    expect(screenshotPath).toContain("browser-test-state-1234.png");
    expect(state.screenshotPath).toBe(screenshotPath);
  });

  it("closes page context and browser cleanly", async () => {
    const { adapter, browser, context, instanceId, page } =
      await launchedAdapter();

    await adapter.stopInstance(instanceId);

    expect(page.closed).toBe(true);
    expect(context.closed).toBe(true);
    expect(browser.closed).toBe(true);
    await expect(adapter.getState(instanceId)).rejects.toThrow(
      "Unknown browser adapter instance",
    );
  });
});
