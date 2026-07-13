import type {
  BrowserActionDefinition,
  BrowserControlMapping,
  GameActionInput,
  GameActionResult,
  GameProfile,
  GameStateSnapshot,
  MouseButton,
} from "../SimulationTypes.ts";

export type BrowserAdapterBrowserType = "chromium" | "firefox" | "webkit";
export type BrowserAdapterContextOptions = Readonly<Record<string, unknown>>;
export type BrowserAdapterLaunchOptions = Readonly<Record<string, unknown>>;

type BrowserConsoleMessage = Readonly<{
  type: () => string;
  text: () => string;
  location: () => Readonly<{
    url?: string;
    lineNumber?: number;
    columnNumber?: number;
  }>;
}>;

type BrowserKeyboard = Readonly<{
  press: (key: string) => Promise<void>;
  down: (key: string) => Promise<void>;
  up: (key: string) => Promise<void>;
}>;

type BrowserMouse = Readonly<{
  click: (
    x: number,
    y: number,
    options?: Readonly<{ button?: MouseButton }>,
  ) => Promise<void>;
}>;

type BrowserPage = Readonly<{
  keyboard: BrowserKeyboard;
  mouse: BrowserMouse;
  on: (event: string, listener: (payload?: unknown) => void) => void;
  goto: (
    url: string,
    options?: Readonly<{ waitUntil?: string }>,
  ) => Promise<unknown>;
  url: () => string;
  title: () => Promise<string>;
  evaluate: <T>(
    callback: (input?: unknown) => T | Promise<T>,
    input?: unknown,
  ) => Promise<T>;
  waitForTimeout: (ms: number) => Promise<void>;
  reload: (options?: Readonly<{ waitUntil?: string }>) => Promise<void>;
  screenshot: (
    options: Readonly<{ path: string; fullPage?: boolean }>,
  ) => Promise<unknown>;
  viewportSize: () => Readonly<{ width: number; height: number }> | null;
  isClosed: () => boolean;
  close: () => Promise<void>;
}>;

type BrowserContext = Readonly<{
  newPage: () => Promise<BrowserPage>;
  close: () => Promise<void>;
}>;

type Browser = Readonly<{
  newContext: (
    options?: BrowserAdapterContextOptions,
  ) => Promise<BrowserContext>;
  close: () => Promise<void>;
}>;

type BrowserLauncher = Readonly<{
  launch: (options?: BrowserAdapterLaunchOptions) => Promise<Browser>;
}>;

export type BrowserAdapterPlaywrightFactory = Readonly<
  Record<BrowserAdapterBrowserType, BrowserLauncher>
>;

export type BrowserAdapterConfig = Readonly<{
  gameUrl: string;
  browserType?: BrowserAdapterBrowserType;
  headless?: boolean;
  readBrowserGameState?: boolean;
  captureConsoleErrors?: boolean;
  capturePageErrors?: boolean;
  useKeyboardInput?: boolean;
  useMouseInput?: boolean;
  reloadPage?: boolean;
  browserContext?: BrowserAdapterContextOptions;
  launchOptions?: BrowserAdapterLaunchOptions;
  screenshotDirectory?: string;
}>;

export type BrowserAdapterInstanceSummary = Readonly<{
  instanceId: string;
  url: string;
  browserType: BrowserAdapterBrowserType;
}>;

type BrowserConsoleEntry = Readonly<{
  type: string;
  text: string;
  timestamp: number;
  location?: string;
}>;

type BrowserAdapterInstance = {
  id: string;
  config: RequiredBrowserAdapterConfig;
  profile: GameProfile | null;
  browser: Browser;
  context: BrowserContext;
  page: BrowserPage;
  consoleEntries: BrowserConsoleEntry[];
  pageErrors: string[];
  pageEvents: string[];
  crashed: boolean;
  closed: boolean;
  lastScreenshotPath: string | null;
};

type RequiredBrowserAdapterConfig = Readonly<{
  gameUrl: string;
  browserType: BrowserAdapterBrowserType;
  headless: boolean;
  readBrowserGameState: boolean;
  captureConsoleErrors: boolean;
  capturePageErrors: boolean;
  useKeyboardInput: boolean;
  useMouseInput: boolean;
  reloadPage: boolean;
  browserContext: BrowserAdapterContextOptions;
  launchOptions: BrowserAdapterLaunchOptions;
  screenshotDirectory: string;
}>;

export type BrowserAdapterOptions = Readonly<{
  playwright?: BrowserAdapterPlaywrightFactory;
  now?: () => number;
  createInstanceId?: () => string;
  maxLogEntries?: number;
}>;

type HookActionResult = Readonly<{
  available: boolean;
  result?: unknown;
}>;

const DEFAULT_SCREENSHOT_DIRECTORY = "artifacts/browser-adapter";
const DEFAULT_MAX_LOG_ENTRIES = 200;
const NODE_FS_PROMISES_MODULE = "node:fs/promises";
const PLAYWRIGHT_MODULE = "playwright";

type NodeFsPromises = Readonly<{
  mkdir: (
    path: string,
    options: Readonly<{ recursive: true }>,
  ) => Promise<unknown>;
}>;

function normalizeConfig(
  config: BrowserAdapterConfig,
): RequiredBrowserAdapterConfig {
  return {
    gameUrl: config.gameUrl,
    browserType: config.browserType ?? "chromium",
    headless: config.headless ?? true,
    readBrowserGameState: config.readBrowserGameState ?? true,
    captureConsoleErrors: config.captureConsoleErrors ?? true,
    capturePageErrors: config.capturePageErrors ?? true,
    useKeyboardInput: config.useKeyboardInput ?? true,
    useMouseInput: config.useMouseInput ?? true,
    reloadPage: config.reloadPage ?? true,
    browserContext: config.browserContext ?? {},
    launchOptions: config.launchOptions ?? {},
    screenshotDirectory:
      config.screenshotDirectory ?? DEFAULT_SCREENSHOT_DIRECTORY,
  };
}

function safeInstanceId(): string {
  return `browser-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function compactError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function locationText(message: BrowserConsoleMessage): string | undefined {
  const location = message.location();

  return location.url
    ? `${location.url}:${location.lineNumber}:${location.columnNumber}`
    : undefined;
}

function trimToMax<T>(items: T[], maxItems: number): void {
  if (items.length > maxItems) {
    items.splice(0, items.length - maxItems);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isBrowserConsoleMessage(
  value: unknown,
): value is BrowserConsoleMessage {
  return (
    isRecord(value) &&
    typeof value.type === "function" &&
    typeof value.text === "function" &&
    typeof value.location === "function"
  );
}

function normalizeMouseButton(value: unknown): MouseButton {
  return value === "middle" || value === "right" ? value : "left";
}

function normalizeAction(value: unknown): BrowserActionDefinition | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = stringOrDefault(value.id, "");
  if (id === "") {
    return null;
  }

  const mouse = isRecord(value.mouse)
    ? {
        x: numberOrDefault(value.mouse.x, 0),
        y: numberOrDefault(value.mouse.y, 0),
        button: normalizeMouseButton(value.mouse.button),
      }
    : undefined;
  const keys = Array.isArray(value.keys)
    ? value.keys.filter((key): key is string => typeof key === "string")
    : undefined;
  const key = typeof value.key === "string" ? value.key : undefined;
  const waitMs = numberOrDefault(value.waitMs, 0);
  const type =
    value.type === "js" ||
    value.type === "keyboard" ||
    value.type === "mouse" ||
    value.type === "wait" ||
    value.type === "reload" ||
    value.type === "menu"
      ? value.type
      : mouse
        ? "mouse"
        : key || (keys && keys.length > 0)
          ? "keyboard"
          : waitMs > 0
            ? "wait"
            : "js";

  return {
    id,
    label: stringOrDefault(value.label, id),
    description:
      typeof value.description === "string" ? value.description : undefined,
    type,
    key,
    keys,
    durationMs: numberOrDefault(value.durationMs, 0),
    mouse,
    waitMs,
    payload: value.payload,
  };
}

function actionFromMapping(
  mapping: BrowserControlMapping,
): BrowserActionDefinition {
  const type = mapping.reload
    ? "reload"
    : mapping.mouse
      ? "mouse"
      : mapping.waitMs
        ? "wait"
        : mapping.menuKey
          ? "menu"
          : mapping.key || mapping.keys
            ? "keyboard"
            : "js";

  return {
    id: mapping.id,
    label: mapping.label ?? mapping.id,
    description: mapping.description,
    type,
    key: mapping.menuKey ?? mapping.key,
    keys: mapping.keys,
    durationMs: mapping.durationMs,
    mouse: mapping.mouse,
    waitMs: mapping.waitMs,
    payload: mapping.payload ?? mapping.jsAction,
  };
}

function genericActions(config: RequiredBrowserAdapterConfig) {
  const actions: BrowserActionDefinition[] = [
    {
      id: "wait-500",
      label: "Wait",
      description: "Wait for half a second.",
      type: "wait",
      waitMs: 500,
    },
  ];

  if (config.useKeyboardInput) {
    actions.push(
      {
        id: "move-forward",
        label: "Move Forward",
        type: "keyboard",
        key: "KeyW",
      },
      {
        id: "move-back",
        label: "Move Back",
        type: "keyboard",
        key: "KeyS",
      },
      {
        id: "move-left",
        label: "Move Left",
        type: "keyboard",
        key: "KeyA",
      },
      {
        id: "move-right",
        label: "Move Right",
        type: "keyboard",
        key: "KeyD",
      },
      {
        id: "jump",
        label: "Jump",
        type: "keyboard",
        key: "Space",
      },
      {
        id: "open-menu",
        label: "Open Menu",
        type: "menu",
        key: "Escape",
      },
    );
  }

  if (config.useMouseInput) {
    actions.push({
      id: "primary-click",
      label: "Primary Click",
      type: "mouse",
      mouse: { x: 0.5, y: 0.5, button: "left" },
    });
  }

  if (config.reloadPage) {
    actions.push({
      id: "reload",
      label: "Reload Page",
      type: "reload",
    });
  }

  return actions;
}

function diagnosticsFor(instance: BrowserAdapterInstance) {
  return {
    consoleErrors: instance.consoleEntries
      .filter((entry) => entry.type === "error")
      .map((entry) => entry.text),
    consoleWarnings: instance.consoleEntries
      .filter((entry) => entry.type === "warning" || entry.type === "warn")
      .map((entry) => entry.text),
    pageErrors: [...instance.pageErrors],
    pageEvents: [...instance.pageEvents],
  };
}

function joinBrowserAdapterPath(directory: string, filename: string): string {
  const trimmedDirectory = directory.replace(/[\\/]+$/u, "");

  return trimmedDirectory === "" ? filename : `${trimmedDirectory}/${filename}`;
}

async function ensureScreenshotDirectory(directory: string): Promise<void> {
  const moduleName = NODE_FS_PROMISES_MODULE;
  const fsPromises = (await import(moduleName)) as NodeFsPromises;

  await fsPromises.mkdir(directory, { recursive: true });
}

async function loadPlaywrightFactory(): Promise<BrowserAdapterPlaywrightFactory> {
  const moduleName = PLAYWRIGHT_MODULE;
  const playwright = (await import(
    moduleName
  )) as Partial<BrowserAdapterPlaywrightFactory>;

  if (!playwright.chromium || !playwright.firefox || !playwright.webkit) {
    throw new Error(
      "Playwright did not expose chromium, firefox, and webkit launchers.",
    );
  }

  return {
    chromium: playwright.chromium,
    firefox: playwright.firefox,
    webkit: playwright.webkit,
  };
}

export class BrowserAdapter {
  #playwright: BrowserAdapterPlaywrightFactory | null;
  readonly #now: () => number;
  readonly #createInstanceId: () => string;
  readonly #maxLogEntries: number;
  readonly #instances = new Map<string, BrowserAdapterInstance>();

  constructor(options: BrowserAdapterOptions = {}) {
    this.#playwright = options.playwright ?? null;
    this.#now = options.now ?? (() => Date.now());
    this.#createInstanceId = options.createInstanceId ?? safeInstanceId;
    this.#maxLogEntries = options.maxLogEntries ?? DEFAULT_MAX_LOG_ENTRIES;
  }

  async launchInstance(
    config: BrowserAdapterConfig,
    profile: GameProfile | null = null,
  ): Promise<BrowserAdapterInstanceSummary> {
    const normalizedConfig = normalizeConfig(config);
    const playwright = await this.#playwrightFactory();
    const launcher = playwright[normalizedConfig.browserType];
    const browser = await launcher.launch({
      headless: normalizedConfig.headless,
      ...normalizedConfig.launchOptions,
    });
    const context = await browser.newContext(normalizedConfig.browserContext);
    const page = await context.newPage();
    const instance: BrowserAdapterInstance = {
      id: this.#createInstanceId(),
      config: normalizedConfig,
      profile,
      browser,
      context,
      page,
      consoleEntries: [],
      pageErrors: [],
      pageEvents: [],
      crashed: false,
      closed: false,
      lastScreenshotPath: null,
    };

    this.#wirePageEvents(instance);
    await page.goto(normalizedConfig.gameUrl, {
      waitUntil: "domcontentloaded",
    });
    this.#instances.set(instance.id, instance);

    return {
      instanceId: instance.id,
      url: page.url(),
      browserType: normalizedConfig.browserType,
    };
  }

  async getState(instanceId: string): Promise<GameStateSnapshot> {
    const instance = this.#instanceOrThrow(instanceId);
    const url = instance.closed ? instance.config.gameUrl : instance.page.url();
    const title = await this.#safeTitle(instance);
    const status = this.#statusFor(instance);
    const diagnostics = diagnosticsFor(instance);
    const base = {
      adapter: "browser" as const,
      instanceId,
      capturedAt: this.#now(),
      status,
      url,
      title,
      diagnostics,
      screenshotPath: instance.lastScreenshotPath ?? undefined,
    };

    if (instance.config.readBrowserGameState && status === "open") {
      const hookState = await this.#readStateHook(instance);

      if (hookState !== null) {
        const data = isRecord(hookState) ? hookState : { value: hookState };

        return {
          ...base,
          source: "instrumented",
          summary: stringOrDefault(data.summary, "Instrumented browser state"),
          data,
        };
      }
    }

    return {
      ...base,
      source: "basic",
      summary: `${status} browser page at ${url}`,
      data: {
        url,
        title,
        status,
        consoleErrors: diagnostics.consoleErrors,
        consoleWarnings: diagnostics.consoleWarnings,
        pageErrors: diagnostics.pageErrors,
        pageEvents: diagnostics.pageEvents,
        screenshotPath: instance.lastScreenshotPath,
      },
    };
  }

  async getAvailableActions(
    instanceId: string,
  ): Promise<readonly BrowserActionDefinition[]> {
    const instance = this.#instanceOrThrow(instanceId);

    if (!instance.closed && !instance.crashed) {
      const hookActions = await this.#readActionsHook(instance);

      if (hookActions.length > 0) {
        return hookActions;
      }
    }

    if (instance.profile?.controlMappings?.length) {
      return instance.profile.controlMappings.map(actionFromMapping);
    }

    return genericActions(instance.config);
  }

  async performAction(
    instanceId: string,
    actionInput: GameActionInput,
  ): Promise<GameActionResult> {
    const instance = this.#instanceOrThrow(instanceId);
    const actionId =
      typeof actionInput === "string" ? actionInput : actionInput.id;
    const availableActions = await this.getAvailableActions(instanceId);
    const action = availableActions.find(
      (candidate) => candidate.id === actionId,
    );

    if (!action) {
      return {
        ok: false,
        actionId,
        message: `Unknown browser action: ${actionId}`,
      };
    }

    const hookResult = await this.#tryPerformActionHook(instance, {
      ...action,
      payload:
        typeof actionInput === "string"
          ? action.payload
          : (actionInput.payload ?? action.payload),
    });

    if (hookResult.available) {
      return {
        ok: hookResult.result !== false,
        actionId,
        message:
          hookResult.result === false
            ? `Browser action hook rejected ${actionId}.`
            : `Performed ${actionId} through browser action hook.`,
        hookResult: hookResult.result,
      };
    }

    return this.#performPlaywrightAction(instance, action);
  }

  async captureScreenshot(
    instanceId: string,
    name = "screenshot",
  ): Promise<string> {
    const instance = this.#instanceOrThrow(instanceId);

    if (instance.closed || instance.page.isClosed()) {
      throw new Error(`Browser instance ${instanceId} is closed.`);
    }

    await ensureScreenshotDirectory(instance.config.screenshotDirectory);
    const safeName = name.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
    const screenshotPath = joinBrowserAdapterPath(
      instance.config.screenshotDirectory,
      `${instance.id}-${safeName}-${this.#now()}.png`,
    );

    await instance.page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });
    instance.lastScreenshotPath = screenshotPath;

    return screenshotPath;
  }

  async stopInstance(instanceId: string): Promise<void> {
    const instance = this.#instances.get(instanceId);

    if (!instance) {
      return;
    }

    await this.#closeSafely(() => instance.page.close());
    await this.#closeSafely(() => instance.context.close());
    await this.#closeSafely(() => instance.browser.close());
    instance.closed = true;
    instance.pageEvents.push("closed by adapter");
    this.#instances.delete(instanceId);
  }

  #wirePageEvents(instance: BrowserAdapterInstance): void {
    instance.page.on("console", (payload) => {
      if (!instance.config.captureConsoleErrors) {
        return;
      }

      if (!isBrowserConsoleMessage(payload)) {
        return;
      }

      instance.consoleEntries.push({
        type: payload.type(),
        text: payload.text(),
        timestamp: this.#now(),
        location: locationText(payload),
      });
      trimToMax(instance.consoleEntries, this.#maxLogEntries);
    });
    instance.page.on("pageerror", (error) => {
      if (!instance.config.capturePageErrors) {
        return;
      }

      instance.pageErrors.push(compactError(error));
      trimToMax(instance.pageErrors, this.#maxLogEntries);
    });
    instance.page.on("crash", () => {
      instance.crashed = true;
      instance.pageEvents.push("crashed");
    });
    instance.page.on("close", () => {
      instance.closed = true;
      instance.pageEvents.push("closed");
    });
  }

  async #readStateHook(
    instance: BrowserAdapterInstance,
  ): Promise<unknown | null> {
    try {
      return await instance.page.evaluate(() => {
        const globals = globalThis as Record<string, unknown>;

        return globals.__GAMEPLAY_SIM_STATE__ ?? null;
      });
    } catch (error) {
      instance.pageErrors.push(`State hook failed: ${compactError(error)}`);
      return null;
    }
  }

  async #readActionsHook(
    instance: BrowserAdapterInstance,
  ): Promise<readonly BrowserActionDefinition[]> {
    try {
      const actions = await instance.page.evaluate(() => {
        const globals = globalThis as Record<string, unknown>;

        return globals.__GAMEPLAY_SIM_ACTIONS__ ?? null;
      });

      return Array.isArray(actions)
        ? actions
            .map(normalizeAction)
            .filter(
              (action): action is BrowserActionDefinition => action !== null,
            )
        : [];
    } catch (error) {
      instance.pageErrors.push(`Actions hook failed: ${compactError(error)}`);
      return [];
    }
  }

  async #tryPerformActionHook(
    instance: BrowserAdapterInstance,
    action: BrowserActionDefinition,
  ): Promise<HookActionResult> {
    if (instance.closed || instance.crashed) {
      return { available: false };
    }

    try {
      return await instance.page.evaluate(async (browserAction) => {
        const globals = globalThis as Record<string, unknown>;
        const hook = globals.__GAMEPLAY_SIM_PERFORM_ACTION__;

        if (typeof hook !== "function") {
          return { available: false };
        }

        return {
          available: true,
          result: await hook(browserAction),
        };
      }, action);
    } catch (error) {
      instance.pageErrors.push(`Action hook failed: ${compactError(error)}`);
      return {
        available: true,
        result: false,
      };
    }
  }

  async #performPlaywrightAction(
    instance: BrowserAdapterInstance,
    action: BrowserActionDefinition,
  ): Promise<GameActionResult> {
    if (instance.closed || instance.crashed || instance.page.isClosed()) {
      return {
        ok: false,
        actionId: action.id,
        message: `Browser instance ${instance.id} is not open.`,
      };
    }

    switch (action.type) {
      case "keyboard":
      case "menu":
        if (!instance.config.useKeyboardInput) {
          return {
            ok: false,
            actionId: action.id,
            message: "Keyboard input is disabled for this browser adapter.",
          };
        }
        await this.#pressKeys(instance.page, action);
        return {
          ok: true,
          actionId: action.id,
          message: `Pressed keyboard action ${action.id}.`,
        };
      case "mouse":
        if (!instance.config.useMouseInput) {
          return {
            ok: false,
            actionId: action.id,
            message: "Mouse input is disabled for this browser adapter.",
          };
        }
        await this.#clickMouse(instance.page, action);
        return {
          ok: true,
          actionId: action.id,
          message: `Clicked mouse action ${action.id}.`,
        };
      case "wait":
        await instance.page.waitForTimeout(action.waitMs ?? 500);
        return {
          ok: true,
          actionId: action.id,
          message: `Waited ${action.waitMs ?? 500}ms.`,
        };
      case "reload":
        if (!instance.config.reloadPage) {
          return {
            ok: false,
            actionId: action.id,
            message: "Reload is disabled for this browser adapter.",
          };
        }
        await instance.page.reload({ waitUntil: "domcontentloaded" });
        return {
          ok: true,
          actionId: action.id,
          message: "Reloaded browser page.",
        };
      case "js":
        return {
          ok: false,
          actionId: action.id,
          message: "No browser action hook is available for JS actions.",
        };
    }
  }

  async #pressKeys(
    page: BrowserPage,
    action: BrowserActionDefinition,
  ): Promise<void> {
    const keys = action.keys ?? (action.key ? [action.key] : []);

    for (const key of keys) {
      if ((action.durationMs ?? 0) > 0) {
        await page.keyboard.down(key);
        await page.waitForTimeout(action.durationMs ?? 0);
        await page.keyboard.up(key);
      } else {
        await page.keyboard.press(key);
      }
    }
  }

  async #clickMouse(
    page: BrowserPage,
    action: BrowserActionDefinition,
  ): Promise<void> {
    const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
    const mouse = action.mouse ?? { x: 0.5, y: 0.5, button: "left" };
    const x = mouse.x >= 0 && mouse.x <= 1 ? mouse.x * viewport.width : mouse.x;
    const y =
      mouse.y >= 0 && mouse.y <= 1 ? mouse.y * viewport.height : mouse.y;

    await page.mouse.click(x, y, { button: mouse.button ?? "left" });
  }

  async #safeTitle(instance: BrowserAdapterInstance): Promise<string> {
    if (instance.closed || instance.page.isClosed()) {
      return "";
    }

    try {
      return await instance.page.title();
    } catch {
      return "";
    }
  }

  #statusFor(instance: BrowserAdapterInstance): GameStateSnapshot["status"] {
    if (instance.crashed) {
      return "crashed";
    }

    return instance.closed || instance.page.isClosed() ? "closed" : "open";
  }

  #instanceOrThrow(instanceId: string): BrowserAdapterInstance {
    const instance = this.#instances.get(instanceId);

    if (!instance) {
      throw new Error(`Unknown browser adapter instance: ${instanceId}`);
    }

    return instance;
  }

  async #closeSafely(close: () => Promise<unknown>): Promise<void> {
    try {
      await close();
    } catch {
      // Closing a page/context/browser is best-effort during cleanup.
    }
  }

  async #playwrightFactory(): Promise<BrowserAdapterPlaywrightFactory> {
    this.#playwright ??= await loadPlaywrightFactory();

    return this.#playwright;
  }
}
