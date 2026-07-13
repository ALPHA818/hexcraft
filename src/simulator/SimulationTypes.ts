export type GameAdapterKind = "browser";

export type GameStateSnapshot = Readonly<{
  adapter: GameAdapterKind;
  instanceId: string;
  capturedAt: number;
  source: "instrumented" | "basic";
  status: "open" | "closed" | "crashed";
  url: string;
  title: string;
  summary: string;
  data: Record<string, unknown>;
  diagnostics: Readonly<{
    consoleErrors: readonly string[];
    consoleWarnings: readonly string[];
    pageErrors: readonly string[];
    pageEvents: readonly string[];
  }>;
  screenshotPath?: string;
}>;

export type GameActionInput =
  | string
  | Readonly<{
      id: string;
      payload?: unknown;
    }>;

export type GameActionResult = Readonly<{
  ok: boolean;
  actionId: string;
  message: string;
  hookResult?: unknown;
}>;

export type MouseButton = "left" | "middle" | "right";

export type BrowserActionDefinition = Readonly<{
  id: string;
  label: string;
  description?: string;
  type: "js" | "keyboard" | "mouse" | "wait" | "reload" | "menu";
  key?: string;
  keys?: readonly string[];
  durationMs?: number;
  mouse?: Readonly<{
    x: number;
    y: number;
    button?: MouseButton;
  }>;
  waitMs?: number;
  payload?: unknown;
}>;

export type BrowserControlMapping = Readonly<{
  id: string;
  label?: string;
  description?: string;
  jsAction?: string;
  key?: string;
  keys?: readonly string[];
  durationMs?: number;
  mouse?: Readonly<{
    x: number;
    y: number;
    button?: MouseButton;
  }>;
  waitMs?: number;
  reload?: boolean;
  menuKey?: string;
  payload?: unknown;
}>;

export type GameProfile = Readonly<{
  id: string;
  name: string;
  controlMappings?: readonly BrowserControlMapping[];
}>;
