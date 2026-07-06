import { describe, expect, it } from "vitest";

import {
  PanelManager,
  type GameplayPanelId,
  type ManagedPanel,
} from "./PanelManager.ts";

class FakeClassList {
  readonly classes = new Set<string>();

  toggle(className: string, force?: boolean): boolean {
    const enabled = force ?? !this.classes.has(className);

    if (enabled) {
      this.classes.add(className);
    } else {
      this.classes.delete(className);
    }

    return enabled;
  }

  contains(className: string): boolean {
    return this.classes.has(className);
  }
}

class FakePanel {
  isOpen = false;
  closeCount = 0;

  constructor(
    readonly id: GameplayPanelId,
    readonly bodyClass: string,
    private readonly manager: PanelManager,
  ) {}

  descriptor(): ManagedPanel {
    return {
      id: this.id,
      bodyClass: this.bodyClass,
      close: () => this.close(),
    };
  }

  open(): void {
    this.isOpen = true;
    this.manager.notifyPanelOpenChange(this.id, true);
  }

  close(): void {
    if (!this.isOpen) {
      return;
    }

    this.closeCount += 1;
    this.isOpen = false;
    this.manager.notifyPanelOpenChange(this.id, false);
  }
}

function createManager(isGameActive = true): Readonly<{
  bodyClassList: FakeClassList;
  manager: PanelManager;
  calls: { released: number; resumed: number };
}> {
  const bodyClassList = new FakeClassList();
  const calls = { released: 0, resumed: 0 };
  const manager = new PanelManager({
    body: { classList: bodyClassList } as unknown as HTMLElement,
    isGameActive: () => isGameActive,
    releaseInput: () => {
      calls.released += 1;
    },
    resumeInput: () => {
      calls.resumed += 1;
    },
  });

  return { bodyClassList, calls, manager };
}

function registerPanel(
  manager: PanelManager,
  id: GameplayPanelId,
  bodyClass: string,
): FakePanel {
  const panel = new FakePanel(id, bodyClass, manager);

  manager.registerPanel(panel.descriptor());

  return panel;
}

describe("PanelManager", () => {
  it("opening inventory closes combiner", () => {
    const { manager } = createManager();
    const inventory = registerPanel(manager, "inventory", "inventory-open");
    const combiner = registerPanel(
      manager,
      "material-combiner",
      "material-combiner-open",
    );

    manager.openPanel("material-combiner", () => combiner.open());
    manager.openPanel("inventory", () => inventory.open());

    expect(inventory.isOpen).toBe(true);
    expect(combiner.isOpen).toBe(false);
    expect(combiner.closeCount).toBe(1);
    expect(manager.activePanel()).toBe("inventory");
  });

  it("opening codex closes inventory", () => {
    const { manager } = createManager();
    const inventory = registerPanel(manager, "inventory", "inventory-open");
    const codex = registerPanel(
      manager,
      "material-codex",
      "material-codex-open",
    );

    manager.openPanel("inventory", () => inventory.open());
    manager.openPanel("material-codex", () => codex.open());

    expect(inventory.isOpen).toBe(false);
    expect(codex.isOpen).toBe(true);
    expect(manager.activePanel()).toBe("material-codex");
  });

  it("escape closes the active panel", () => {
    const { manager, calls } = createManager();
    const codex = registerPanel(
      manager,
      "material-codex",
      "material-codex-open",
    );

    manager.openPanel("material-codex", () => codex.open());

    expect(manager.handleEscape()).toBe(true);
    expect(codex.isOpen).toBe(false);
    expect(manager.activePanel()).toBeNull();
    expect(calls.resumed).toBe(1);
  });

  it("reports and applies pointer lock resume decisions", () => {
    const active = createManager(true);
    const inactive = createManager(false);
    const activeInventory = registerPanel(
      active.manager,
      "inventory",
      "inventory-open",
    );
    const inactiveInventory = registerPanel(
      inactive.manager,
      "inventory",
      "inventory-open",
    );

    active.manager.openPanel("inventory", () => activeInventory.open());
    inactive.manager.openPanel("inventory", () => inactiveInventory.open());

    expect(active.calls.released).toBe(1);
    expect(active.manager.shouldResumeInput()).toBe(false);

    active.manager.closeActivePanel();
    inactive.manager.closeActivePanel();

    expect(active.manager.shouldResumeInput()).toBe(true);
    expect(inactive.manager.shouldResumeInput()).toBe(false);
    expect(active.calls.resumed).toBe(1);
    expect(inactive.calls.resumed).toBe(0);
  });

  it("updates body classes consistently", () => {
    const { bodyClassList, manager } = createManager();
    const inventory = registerPanel(manager, "inventory", "inventory-open");
    const storage = registerPanel(
      manager,
      "material-storage",
      "material-storage-open",
    );

    manager.openPanel("inventory", () => inventory.open());
    expect(bodyClassList.contains("inventory-open")).toBe(true);
    expect(bodyClassList.contains("material-storage-open")).toBe(false);

    manager.openPanel("material-storage", () => storage.open());
    expect(bodyClassList.contains("inventory-open")).toBe(false);
    expect(bodyClassList.contains("material-storage-open")).toBe(true);

    manager.closeActivePanel();
    expect(bodyClassList.contains("inventory-open")).toBe(false);
    expect(bodyClassList.contains("material-storage-open")).toBe(false);
  });
});
