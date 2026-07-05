import { afterEach, describe, expect, it, vi } from "vitest";

import { Inventory } from "../game/Inventory.ts";
import type { WorkbenchInventory } from "../game/WorkbenchController.ts";
import { WorkbenchController } from "../game/WorkbenchController.ts";
import { MaterialWorldController } from "../game/MaterialWorldController.ts";
import {
  itemIdForMaterial,
  modifiedToolItemId,
  modifiedToolRecipeId,
  type ItemId,
} from "../items/ItemRegistry.ts";
import {
  canOpenWorkbenchTestingPanel,
  WorkbenchPanel,
  workbenchRecipeViewModels,
} from "./WorkbenchPanel.ts";

class TestInventory implements WorkbenchInventory {
  readonly counts = new Map<ItemId, number>();

  constructor(readonly creative = false) {}

  isCreative(): boolean {
    return this.creative;
  }

  countItem(itemId: ItemId): number {
    return this.creative
      ? Number.POSITIVE_INFINITY
      : (this.counts.get(itemId) ?? 0);
  }

  addItem(itemId: ItemId, count: number): boolean {
    this.counts.set(itemId, (this.counts.get(itemId) ?? 0) + count);
    return true;
  }

  grantItem(itemId: ItemId, count: number): boolean {
    this.counts.set(itemId, (this.counts.get(itemId) ?? 0) + count);
    return true;
  }

  removeItem(itemId: ItemId, count: number): boolean {
    if (this.creative) {
      return true;
    }

    const available = this.counts.get(itemId) ?? 0;

    if (available < count) {
      return false;
    }

    this.counts.set(itemId, available - count);
    return true;
  }

  set(itemId: ItemId, count: number): void {
    this.counts.set(itemId, count);
  }
}

class FakeClassList {
  readonly #classes = new Set<string>();

  constructor(private readonly element: FakeElement) {}

  add(...classes: string[]): void {
    for (const className of classes) {
      this.#classes.add(className);
    }
    this.#sync();
  }

  remove(...classes: string[]): void {
    for (const className of classes) {
      this.#classes.delete(className);
    }
    this.#sync();
  }

  toggle(className: string, force?: boolean): boolean {
    const enabled = force ?? !this.#classes.has(className);

    if (enabled) {
      this.#classes.add(className);
    } else {
      this.#classes.delete(className);
    }
    this.#sync();
    return enabled;
  }

  contains(className: string): boolean {
    return this.#classes.has(className);
  }

  #sync(): void {
    const directClasses = this.element.className.split(/\s+/).filter(Boolean);

    this.element.className = [
      ...new Set([...directClasses, ...this.#classes]),
    ].join(" ");
  }
}

class FakeElement {
  readonly listeners = new Map<string, ((event: Event) => void)[]>();
  readonly children: FakeElement[] = [];
  readonly classList = new FakeClassList(this);
  className = "";
  textContent = "";
  type = "";
  hidden = false;
  disabled = false;
  tabIndex = 0;

  append(...children: (FakeElement | string)[]): void {
    for (const child of children) {
      if (typeof child === "string") {
        const text = new FakeElement();

        text.textContent = child;
        this.children.push(text);
      } else {
        this.children.push(child);
      }
    }
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter(
        (candidate) => candidate !== listener,
      ),
    );
  }

  setAttribute(): void {}

  focus(): void {}
}

function installFakeDocument(): FakeElement {
  const root = new FakeElement();
  const body = new FakeElement();

  vi.stubGlobal("document", {
    body,
    createElement: vi.fn(() => new FakeElement()),
  });

  return root;
}

function click(element: FakeElement): void {
  element.listeners.get("click")?.forEach((listener) =>
    listener({
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as Event),
  );
}

function allElements(root: FakeElement): readonly FakeElement[] {
  return [root, ...root.children.flatMap((child) => allElements(child))];
}

function findByText(root: FakeElement, text: string): FakeElement {
  const element = allElements(root).find((candidate) =>
    candidate.textContent.includes(text),
  );

  if (!element) {
    throw new Error(`Missing element with text ${text}`);
  }

  return element;
}

function controllerFor(
  inventory = new TestInventory(),
  openElementCombiner: () => void = () => {},
): WorkbenchController {
  return new WorkbenchController({
    inventory,
    materialWorld: new MaterialWorldController({ mode: "creative" }),
    openElementCombiner,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("workbench crafting", () => {
  it("inventory no longer creates CraftingController", () => {
    expect(Inventory.toString()).not.toContain("CraftingController");
    expect("craftRecipe" in Inventory.prototype).toBe(false);
  });

  it("basic workbench shows wood, planks, sticks, and wooden tools recipes", () => {
    const controller = controllerFor();

    expect(
      controller.recipesForWorkbench("basic").map((recipe) => recipe.id),
    ).toEqual(
      expect.arrayContaining([
        "wood_to_planks",
        "planks_to_sticks",
        "wooden_pickaxe",
        "wooden_axe",
        "wooden_shovel",
      ]),
    );
  });

  it("assembler shows modified tool recipes", () => {
    const inventory = new TestInventory();
    const ironItemId = itemIdForMaterial("element:iron");
    const controller = controllerFor(inventory);

    inventory.set("tool:pickaxe", 1);
    inventory.set(ironItemId, 1);

    expect(
      controller.recipesForWorkbench("assembler").map((recipe) => recipe.id),
    ).toContain(modifiedToolRecipeId("tool:pickaxe", "element:iron"));
  });

  it("survival crafting consumes inputs", () => {
    const inventory = new TestInventory();
    const controller = controllerFor(inventory);

    inventory.set("block:wood", 1);

    expect(controller.craft("wood_to_planks", "basic").ok).toBe(true);
    expect(inventory.counts.get("block:wood")).toBe(0);
    expect(inventory.counts.get("block:planks")).toBe(4);
  });

  it("creative crafting does not consume inputs", () => {
    const inventory = new TestInventory(true);
    const controller = controllerFor(inventory);

    inventory.set("block:wood", 1);

    expect(controller.craft("wood_to_planks", "basic").ok).toBe(true);
    expect(inventory.counts.get("block:wood")).toBe(1);
    expect(inventory.counts.get("block:planks")).toBe(4);
  });

  it("workbench recipe filtering works", () => {
    const controller = controllerFor();

    expect(
      controller
        .recipesForWorkbench("basic")
        .some((recipe) => recipe.id === "wood_to_planks"),
    ).toBe(true);
    expect(
      controller
        .recipesForWorkbench("assembler")
        .some((recipe) => recipe.id === "wood_to_planks"),
    ).toBe(false);
  });

  it("can craft material tool upgrades from the assembler", () => {
    const inventory = new TestInventory();
    const controller = controllerFor(inventory);
    const ironItemId = itemIdForMaterial("element:iron");
    const modifiedToolId = modifiedToolItemId("tool:pickaxe", "element:iron");

    inventory.set("tool:pickaxe", 1);
    inventory.set(ironItemId, 1);

    expect(
      controller.craft(
        modifiedToolRecipeId("tool:pickaxe", "element:iron"),
        "assembler",
      ).ok,
    ).toBe(true);
    expect(inventory.counts.get("tool:pickaxe")).toBe(0);
    expect(inventory.counts.get(ironItemId)).toBe(0);
    expect(inventory.counts.get(modifiedToolId)).toBe(1);
  });

  it("workbench panel displays recipes for the selected workbench", () => {
    const root = installFakeDocument();
    const controller = controllerFor();
    const panel = new WorkbenchPanel(root as unknown as HTMLElement, {
      controller,
    });

    panel.show("basic");

    expect(findByText(root, "Wood Planks")).toBeDefined();
    expect(
      workbenchRecipeViewModels(controller, "basic").map(
        (viewModel) => viewModel.recipe.id,
      ),
    ).toContain("planks_to_sticks");
  });

  it("placed workbench panels lock to their selected workbench type", () => {
    const root = installFakeDocument();
    const panel = new WorkbenchPanel(root as unknown as HTMLElement, {
      controller: controllerFor(),
    });

    panel.show("basic", true);

    expect(findByText(root, "Metal Workbench").disabled).toBe(true);
    expect(canOpenWorkbenchTestingPanel("survival", false)).toBe(false);
    expect(canOpenWorkbenchTestingPanel("creative", false)).toBe(true);
  });

  it("element combiner workbench opens the material combiner handoff", () => {
    const root = installFakeDocument();
    const openElementCombiner = vi.fn();
    const panel = new WorkbenchPanel(root as unknown as HTMLElement, {
      controller: controllerFor(new TestInventory(), openElementCombiner),
    });

    panel.show("element_combiner");
    click(findByText(root, "Open Material Combiner"));

    expect(openElementCombiner).toHaveBeenCalledOnce();
    expect(root.hidden).toBe(true);
  });
});
