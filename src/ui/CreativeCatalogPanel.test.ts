import { afterEach, describe, expect, it, vi } from "vitest";

import { MaterialWorldController } from "../game/MaterialWorldController.ts";
import {
  ITEM_DEFINITIONS,
  itemDefinitionFor,
  itemDefinitionOrThrow,
  itemIdForMaterial,
  type ItemId,
} from "../items/ItemRegistry.ts";
import {
  canShowCreativeCatalog,
  creativeCatalogItemsForCategory,
  grantCreativeCatalogItem,
  paginateCreativeCatalogItems,
  searchCreativeCatalogItems,
  CreativeCatalogPanel,
} from "./CreativeCatalogPanel.ts";

class FakeClassList {
  readonly #element: FakeElement;
  readonly #classes = new Set<string>();

  constructor(element: FakeElement) {
    this.#element = element;
  }

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
    const directClasses = this.#element.className.split(/\s+/).filter(Boolean);

    this.#element.className = [
      ...new Set([...directClasses, ...this.#classes]),
    ].join(" ");
  }
}

class FakeElement {
  readonly listeners = new Map<string, ((event: Event) => void)[]>();
  readonly children: FakeElement[] = [];
  readonly style = { setProperty: vi.fn() };
  readonly classList = new FakeClassList(this);
  className = "";
  textContent = "";
  title = "";
  type = "";
  value = "";
  placeholder = "";
  disabled = false;
  hidden = false;
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

function findByTitle(root: FakeElement, title: string): FakeElement {
  const element = allElements(root).find(
    (candidate) => candidate.title === title,
  );

  if (!element) {
    throw new Error(`Missing element with title ${title}`);
  }

  return element;
}

function generatedMaterialWorld(): MaterialWorldController {
  const materialWorld = new MaterialWorldController({ mode: "creative" });
  const result = materialWorld.combine("element:iron", "element:carbon");

  if (!result.ok) {
    throw new Error(result.message);
  }
  materialWorld.discoverMaterial(result.material.id);
  return materialWorld;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("creative catalog panel", () => {
  it("creative catalog is hidden in survival", () => {
    const root = installFakeDocument();
    const panel = new CreativeCatalogPanel(root as unknown as HTMLElement, {
      mode: "survival",
      inventory: { grantItem: vi.fn() },
      materialWorld: new MaterialWorldController({ mode: "survival" }),
    });

    panel.show();

    expect(canShowCreativeCatalog("survival")).toBe(false);
    expect(root.hidden).toBe(true);
  });

  it("creative catalog lists block items", () => {
    const materialWorld = new MaterialWorldController({ mode: "creative" });
    const blocks = creativeCatalogItemsForCategory(materialWorld, "blocks");

    expect(blocks.some((item) => item.id === "block:dirt")).toBe(true);
    expect(blocks.every((item) => item.kind === "block")).toBe(true);
  });

  it("creative catalog lists tools", () => {
    const materialWorld = new MaterialWorldController({ mode: "creative" });
    const tools = creativeCatalogItemsForCategory(materialWorld, "tools");

    expect(tools.map((item) => item.id)).toEqual(
      expect.arrayContaining(["tool:pickaxe", "tool:axe"]),
    );
  });

  it("creative catalog lists generated materials", () => {
    const materialWorld = generatedMaterialWorld();
    const items = creativeCatalogItemsForCategory(
      materialWorld,
      "generated-materials",
    );

    expect(items.map((item) => item.id)).toContainEqual(
      expect.stringMatching(/^generated-material:generated:/),
    );
  });

  it("paging works", () => {
    const page = paginateCreativeCatalogItems(ITEM_DEFINITIONS, 1, 4);

    expect(page.page).toBe(1);
    expect(page.pageCount).toBeGreaterThan(1);
    expect(page.items).toHaveLength(4);
  });

  it("search works", () => {
    const results = searchCreativeCatalogItems(ITEM_DEFINITIONS, "pickaxe");

    expect(results.map((item) => item.id)).toContain("tool:pickaxe");
    expect(searchCreativeCatalogItems(ITEM_DEFINITIONS, "block:dirt")).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "block:dirt" })]),
    );
  });

  it("clicking block grants a stack", () => {
    const root = installFakeDocument();
    const grantItem = vi.fn(() => true);
    const panel = new CreativeCatalogPanel(root as unknown as HTMLElement, {
      mode: "creative",
      inventory: { grantItem },
      materialWorld: new MaterialWorldController({ mode: "creative" }),
    });

    panel.show();
    click(findByTitle(root, "Dirt"));

    expect(grantItem).toHaveBeenCalledWith("block:dirt", 64);
  });

  it("clicking tool grants one", () => {
    const root = installFakeDocument();
    const grantItem = vi.fn(() => true);
    const panel = new CreativeCatalogPanel(root as unknown as HTMLElement, {
      mode: "creative",
      inventory: { grantItem },
      materialWorld: new MaterialWorldController({ mode: "creative" }),
    });

    panel.show();
    click(findByText(root, "Tools"));
    click(findByTitle(root, "Wooden Pickaxe"));

    expect(grantItem).toHaveBeenCalledWith("tool:pickaxe", 1);
  });

  it("inventory does not automatically own catalog items", () => {
    const counts = new Map<ItemId, number>();
    const inventory = {
      grantItem: vi.fn((itemId: ItemId, count: number) => {
        counts.set(itemId, (counts.get(itemId) ?? 0) + count);
        return true;
      }),
    };

    expect(counts.get("block:dirt")).toBeUndefined();
    expect(
      grantCreativeCatalogItem(inventory, itemDefinitionOrThrow("block:dirt")),
    ).toBe(64);
    expect(counts.get("block:dirt")).toBe(64);
  });

  it("unknown generated materials do not crash", () => {
    const materialWorld = new MaterialWorldController({ mode: "creative" });
    const unknown = itemDefinitionFor(
      itemIdForMaterial("generated:missing"),
      materialWorld,
    );
    const inventory = { grantItem: vi.fn(() => true) };

    expect(unknown).toMatchObject({
      displayName: "Unknown Material",
      kind: "generated_material",
    });
    expect(unknown ? grantCreativeCatalogItem(inventory, unknown) : 0).toBe(64);
  });
});
