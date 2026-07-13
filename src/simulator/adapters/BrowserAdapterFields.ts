export type BrowserAdapterFieldId =
  | "gameUrl"
  | "browserType"
  | "readBrowserGameState"
  | "captureConsoleErrors"
  | "capturePageErrors"
  | "useKeyboardInput"
  | "useMouseInput"
  | "reloadPage"
  | "browserContext";

export type BrowserAdapterField = Readonly<{
  id: BrowserAdapterFieldId;
  label: string;
  help: string;
}>;

export const BROWSER_ADAPTER_FIELDS = [
  {
    id: "gameUrl",
    label: "Game URL",
    help:
      "This is the web address of the browser game.\n" +
      "The simulator opens this page before the bots start testing.\n" +
      "For example, http://localhost:5173 or https://mygame.example.com.\n" +
      "If this is wrong, the simulator will open the wrong page or fail to start.",
  },
  {
    id: "browserType",
    label: "Browser type",
    help:
      "Choose which Playwright browser engine runs the game.\n" +
      "Chromium is the default because most browser games target it first.\n" +
      "Use Firefox or WebKit only when you want to test those engines specifically.",
  },
  {
    id: "readBrowserGameState",
    label: "Read browser game state",
    help:
      "When enabled, the adapter reads window.__GAMEPLAY_SIM_STATE__ from the page.\n" +
      "Use this for instrumented games that expose structured state to the simulator.\n" +
      "If the hook is missing, the adapter falls back to URL, title, page status, and diagnostics.",
  },
  {
    id: "captureConsoleErrors",
    label: "Capture console errors",
    help:
      "Records browser console messages such as console.error and console.warn.\n" +
      "These diagnostics help explain why a bot action failed or why the game stopped responding.\n" +
      "Turn this off only if console capture creates too much noise.",
  },
  {
    id: "capturePageErrors",
    label: "Capture page errors",
    help:
      "Records uncaught exceptions from the browser page.\n" +
      "Page errors usually indicate real game bugs or broken test setup.\n" +
      "The adapter includes them in every state snapshot.",
  },
  {
    id: "useKeyboardInput",
    label: "Use keyboard input",
    help:
      "Allows bots to press mapped keyboard controls through Playwright.\n" +
      "Use this for games controlled with keys such as WASD, Space, or Escape.\n" +
      "Disable it when the game should only receive hook or mouse actions.",
  },
  {
    id: "useMouseInput",
    label: "Use mouse input",
    help:
      "Allows bots to click mapped screen coordinates through Playwright.\n" +
      "Use this for menus, buttons, aiming, or pointer-driven games.\n" +
      "Disable it when mouse clicks would interfere with the test.",
  },
  {
    id: "reloadPage",
    label: "Reload page",
    help:
      "Allows the adapter to reload the game page as an action.\n" +
      "This is useful for reset tests or recovering from broken state.\n" +
      "If disabled, reload actions are rejected.",
  },
  {
    id: "browserContext",
    label: "Browser context",
    help:
      "Optional Playwright browser context settings for this game instance.\n" +
      "Use it for viewport size, locale, user agent, permissions, or stored state.\n" +
      "Each launched instance receives its own isolated context.",
  },
] as const satisfies readonly BrowserAdapterField[];

export function browserAdapterFieldHelp(
  fieldId: BrowserAdapterFieldId,
): string {
  return BROWSER_ADAPTER_FIELDS.find((field) => field.id === fieldId)!.help;
}

export function browserAdapterHelpLabel(
  fieldId: BrowserAdapterFieldId,
): string {
  const field = BROWSER_ADAPTER_FIELDS.find(
    (candidate) => candidate.id === fieldId,
  )!;

  return `${field.label} ?`;
}
