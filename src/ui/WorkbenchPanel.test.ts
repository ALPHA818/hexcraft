import { afterEach, describe, expect, it, vi } from "vitest";

import { Inventory } from "../game/Inventory.ts";
import type { WorkbenchInventory } from "../game/WorkbenchController.ts";
import { WorkbenchController } from "../game/WorkbenchController.ts";
import { MaterialWorldController } from "../game/MaterialWorldController.ts";
import { GENERATED_MATERIAL_RECIPE_OUTPUTS } from "../crafting/GeneratedMaterialRecipes.ts";
import type { WorkbenchType } from "../crafting/WorkbenchTypes.ts";
import type {
  MaterialDefinition,
  MaterialStats,
} from "../materials/MaterialTypes.ts";
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
  title = "";
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

const BASE_MATERIAL_STATS: MaterialStats = {
  stability: 88,
  hardness: 96,
  density: 76,
  heat: 20,
  conductivity: 64,
  toxicity: 0,
  radioactivity: 0,
  magic: 0,
  organic: 0,
  metal: 96,
  crystal: 10,
  gas: 0,
  liquid: 0,
};

function generatedWorkbenchMaterial(
  id = "generated:locked-alloy",
): MaterialDefinition {
  return {
    id,
    name: "Locked Alloy",
    generation: 1,
    parents: ["element:iron", "element:carbon"],
    rarity: "rare",
    ...BASE_MATERIAL_STATS,
    tags: ["metal", "alloy", "forged"],
    requiredResearchTier: "metallurgical",
    discoveredAt: 1,
  };
}

const LOW_QUALITY_MATERIAL_STATS: MaterialStats = {
  stability: 35,
  hardness: 15,
  density: 20,
  heat: 10,
  conductivity: 10,
  toxicity: 0,
  radioactivity: 0,
  magic: 0,
  organic: 0,
  metal: 0,
  crystal: 0,
  gas: 0,
  liquid: 0,
};

function generatedProgressionMaterial(
  id: string,
  name: string,
  stats: Partial<MaterialStats>,
  tags: readonly string[] = [],
): MaterialDefinition {
  return {
    id,
    name,
    generation: 1,
    parents: ["element:iron", "element:carbon"],
    rarity: "rare",
    ...LOW_QUALITY_MATERIAL_STATS,
    ...stats,
    tags,
    discoveredAt: 1,
  };
}

function controllerForMaterial(
  material: MaterialDefinition,
  inventory = new TestInventory(),
): WorkbenchController {
  const materialWorld = new MaterialWorldController({
    mode: inventory.isCreative() ? "creative" : "survival",
  });

  materialWorld.registry.registerGeneratedMaterial(material);

  return new WorkbenchController({
    inventory,
    materialWorld,
  });
}

function generatedRecipeIds(
  controller: WorkbenchController,
  workbenchType: WorkbenchType,
  recipeKind: string,
): readonly string[] {
  return controller
    .recipesForWorkbench(workbenchType)
    .filter(
      (recipe) =>
        "generatedRecipeKind" in recipe &&
        recipe.generatedRecipeKind === recipeKind,
    )
    .map((recipe) => recipe.id);
}

function generatedRecipeForKind(
  controller: WorkbenchController,
  workbenchType: WorkbenchType,
  recipeKind: string,
) {
  return (
    controller
      .recipesForWorkbench(workbenchType)
      .find(
        (recipe) =>
          "generatedRecipeKind" in recipe &&
          recipe.generatedRecipeKind === recipeKind,
      ) ?? null
  );
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

  it("metal recipes are hidden from basic workbenches and require metal workbench", () => {
    const controller = controllerFor();

    expect(
      controller
        .recipesForWorkbench("basic")
        .some((recipe) => recipe.id === "forge_station_iron"),
    ).toBe(false);
    expect(
      controller
        .recipesForWorkbench("metal")
        .some((recipe) => recipe.id === "forge_station_iron"),
    ).toBe(true);
    expect(controller.craft("forge_station_iron", "basic")).toMatchObject({
      ok: false,
      reason: "wrong_workbench",
    });
  });

  it("magic recipes are hidden from basic workbenches and require magic workbench", () => {
    const controller = controllerFor();

    expect(
      controller
        .recipesForWorkbench("basic")
        .some((recipe) => recipe.id === "infuser_station"),
    ).toBe(false);
    expect(
      controller
        .recipesForWorkbench("magic")
        .some((recipe) => recipe.id === "infuser_station"),
    ).toBe(true);
    expect(controller.craft("infuser_station", "basic")).toMatchObject({
      ok: false,
      reason: "wrong_workbench",
    });
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

  it("assembler recipes cannot be crafted at another station", () => {
    const inventory = new TestInventory();
    const controller = controllerFor(inventory);
    const ironItemId = itemIdForMaterial("element:iron");

    inventory.set("tool:pickaxe", 1);
    inventory.set(ironItemId, 1);

    expect(
      controller.craft(
        modifiedToolRecipeId("tool:pickaxe", "element:iron"),
        "basic",
      ),
    ).toMatchObject({
      ok: false,
      reason: "wrong_workbench",
    });
  });

  it("high toolGrade generated materials create assembler upgrade recipes", () => {
    const inventory = new TestInventory();
    const material = generatedProgressionMaterial(
      "generated:workbench-tool-alloy",
      "Workbench Tool Alloy",
      {
        stability: 88,
        hardness: 96,
        density: 76,
        conductivity: 64,
        metal: 96,
      },
      ["metal", "alloy", "forged"],
    );
    const materialItemId = itemIdForMaterial(material.id);
    const controller = controllerForMaterial(material, inventory);

    inventory.set("tool:pickaxe", 1);
    inventory.set(materialItemId, 1);

    expect(
      controller.recipesForWorkbench("assembler").map((recipe) => recipe.id),
    ).toContain(modifiedToolRecipeId("tool:pickaxe", material.id));
  });

  it("high buildingGrade generated materials create assembler stabilize recipes", () => {
    const inventory = new TestInventory();
    const material = generatedProgressionMaterial(
      "generated:workbench-fortress-stone",
      "Workbench Fortress Stone",
      {
        stability: 98,
        hardness: 92,
        density: 86,
        metal: 18,
        crystal: 12,
      },
      ["building", "stone", "stable"],
    );
    const controller = controllerForMaterial(material, inventory);

    inventory.set(itemIdForMaterial(material.id), 1);

    expect(
      generatedRecipeIds(controller, "assembler", "stabilized_block"),
    ).toContain(`generated-material:stabilized_block:${material.id}`);
    expect(generatedRecipeIds(controller, "basic", "stabilized_block")).toEqual(
      [],
    );
  });

  it("high magicFocusGrade generated materials create magic recipes", () => {
    const inventory = new TestInventory();
    const material = generatedProgressionMaterial(
      "generated:workbench-arcane-crystal",
      "Workbench Arcane Crystal",
      {
        stability: 82,
        conductivity: 66,
        magic: 98,
        crystal: 96,
      },
      ["magic", "arcane", "crystal", "focus"],
    );
    const controller = controllerForMaterial(material, inventory);
    const materialItemId = itemIdForMaterial(material.id);

    inventory.set(materialItemId, 1);

    const recipe = generatedRecipeForKind(controller, "magic", "magic_core");

    expect(recipe).toMatchObject({
      requiredWorkbench: "magic",
      outputs: [
        { itemId: GENERATED_MATERIAL_RECIPE_OUTPUTS.magicCore, count: 1 },
      ],
    });
    expect(generatedRecipeIds(controller, "chemical", "magic_core")).toEqual(
      [],
    );
  });

  it("low quality generated materials do not unlock advanced recipes", () => {
    const inventory = new TestInventory();
    const material = generatedProgressionMaterial(
      "generated:workbench-muddy-slush",
      "Workbench Muddy Slush",
      {},
      ["mud"],
    );
    const controller = controllerForMaterial(material, inventory);

    inventory.set("tool:pickaxe", 1);
    inventory.set(itemIdForMaterial(material.id), 1);

    expect(
      [
        ...controller.recipesForWorkbench("basic"),
        ...controller.recipesForWorkbench("metal"),
        ...controller.recipesForWorkbench("magic"),
        ...controller.recipesForWorkbench("chemical"),
        ...controller.recipesForWorkbench("assembler"),
      ].some(
        (recipe) =>
          "generatedMaterialId" in recipe &&
          recipe.generatedMaterialId === material.id,
      ),
    ).toBe(false);
  });

  it("survival generated material crafting consumes input", () => {
    const inventory = new TestInventory();
    const material = generatedProgressionMaterial(
      "generated:survival-core-crystal",
      "Survival Core Crystal",
      {
        stability: 82,
        conductivity: 66,
        magic: 98,
        crystal: 96,
      },
      ["magic", "arcane", "crystal", "focus"],
    );
    const materialItemId = itemIdForMaterial(material.id);
    const controller = controllerForMaterial(material, inventory);

    inventory.set(materialItemId, 1);

    const recipe = generatedRecipeForKind(controller, "magic", "magic_core");

    expect(recipe).not.toBeNull();
    expect(controller.craft(recipe?.id ?? "", "magic").ok).toBe(true);
    expect(inventory.counts.get(materialItemId)).toBe(0);
    expect(
      inventory.counts.get(GENERATED_MATERIAL_RECIPE_OUTPUTS.magicCore),
    ).toBe(1);
  });

  it("creative generated material crafting does not consume input", () => {
    const inventory = new TestInventory(true);
    const material = generatedProgressionMaterial(
      "generated:creative-core-crystal",
      "Creative Core Crystal",
      {
        stability: 82,
        conductivity: 66,
        magic: 98,
        crystal: 96,
      },
      ["magic", "arcane", "crystal", "focus"],
    );
    const materialItemId = itemIdForMaterial(material.id);
    const controller = controllerForMaterial(material, inventory);
    const recipe = generatedRecipeForKind(controller, "magic", "magic_core");

    inventory.set(materialItemId, 1);

    expect(recipe).not.toBeNull();
    expect(controller.craft(recipe?.id ?? "", "magic").ok).toBe(true);
    expect(inventory.counts.get(materialItemId)).toBe(1);
    expect(
      inventory.counts.get(GENERATED_MATERIAL_RECIPE_OUTPUTS.magicCore),
    ).toBe(1);
  });

  it("research-gated material upgrade recipes unlock with the required tier", () => {
    const inventory = new TestInventory();
    const materialWorld = new MaterialWorldController({ mode: "survival" });
    const material = generatedWorkbenchMaterial();
    const materialItemId = itemIdForMaterial(material.id);
    const recipeId = modifiedToolRecipeId("tool:pickaxe", material.id);
    const controller = new WorkbenchController({
      inventory,
      materialWorld,
    });

    materialWorld.registry.registerGeneratedMaterial(material);
    inventory.set("tool:pickaxe", 1);
    inventory.set(materialItemId, 1);

    expect(
      controller
        .recipesForWorkbench("assembler")
        .some((recipe) => recipe.id === recipeId),
    ).toBe(false);
    expect(controller.craft(recipeId, "assembler")).toMatchObject({
      ok: false,
      reason: "research_locked",
    });

    expect(materialWorld.unlockResearchTier("metallurgical")).toBe(true);
    expect(
      controller
        .recipesForWorkbench("assembler")
        .some((recipe) => recipe.id === recipeId),
    ).toBe(true);
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

    expect(
      findByText(root, "Other workbench tabs require interacting"),
    ).toBeDefined();
    expect(findByText(root, "Metal Workbench").disabled).toBe(true);
    expect(findByText(root, "Metal Workbench").title).toBe(
      "Requires placed Metal Workbench",
    );
    expect(canOpenWorkbenchTestingPanel("survival", false)).toBe(false);
    expect(canOpenWorkbenchTestingPanel("creative", false)).toBe(true);
  });

  it("creative debug-open panels can browse advanced station recipes", () => {
    const root = installFakeDocument();
    const panel = new WorkbenchPanel(root as unknown as HTMLElement, {
      controller: controllerFor(new TestInventory(true)),
    });

    panel.show("basic", false);
    click(findByText(root, "Metal Workbench"));

    expect(findByText(root, "Forge Station")).toBeDefined();
    expect(findByText(root, "Basic Workbench").disabled).toBe(false);
  });

  it("survival placed station panels stay locked to that station", () => {
    const root = installFakeDocument();
    const panel = new WorkbenchPanel(root as unknown as HTMLElement, {
      controller: controllerFor(new TestInventory(false)),
    });

    panel.show("metal", true);

    expect(findByText(root, "Forge Station")).toBeDefined();
    expect(findByText(root, "Basic Workbench").disabled).toBe(true);
    expect(findByText(root, "Magic Workbench").disabled).toBe(true);
    click(findByText(root, "Basic Workbench"));
    expect(findByText(root, "Forge Station")).toBeDefined();
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
