import type { WorkbenchController } from "../game/WorkbenchController.ts";
import type { GameMode } from "../game/gameMode.ts";
import type { Recipe, RecipeStack } from "../crafting/RecipeTypes.ts";
import {
  WORKBENCH_LABELS,
  WORKBENCH_TYPES,
  type WorkbenchType,
} from "../crafting/WorkbenchTypes.ts";
import { recipeRequiredWorkbench } from "../crafting/RecipeRegistry.ts";

export type WorkbenchPanelSession = Readonly<{
  controller: WorkbenchController;
}>;

export type WorkbenchRecipeViewModel = Readonly<{
  recipe: Recipe;
  canCraft: boolean;
  summary: string;
  ingredients: readonly WorkbenchRecipeIngredientView[];
  category: string;
}>;

export type WorkbenchRecipeIngredientView = Readonly<{
  itemId: string;
  label: string;
  required: number;
  available: number;
  missing: number;
}>;

export function canOpenWorkbenchTestingPanel(
  mode: GameMode,
  debugOverlay: boolean,
): boolean {
  return mode === "creative" || debugOverlay;
}

function stackLabel(
  stack: RecipeStack,
  controller: WorkbenchController,
): string {
  const item = controller.itemDefinitionFor(stack.itemId);

  return `${stack.count}x ${item?.displayName ?? stack.itemId}`;
}

export function workbenchRecipeSummary(
  recipe: Recipe,
  controller: WorkbenchController,
): string {
  const inputs =
    recipe.type === "shapeless"
      ? recipe.inputs.map((stack) => stackLabel(stack, controller)).join(" + ")
      : "Shaped inputs";
  const outputs = recipe.outputs
    .map((stack) => stackLabel(stack, controller))
    .join(" + ");

  return `${inputs} -> ${outputs}`;
}

function recipeInputStacks(recipe: Recipe): readonly RecipeStack[] {
  return recipe.type === "shapeless"
    ? recipe.inputs
    : Object.values(recipe.keys);
}

export function workbenchRecipeIngredientViews(
  recipe: Recipe,
  controller: WorkbenchController,
): readonly WorkbenchRecipeIngredientView[] {
  return recipeInputStacks(recipe).map((stack) => {
    const item = controller.itemDefinitionFor(stack.itemId);
    const available = controller.countItem(stack.itemId);

    return {
      itemId: stack.itemId,
      label: item?.displayName ?? stack.itemId,
      required: stack.count,
      available,
      missing: Math.max(0, stack.count - available),
    };
  });
}

export function workbenchRecipeViewModels(
  controller: WorkbenchController,
  workbenchType: WorkbenchType,
): readonly WorkbenchRecipeViewModel[] {
  return controller.recipesForWorkbench(workbenchType).map((recipe) => ({
    recipe,
    canCraft: controller.canCraft(recipe),
    summary: workbenchRecipeSummary(recipe, controller),
    ingredients: workbenchRecipeIngredientViews(recipe, controller),
    category: WORKBENCH_LABELS[recipeRequiredWorkbench(recipe)],
  }));
}

export class WorkbenchPanel {
  readonly #root: HTMLElement;
  readonly #onOpenChange: (isOpen: boolean) => void;

  #session: WorkbenchPanelSession | null = null;
  #workbenchType: WorkbenchType = "basic";
  #lockedToWorkbench = false;
  #message = "";

  constructor(
    root: HTMLElement,
    session: WorkbenchPanelSession | null = null,
    onOpenChange: (isOpen: boolean) => void = () => {},
  ) {
    this.#root = root;
    this.#onOpenChange = onOpenChange;
    this.#root.className = "workbench-panel";
    this.#root.setAttribute("role", "dialog");
    this.#root.setAttribute("aria-label", "Workbench");
    this.#root.tabIndex = -1;
    this.setSession(session);
    this.hide();
  }

  setSession(session: WorkbenchPanelSession | null): void {
    this.#session = session;
    this.#message = "";

    if (this.isOpen()) {
      this.#render();
    }
  }

  isOpen(): boolean {
    return !this.#root.hidden;
  }

  show(
    workbenchType: WorkbenchType = "basic",
    lockedToWorkbench = false,
  ): void {
    this.#workbenchType = workbenchType;
    this.#lockedToWorkbench = lockedToWorkbench;
    this.#root.hidden = false;
    document.body.classList.add("workbench-open");
    this.#render();
    this.#onOpenChange(true);
    this.#root.focus({ preventScroll: true });
  }

  hide(): void {
    this.#root.hidden = true;
    this.#root.replaceChildren();
    document.body.classList.remove("workbench-open");
    this.#lockedToWorkbench = false;
    this.#message = "";
    this.#onOpenChange(false);
  }

  refresh(): void {
    if (this.isOpen()) {
      this.#render();
    }
  }

  #render(): void {
    const card = document.createElement("section");
    const header = document.createElement("header");
    const titleGroup = document.createElement("div");
    const title = document.createElement("h2");
    const subtitle = document.createElement("p");
    const closeButton = document.createElement("button");
    const tabs = document.createElement("nav");
    const list = document.createElement("section");
    const message = document.createElement("p");

    card.className = "workbench-card";
    title.textContent = WORKBENCH_LABELS[this.#workbenchType];
    subtitle.textContent = `${WORKBENCH_LABELS[this.#workbenchType]} recipes`;
    closeButton.type = "button";
    closeButton.className = "workbench-close";
    closeButton.textContent = "Close";
    closeButton.title = "Close workbench";
    closeButton.setAttribute("aria-label", "Close workbench");
    closeButton.addEventListener("click", () => this.hide());
    titleGroup.append(title, subtitle);
    header.append(titleGroup, closeButton);

    tabs.className = "workbench-tabs";
    tabs.replaceChildren(
      ...WORKBENCH_TYPES.map((workbenchType) =>
        this.#createWorkbenchButton(workbenchType),
      ),
    );

    list.className = "workbench-recipe-list";
    list.replaceChildren(...this.#createWorkbenchContents());

    message.className = "workbench-message";
    message.textContent = this.#message;
    card.append(header, tabs, list, message);
    this.#root.replaceChildren(card);
    this.#root.removeEventListener("keydown", this.#handleKeyDown);
    this.#root.addEventListener("keydown", this.#handleKeyDown);
  }

  readonly #handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.hide();
    }
  };

  #createWorkbenchContents(): readonly HTMLElement[] {
    const session = this.#session;

    if (!session) {
      return [this.#emptyMessage("No active world.")];
    }

    const rows: HTMLElement[] = [];

    if (this.#workbenchType === "element_combiner") {
      rows.push(this.#createElementCombinerEntry(session.controller));
    }

    const recipes = workbenchRecipeViewModels(
      session.controller,
      this.#workbenchType,
    );

    rows.push(
      ...(recipes.length > 0
        ? recipes.map((viewModel) =>
            this.#createRecipeRow(viewModel, session.controller),
          )
        : this.#workbenchType === "element_combiner"
          ? []
          : [this.#emptyMessage("No recipes for this workbench.")]),
    );

    return rows;
  }

  #createWorkbenchButton(workbenchType: WorkbenchType): HTMLButtonElement {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "workbench-tab";
    button.classList.toggle("selected", workbenchType === this.#workbenchType);
    button.title = `Show ${WORKBENCH_LABELS[workbenchType]} recipes`;
    button.setAttribute(
      "aria-label",
      `Show ${WORKBENCH_LABELS[workbenchType]} recipes`,
    );
    button.disabled =
      this.#lockedToWorkbench && workbenchType !== this.#workbenchType;
    button.textContent = WORKBENCH_LABELS[workbenchType];
    button.addEventListener("click", () => {
      if (button.disabled) {
        return;
      }

      this.#workbenchType = workbenchType;
      this.#message = "";
      this.#render();
    });
    return button;
  }

  #createElementCombinerEntry(
    controller: WorkbenchController,
  ): HTMLButtonElement {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "workbench-combiner-entry recipe can-craft";
    button.textContent = "Open Material Combiner";
    button.title = "Open procedural material combiner";
    button.setAttribute("aria-label", "Open procedural material combiner");
    button.addEventListener("click", () => {
      this.hide();
      controller.openElementCombiner();
    });
    return button;
  }

  #createRecipeRow(
    viewModel: WorkbenchRecipeViewModel,
    controller: WorkbenchController,
  ): HTMLElement {
    const row = document.createElement("article");
    const details = document.createElement("div");
    const meta = document.createElement("span");
    const name = document.createElement("strong");
    const summary = document.createElement("p");
    const ingredients = document.createElement("ul");
    const craftButton = document.createElement("button");

    row.className = `workbench-recipe recipe ${recipeRequiredWorkbench(viewModel.recipe)}-recipe`;
    row.classList.toggle("can-craft", viewModel.canCraft);
    row.classList.toggle("missing-ingredients", !viewModel.canCraft);
    meta.className = "workbench-recipe-category";
    meta.textContent = viewModel.category;
    name.textContent = viewModel.recipe.displayName;
    summary.textContent = viewModel.summary;
    ingredients.className = "workbench-ingredient-list";
    ingredients.replaceChildren(
      ...viewModel.ingredients.map((ingredient) =>
        this.#createIngredientRow(ingredient),
      ),
    );
    details.append(meta, name, summary, ingredients);
    craftButton.type = "button";
    craftButton.textContent = "Craft";
    craftButton.disabled = !viewModel.canCraft;
    craftButton.title = viewModel.canCraft
      ? `Craft ${viewModel.recipe.displayName}`
      : `Missing ingredients for ${viewModel.recipe.displayName}`;
    craftButton.setAttribute("aria-label", craftButton.title);
    craftButton.addEventListener("click", () => {
      const result = controller.craft(viewModel.recipe.id, this.#workbenchType);

      this.#message = result.message;
      this.#render();
    });
    row.append(details, craftButton);
    return row;
  }

  #createIngredientRow(
    ingredient: WorkbenchRecipeIngredientView,
  ): HTMLLIElement {
    const row = document.createElement("li");

    row.className = "workbench-ingredient";
    row.classList.toggle("missing", ingredient.missing > 0);
    row.textContent =
      ingredient.missing > 0
        ? `${ingredient.label}: ${ingredient.available}/${ingredient.required} (missing ${ingredient.missing})`
        : `${ingredient.label}: ${ingredient.required}`;
    return row;
  }

  #emptyMessage(text: string): HTMLElement {
    const message = document.createElement("p");

    message.className = "workbench-empty";
    message.textContent = text;
    return message;
  }
}
