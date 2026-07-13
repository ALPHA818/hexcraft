import type { GameMode } from "../game/gameMode.ts";
import type { MaterialWorldController } from "../game/MaterialWorldController.ts";
import {
  ITEM_DEFINITIONS,
  itemDefinitionFor,
  itemIdForMaterial,
  type ItemDefinition,
  type ItemId,
} from "../items/ItemRegistry.ts";
import {
  materialBlockTintCssForVisuals,
  materialVisualsForMaterial,
  UNKNOWN_MATERIAL_VISUALS,
} from "../materials/MaterialVisuals.ts";

export const CREATIVE_CATALOG_PAGE_SIZE = 40;

export type CreativeCatalogCategory =
  | "blocks"
  | "tools"
  | "static-materials"
  | "generated-materials"
  | "workbenches"
  | "search";

export type CreativeCatalogInventory = Readonly<{
  grantItem: (itemId: ItemId, count: number) => boolean;
}>;

export type CreativeCatalogSession = Readonly<{
  mode: GameMode;
  inventory: CreativeCatalogInventory;
  materialWorld: MaterialWorldController;
  showDebugIds?: () => boolean;
  onItemGranted?: (item: ItemDefinition, count: number) => void;
  onSaveRequested?: () => void;
}>;

export type CreativeCatalogPage<T> = Readonly<{
  page: number;
  pageCount: number;
  items: readonly T[];
}>;

export const CREATIVE_CATALOG_CATEGORIES = [
  ["blocks", "Blocks"],
  ["tools", "Tools"],
  ["static-materials", "Static Materials"],
  ["generated-materials", "Generated Materials"],
  ["workbenches", "Workbenches"],
  ["search", "Search"],
] as const satisfies readonly (readonly [CreativeCatalogCategory, string])[];

function safeItemClass(itemId: string): string {
  return `item-${itemId.replace(/[^a-z0-9_-]/gi, "-")}`;
}

function isWorkbenchItem(item: ItemDefinition): boolean {
  return (
    item.kind === "block" &&
    (item.block.id === "element_combiner" ||
      item.block.id.endsWith("_workbench") ||
      item.block.id.endsWith("_station"))
  );
}

function generatedMaterialItems(
  materialWorld: MaterialWorldController,
): readonly ItemDefinition[] {
  return materialWorld
    .listDiscoveredMaterials()
    .map((material) =>
      itemDefinitionFor(itemIdForMaterial(material.id), materialWorld),
    )
    .filter((item): item is ItemDefinition => item !== null)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function dedupeItems(
  items: Iterable<ItemDefinition>,
): readonly ItemDefinition[] {
  const itemsById = new Map<string, ItemDefinition>();

  for (const item of items) {
    itemsById.set(item.id, item);
  }

  return [...itemsById.values()];
}

export function canShowCreativeCatalog(mode: GameMode): boolean {
  return mode === "creative";
}

export function creativeCatalogGrantCount(item: ItemDefinition): number {
  return item.kind === "tool" ? 1 : item.maxStackSize;
}

export function creativeCatalogItemsForCategory(
  materialWorld: MaterialWorldController,
  category: CreativeCatalogCategory,
  staticItems: readonly ItemDefinition[] = ITEM_DEFINITIONS,
): readonly ItemDefinition[] {
  const generatedItems = generatedMaterialItems(materialWorld);

  if (category === "blocks") {
    return staticItems
      .filter((item) => item.kind === "block" && !isWorkbenchItem(item))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  if (category === "tools") {
    return staticItems
      .filter((item) => item.kind === "tool")
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  if (category === "static-materials") {
    return staticItems
      .filter((item) => item.kind === "material")
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  if (category === "generated-materials") {
    return generatedItems;
  }

  if (category === "workbenches") {
    return staticItems
      .filter(isWorkbenchItem)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  return [
    ...dedupeItems([
      ...staticItems.filter((item) => !isWorkbenchItem(item)),
      ...staticItems.filter(isWorkbenchItem),
      ...generatedItems,
    ]),
  ].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function searchCreativeCatalogItems(
  items: readonly ItemDefinition[],
  query: string,
): readonly ItemDefinition[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery === "") {
    return items;
  }

  return items.filter(
    (item) =>
      item.displayName.toLowerCase().includes(normalizedQuery) ||
      item.id.toLowerCase().includes(normalizedQuery),
  );
}

export function paginateCreativeCatalogItems<T>(
  items: readonly T[],
  requestedPage: number,
  pageSize = CREATIVE_CATALOG_PAGE_SIZE,
): CreativeCatalogPage<T> {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(items.length / safePageSize));
  const page = Math.max(0, Math.min(pageCount - 1, Math.floor(requestedPage)));
  const start = page * safePageSize;

  return {
    page,
    pageCount,
    items: items.slice(start, start + safePageSize),
  };
}

export function grantCreativeCatalogItem(
  inventory: CreativeCatalogInventory,
  item: ItemDefinition,
): number {
  const count = creativeCatalogGrantCount(item);

  return inventory.grantItem(item.id, count) ? count : 0;
}

export class CreativeCatalogPanel {
  readonly #root: HTMLElement;
  readonly #onOpenChange: (isOpen: boolean) => void;

  #session: CreativeCatalogSession | null = null;
  #category: CreativeCatalogCategory = "blocks";
  #query = "";
  #page = 0;
  #message = "";

  constructor(
    root: HTMLElement,
    session: CreativeCatalogSession | null = null,
    onOpenChange: (isOpen: boolean) => void = () => {},
  ) {
    this.#root = root;
    this.#onOpenChange = onOpenChange;
    this.#root.className = "creative-catalog-panel";
    this.#root.setAttribute("role", "dialog");
    this.#root.setAttribute("aria-label", "Creative Catalog");
    this.#root.tabIndex = -1;
    this.setSession(session);
    this.hide();
  }

  setSession(session: CreativeCatalogSession | null): void {
    this.#session = session;
    this.#page = 0;
    this.#message = "";

    if (this.isOpen()) {
      this.#render();
    }
  }

  isOpen(): boolean {
    return !this.#root.hidden;
  }

  show(): void {
    if (!this.#session || !canShowCreativeCatalog(this.#session.mode)) {
      this.hide();
      return;
    }

    this.#root.hidden = false;
    document.body.classList.add("creative-catalog-open");
    this.#render();
    this.#onOpenChange(true);
    this.#root.focus({ preventScroll: true });
  }

  hide(): void {
    this.#root.hidden = true;
    this.#root.replaceChildren();
    document.body.classList.remove("creative-catalog-open");
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
    const controls = document.createElement("section");
    const searchInput = document.createElement("input");
    const tabs = document.createElement("nav");
    const list = document.createElement("section");
    const footer = document.createElement("footer");
    const previousButton = document.createElement("button");
    const nextButton = document.createElement("button");
    const pageIndicator = document.createElement("span");
    const message = document.createElement("p");
    const session = this.#session;

    card.className = "creative-catalog-card";
    title.textContent = "Creative Catalog";
    subtitle.textContent = "Grant catalog items without owning them by default";
    closeButton.type = "button";
    closeButton.className = "creative-catalog-close";
    closeButton.textContent = "Close";
    closeButton.title = "Close creative catalog";
    closeButton.setAttribute("aria-label", "Close creative catalog");
    closeButton.addEventListener("click", () => this.hide());
    titleGroup.append(title, subtitle);
    header.append(titleGroup, closeButton);

    searchInput.type = "search";
    searchInput.placeholder = "Search name or id";
    searchInput.title = "Search creative catalog";
    searchInput.setAttribute("aria-label", "Search creative catalog");
    searchInput.value = this.#query;
    searchInput.addEventListener("input", () => {
      this.#query = searchInput.value;
      this.#page = 0;
      this.#render();
    });

    tabs.className = "creative-catalog-tabs";
    tabs.setAttribute("aria-label", "Creative catalog categories");
    tabs.replaceChildren(
      ...CREATIVE_CATALOG_CATEGORIES.map(([category, label]) =>
        this.#createCategoryButton(category, label),
      ),
    );
    controls.className = "creative-catalog-controls";
    controls.append(searchInput, tabs);

    list.className = "creative-catalog-list";
    if (!session) {
      list.append(this.#emptyMessage("No active world."));
    } else if (!canShowCreativeCatalog(session.mode)) {
      list.append(this.#emptyMessage("Creative Catalog is unavailable."));
    } else {
      const items = searchCreativeCatalogItems(
        creativeCatalogItemsForCategory(session.materialWorld, this.#category),
        this.#category === "search" ? this.#query : this.#query,
      );
      const page = paginateCreativeCatalogItems(items, this.#page);

      this.#page = page.page;
      list.replaceChildren(
        ...(page.items.length > 0
          ? page.items.map((item) => this.#createItemCard(item, session))
          : [this.#emptyMessage("No catalog items match that filter.")]),
      );

      previousButton.type = "button";
      previousButton.textContent = "Previous";
      previousButton.title = "Previous catalog page";
      previousButton.setAttribute("aria-label", "Previous catalog page");
      previousButton.disabled = page.page <= 0;
      previousButton.addEventListener("click", () => {
        this.#page -= 1;
        this.#render();
      });
      nextButton.type = "button";
      nextButton.textContent = "Next";
      nextButton.title = "Next catalog page";
      nextButton.setAttribute("aria-label", "Next catalog page");
      nextButton.disabled = page.page >= page.pageCount - 1;
      nextButton.addEventListener("click", () => {
        this.#page += 1;
        this.#render();
      });
      pageIndicator.className = "creative-catalog-page";
      pageIndicator.textContent = `Page ${page.page + 1} / ${page.pageCount}`;
    }

    if (!pageIndicator.textContent) {
      previousButton.type = "button";
      previousButton.textContent = "Previous";
      previousButton.title = "Previous catalog page";
      previousButton.setAttribute("aria-label", "Previous catalog page");
      previousButton.disabled = true;
      nextButton.type = "button";
      nextButton.textContent = "Next";
      nextButton.title = "Next catalog page";
      nextButton.setAttribute("aria-label", "Next catalog page");
      nextButton.disabled = true;
      pageIndicator.className = "creative-catalog-page";
      pageIndicator.textContent = "Page 1 / 1";
    }

    message.className = "creative-catalog-message";
    message.textContent = this.#message;
    footer.className = "creative-catalog-footer";
    footer.append(previousButton, pageIndicator, nextButton);
    card.append(header, controls, list, footer, message);
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

  #createCategoryButton(
    category: CreativeCatalogCategory,
    label: string,
  ): HTMLButtonElement {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = label;
    button.className = "creative-catalog-tab";
    button.classList.toggle("selected", category === this.#category);
    button.title = `Show ${label}`;
    button.setAttribute("aria-label", `Show ${label}`);
    button.addEventListener("click", () => {
      this.#category = category;
      this.#page = 0;
      this.#render();
    });
    return button;
  }

  #createItemCard(
    item: ItemDefinition,
    session: CreativeCatalogSession,
  ): HTMLButtonElement {
    const card = document.createElement("button");
    const swatch = document.createElement("span");
    const details = document.createElement("span");
    const name = document.createElement("strong");
    const count = document.createElement("span");

    card.type = "button";
    card.className = `creative-catalog-item-card ${safeItemClass(item.id)}`;
    card.classList.add(`creative-catalog-kind-${item.kind}`);
    card.title = item.displayName;
    card.setAttribute(
      "aria-label",
      `Grant ${creativeCatalogGrantCount(item)} ${item.displayName}`,
    );
    swatch.className = "item-swatch";
    this.#applyItemVisual(card, item);
    name.textContent = item.displayName;
    count.textContent = `Grants ${creativeCatalogGrantCount(item)}`;
    details.className = "creative-catalog-item-details";
    details.append(name, count);
    if (session.showDebugIds?.() ?? false) {
      const id = document.createElement("code");

      id.textContent = item.id;
      details.append(id);
    }
    card.append(swatch, details);
    card.addEventListener("click", () => {
      const granted = grantCreativeCatalogItem(session.inventory, item);

      this.#message =
        granted > 0
          ? `Granted ${granted} ${item.displayName}.`
          : `Could not grant ${item.displayName}.`;
      if (granted > 0) {
        session.onItemGranted?.(item, granted);
        session.onSaveRequested?.();
      }
      this.#render();
    });
    return card;
  }

  #applyItemVisual(element: HTMLElement, item: ItemDefinition): void {
    if (item.kind === "generated_material") {
      const visuals = item.material
        ? materialVisualsForMaterial(item.material)
        : UNKNOWN_MATERIAL_VISUALS;

      element.classList.add("generated-material-visual");
      element.style.setProperty("--item-base-color", visuals.baseColor);
      element.style.setProperty("--item-accent-color", visuals.accentColor);
      element.style.setProperty(
        "--item-block-tint",
        materialBlockTintCssForVisuals(visuals),
      );
      element.style.setProperty(
        "--item-emissive-strength",
        String(visuals.emissiveStrength),
      );
      element.style.setProperty("--item-metallic", String(visuals.metallic));
      return;
    }

    if (item.kind === "block") {
      element.classList.add(`material-${item.material}`);
    }
  }

  #emptyMessage(text: string): HTMLElement {
    const empty = document.createElement("p");

    empty.className = "creative-catalog-empty";
    empty.textContent = text;
    return empty;
  }
}
