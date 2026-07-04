import type { MaterialRegistry } from "../materials/MaterialRegistry.ts";
import {
  materialStorageEntries,
  materialStorageTags,
  type MaterialStorage,
  type MaterialStorageSort,
} from "../game/MaterialStorage.ts";

export type MaterialStoragePanelSession = Readonly<{
  storage: MaterialStorage;
  registry: MaterialRegistry;
}>;

function createControlLabel(text: string, control: HTMLElement): HTMLElement {
  const label = document.createElement("label");
  const span = document.createElement("span");

  span.textContent = text;
  label.append(span, control);
  return label;
}

export class MaterialStoragePanel {
  readonly #root: HTMLElement;
  readonly #onOpenChange: (isOpen: boolean) => void;

  #session: MaterialStoragePanelSession | null = null;
  #sort: MaterialStorageSort = "name";
  #tag = "";
  #listRoot: HTMLElement | null = null;
  #summaryRoot: HTMLElement | null = null;
  #tagSelect: HTMLSelectElement | null = null;

  constructor(
    root: HTMLElement,
    session: MaterialStoragePanelSession | null = null,
    onOpenChange: (isOpen: boolean) => void = () => {},
  ) {
    this.#root = root;
    this.#session = session;
    this.#onOpenChange = onOpenChange;
    this.#root.className = "material-storage-panel";
    this.#root.setAttribute("role", "dialog");
    this.#root.setAttribute("aria-label", "Material Storage");
    this.#root.tabIndex = -1;
    this.hide();
  }

  setSession(session: MaterialStoragePanelSession | null): void {
    this.#session = session;

    if (this.isOpen()) {
      this.#renderShell();
      this.#renderEntries();
    }
  }

  isOpen(): boolean {
    return !this.#root.hidden;
  }

  show(): void {
    this.#root.hidden = false;
    document.body.classList.add("material-storage-open");
    this.#renderShell();
    this.#renderEntries();
    this.#onOpenChange(true);
    this.#root.focus({ preventScroll: true });
  }

  hide(): void {
    this.#root.hidden = true;
    this.#root.replaceChildren();
    document.body.classList.remove("material-storage-open");
    this.#listRoot = null;
    this.#summaryRoot = null;
    this.#tagSelect = null;
    this.#onOpenChange(false);
  }

  refresh(): void {
    if (this.isOpen()) {
      this.#renderEntries();
    }
  }

  #renderShell(): void {
    const card = document.createElement("section");
    const header = document.createElement("header");
    const titleGroup = document.createElement("div");
    const title = document.createElement("h2");
    const subtitle = document.createElement("p");
    const closeButton = document.createElement("button");
    const controls = document.createElement("div");
    const sortSelect = document.createElement("select");
    const tagSelect = document.createElement("select");
    const summary = document.createElement("p");
    const list = document.createElement("div");

    card.className = "material-storage-card";
    title.textContent = "Material Storage";
    subtitle.textContent = "Generated material reserves";
    closeButton.type = "button";
    closeButton.className = "material-storage-close";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", () => this.hide());
    titleGroup.append(title, subtitle);
    header.append(titleGroup, closeButton);

    controls.className = "material-storage-controls";
    for (const [value, label] of [
      ["name", "Name"],
      ["generation", "Generation"],
      ["rarity", "Rarity"],
      ["quantity", "Quantity"],
      ["tag", "Tag"],
    ] as const satisfies readonly (readonly [MaterialStorageSort, string])[]) {
      const option = document.createElement("option");

      option.value = value;
      option.textContent = label;
      sortSelect.append(option);
    }
    sortSelect.value = this.#sort;
    sortSelect.addEventListener("change", () => {
      this.#sort = sortSelect.value as MaterialStorageSort;
      this.#renderEntries();
    });
    tagSelect.addEventListener("change", () => {
      this.#tag = tagSelect.value;
      this.#renderEntries();
    });
    controls.append(
      createControlLabel("Sort", sortSelect),
      createControlLabel("Tag", tagSelect),
    );

    summary.className = "material-storage-summary";
    list.className = "material-storage-list";
    card.append(header, controls, summary, list);
    this.#root.replaceChildren(card);
    this.#root.removeEventListener("keydown", this.#handleKeyDown);
    this.#root.addEventListener("keydown", this.#handleKeyDown);
    this.#summaryRoot = summary;
    this.#listRoot = list;
    this.#tagSelect = tagSelect;
    this.#renderTagOptions();
  }

  readonly #handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.hide();
    }
  };

  #renderTagOptions(): void {
    if (!this.#tagSelect) {
      return;
    }

    const options = [document.createElement("option")];
    const session = this.#session;

    options[0]!.value = "";
    options[0]!.textContent = "All tags";
    if (session) {
      for (const tag of materialStorageTags(
        session.storage,
        session.registry,
      )) {
        const option = document.createElement("option");

        option.value = tag;
        option.textContent = tag;
        options.push(option);
      }
    }

    this.#tagSelect.replaceChildren(...options);
    this.#tagSelect.value = this.#tag;
  }

  #renderEntries(): void {
    const session = this.#session;

    if (!this.#listRoot || !this.#summaryRoot) {
      return;
    }

    if (!session) {
      this.#summaryRoot.textContent = "No active world.";
      this.#listRoot.replaceChildren(
        this.#emptyMessage("Enter a world first."),
      );
      return;
    }

    this.#renderTagOptions();
    const entries = materialStorageEntries(session.storage, session.registry, {
      sort: this.#sort,
      tag: this.#tag,
    });
    const total = entries.reduce((sum, entry) => sum + entry.quantity, 0);

    this.#summaryRoot.textContent = `${entries.length.toLocaleString()} materials · ${total.toLocaleString()} stored items`;
    this.#listRoot.replaceChildren(
      ...(entries.length > 0
        ? entries.map((entry) => this.#createEntry(entry))
        : [this.#emptyMessage("No stored materials match that filter.")]),
    );
  }

  #createEntry(
    entry: ReturnType<typeof materialStorageEntries>[number],
  ): HTMLElement {
    const row = document.createElement("article");
    const details = document.createElement("div");
    const title = document.createElement("strong");
    const meta = document.createElement("small");
    const quantity = document.createElement("span");
    const material = entry.material;

    row.className = "material-storage-row";
    title.textContent = material?.name ?? "Unknown Material";
    meta.textContent = material
      ? `gen ${material.generation} · ${material.rarity} · ${
          material.tags.join(" · ") || "untagged"
        }`
      : entry.materialId;
    quantity.textContent = `x${entry.quantity.toLocaleString()}`;
    details.append(title, meta);
    row.append(details, quantity);
    return row;
  }

  #emptyMessage(message: string): HTMLElement {
    const empty = document.createElement("p");

    empty.className = "material-storage-empty";
    empty.textContent = message;
    return empty;
  }
}
