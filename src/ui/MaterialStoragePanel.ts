import type { MaterialRegistry } from "../materials/MaterialRegistry.ts";
import {
  materialBlockTintCssForVisuals,
  materialVisualsForMaterial,
  UNKNOWN_MATERIAL_VISUALS,
} from "../materials/MaterialVisuals.ts";
import type { MaterialRarity } from "../materials/MaterialTypes.ts";
import {
  materialMatchesStorageFilters,
  materialStorageEntries,
  materialStorageTags,
  type MaterialStorage,
  type MaterialStorageFilters,
  type MaterialStorageGenerationFilter,
  type MaterialStorageHazardFilter,
  type MaterialStorageSort,
  type MaterialStorageStabilityFilter,
} from "../game/MaterialStorage.ts";
import type {
  GeneratedMaterialStorageFilter,
  Inventory,
} from "../game/Inventory.ts";

export type MaterialStoragePanelSession = Readonly<{
  storage: MaterialStorage;
  registry: MaterialRegistry;
  inventory?: Pick<
    Inventory,
    "storeGeneratedMaterialItems" | "withdrawStoredMaterial"
  >;
  onSaveRequested?: () => void;
}>;

const RARITY_OPTIONS = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
] as const satisfies readonly MaterialRarity[];

const GENERATION_FILTER_OPTIONS = [
  ["all", "All generations"],
  ["base", "Base"],
  ["generated", "Generated"],
  ["gen1", "Gen 1"],
  ["gen2", "Gen 2"],
  ["gen3plus", "Gen 3+"],
] as const satisfies readonly (readonly [
  MaterialStorageGenerationFilter,
  string,
])[];

const STABILITY_FILTER_OPTIONS = [
  ["all", "Stable + unstable"],
  ["stable", "Stable"],
  ["unstable", "Unstable"],
] as const satisfies readonly (readonly [
  MaterialStorageStabilityFilter,
  string,
])[];

const HAZARD_FILTER_OPTIONS = [
  ["all", "All hazards"],
  ["toxic", "Toxic"],
  ["radioactive", "Radioactive"],
  ["hot", "Hot"],
] as const satisfies readonly (readonly [
  MaterialStorageHazardFilter,
  string,
])[];

const SORT_OPTIONS = [
  ["name", "Name"],
  ["count", "Count"],
  ["generation", "Generation"],
  ["rarity", "Rarity"],
  ["stability", "Stability"],
  ["danger", "Danger"],
  ["usefulness", "Usefulness"],
] as const satisfies readonly (readonly [MaterialStorageSort, string])[];

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
  #query = "";
  #generation: MaterialStorageGenerationFilter = "all";
  #rarity: MaterialRarity | "" = "";
  #tag = "";
  #stability: MaterialStorageStabilityFilter = "all";
  #hazard: MaterialStorageHazardFilter = "all";
  #selectedMaterialId: string | null = null;
  #message = "";
  #listRoot: HTMLElement | null = null;
  #summaryRoot: HTMLElement | null = null;
  #tagSelect: HTMLSelectElement | null = null;
  #actionsRoot: HTMLElement | null = null;

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
    this.#actionsRoot = null;
    this.#message = "";
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
    const searchInput = document.createElement("input");
    const sortSelect = document.createElement("select");
    const generationSelect = document.createElement("select");
    const raritySelect = document.createElement("select");
    const tagSelect = document.createElement("select");
    const stabilitySelect = document.createElement("select");
    const hazardSelect = document.createElement("select");
    const actions = document.createElement("div");
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
    searchInput.type = "search";
    searchInput.placeholder = "Search name or id";
    searchInput.value = this.#query;
    searchInput.addEventListener("input", () => {
      this.#query = searchInput.value;
      this.#selectedMaterialId = null;
      this.#renderEntries();
    });
    for (const [value, label] of SORT_OPTIONS) {
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
    for (const [value, label] of GENERATION_FILTER_OPTIONS) {
      const option = document.createElement("option");

      option.value = value;
      option.textContent = label;
      generationSelect.append(option);
    }
    generationSelect.value = this.#generation;
    generationSelect.addEventListener("change", () => {
      this.#generation =
        generationSelect.value as MaterialStorageGenerationFilter;
      this.#selectedMaterialId = null;
      this.#renderEntries();
    });
    raritySelect.append(this.#option("", "All rarities"));
    for (const rarity of RARITY_OPTIONS) {
      raritySelect.append(this.#option(rarity, rarity));
    }
    raritySelect.value = this.#rarity;
    raritySelect.addEventListener("change", () => {
      this.#rarity = raritySelect.value as MaterialRarity | "";
      this.#selectedMaterialId = null;
      this.#renderEntries();
    });
    tagSelect.addEventListener("change", () => {
      this.#tag = tagSelect.value;
      this.#selectedMaterialId = null;
      this.#renderEntries();
    });
    for (const [value, label] of STABILITY_FILTER_OPTIONS) {
      stabilitySelect.append(this.#option(value, label));
    }
    stabilitySelect.value = this.#stability;
    stabilitySelect.addEventListener("change", () => {
      this.#stability = stabilitySelect.value as MaterialStorageStabilityFilter;
      this.#selectedMaterialId = null;
      this.#renderEntries();
    });
    for (const [value, label] of HAZARD_FILTER_OPTIONS) {
      hazardSelect.append(this.#option(value, label));
    }
    hazardSelect.value = this.#hazard;
    hazardSelect.addEventListener("change", () => {
      this.#hazard = hazardSelect.value as MaterialStorageHazardFilter;
      this.#selectedMaterialId = null;
      this.#renderEntries();
    });
    controls.append(
      createControlLabel("Search", searchInput),
      createControlLabel("Sort", sortSelect),
      createControlLabel("Generation", generationSelect),
      createControlLabel("Rarity", raritySelect),
      createControlLabel("Tag", tagSelect),
      createControlLabel("Condition", stabilitySelect),
      createControlLabel("Hazard", hazardSelect),
    );

    actions.className = "material-storage-actions";
    summary.className = "material-storage-summary";
    list.className = "material-storage-list";
    card.append(header, controls, actions, summary, list);
    this.#root.replaceChildren(card);
    this.#root.removeEventListener("keydown", this.#handleKeyDown);
    this.#root.addEventListener("keydown", this.#handleKeyDown);
    this.#summaryRoot = summary;
    this.#listRoot = list;
    this.#tagSelect = tagSelect;
    this.#actionsRoot = actions;
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

    if (!this.#listRoot || !this.#summaryRoot || !this.#actionsRoot) {
      return;
    }

    if (!session) {
      this.#summaryRoot.textContent = "No active world.";
      this.#actionsRoot.replaceChildren();
      this.#listRoot.replaceChildren(
        this.#emptyMessage("Enter a world first."),
      );
      return;
    }

    this.#renderTagOptions();
    const entries = materialStorageEntries(session.storage, session.registry, {
      sort: this.#sort,
      ...this.#filters(),
    });
    const total = entries.reduce((sum, entry) => sum + entry.quantity, 0);

    if (
      this.#selectedMaterialId &&
      !entries.some((entry) => entry.materialId === this.#selectedMaterialId)
    ) {
      this.#selectedMaterialId = null;
    }

    this.#summaryRoot.textContent = `${entries.length.toLocaleString()} materials · ${total.toLocaleString()} stored items${
      this.#message ? ` · ${this.#message}` : ""
    }`;
    this.#actionsRoot.replaceChildren(...this.#createActionButtons(entries));
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
    const swatch = document.createElement("span");
    const details = document.createElement("div");
    const title = document.createElement("strong");
    const meta = document.createElement("small");
    const quantity = document.createElement("span");
    const material = entry.material;
    const visuals = material
      ? materialVisualsForMaterial(material)
      : UNKNOWN_MATERIAL_VISUALS;
    const topTags = material?.tags.slice(0, 3) ?? [];

    row.className = "material-storage-row";
    row.classList.toggle(
      "selected",
      entry.materialId === this.#selectedMaterialId,
    );
    row.tabIndex = 0;
    row.title = material?.name ?? entry.materialId;
    row.addEventListener("click", () => {
      this.#selectedMaterialId = entry.materialId;
      this.#message = "";
      this.#renderEntries();
    });
    row.addEventListener("keydown", (event) => {
      if (event.code === "Enter" || event.code === "Space") {
        event.preventDefault();
        this.#selectedMaterialId = entry.materialId;
        this.#message = "";
        this.#renderEntries();
      }
    });
    swatch.className = "material-storage-swatch";
    swatch.style.setProperty(
      "--material-storage-color",
      materialBlockTintCssForVisuals(visuals),
    );
    swatch.style.setProperty("--material-storage-accent", visuals.accentColor);
    title.textContent = material?.name ?? "Unknown Material";
    meta.textContent = material
      ? `gen ${material.generation} · ${material.rarity} · stable ${Math.round(
          material.stability,
        )} · ${topTags.join(" · ") || "untagged"}`
      : entry.materialId;
    quantity.className = "material-storage-quantity";
    quantity.textContent = `x${entry.quantity.toLocaleString()}`;
    details.append(title, meta);
    row.append(swatch, details, quantity);
    return row;
  }

  #createActionButtons(
    entries: readonly ReturnType<typeof materialStorageEntries>[number][],
  ): readonly HTMLButtonElement[] {
    const selectedEntry =
      entries.find((entry) => entry.materialId === this.#selectedMaterialId) ??
      null;

    return [
      this.#actionButton(
        "Move Selected to Inventory",
        () => {
          if (!this.#session?.inventory || !selectedEntry) {
            return;
          }

          const moved = this.#session.inventory.withdrawStoredMaterial(
            selectedEntry.materialId,
            Math.min(64, selectedEntry.quantity),
          );

          this.#message =
            moved > 0
              ? `Moved ${moved.toLocaleString()} to inventory`
              : "No inventory space";
          if (moved > 0) {
            this.#session.onSaveRequested?.();
          }
          this.#renderEntries();
        },
        !this.#session?.inventory || !selectedEntry,
      ),
      this.#actionButton(
        "Store All Generated",
        () => {
          const moved =
            this.#session?.inventory?.storeGeneratedMaterialItems() ?? 0;

          this.#message =
            moved > 0
              ? `Stored ${moved.toLocaleString()} generated items`
              : "No generated material items found";
          if (moved > 0) {
            this.#session?.onSaveRequested?.();
          }
          this.#renderEntries();
        },
        !this.#session?.inventory,
      ),
      this.#actionButton(
        "Store Matching Filter",
        () => {
          const filter = this.#inventoryFilter();
          const moved =
            this.#session?.inventory?.storeGeneratedMaterialItems(filter) ?? 0;

          this.#message =
            moved > 0
              ? `Stored ${moved.toLocaleString()} matching items`
              : "No matching generated material items found";
          if (moved > 0) {
            this.#session?.onSaveRequested?.();
          }
          this.#renderEntries();
        },
        !this.#session?.inventory,
      ),
    ];
  }

  #actionButton(
    label: string,
    onClick: () => void,
    disabled = false,
  ): HTMLButtonElement {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = label;
    button.title = label;
    button.disabled = disabled;
    button.addEventListener("click", onClick);
    return button;
  }

  #filters(): MaterialStorageFilters {
    return {
      query: this.#query,
      generation: this.#generation,
      rarity: this.#rarity,
      tag: this.#tag,
      stability: this.#stability,
      hazard: this.#hazard,
    };
  }

  #inventoryFilter(): GeneratedMaterialStorageFilter {
    const filters = this.#filters();

    return (materialId, material) =>
      materialMatchesStorageFilters(materialId, material, filters);
  }

  #option(value: string, label: string): HTMLOptionElement {
    const option = document.createElement("option");

    option.value = value;
    option.textContent = label;
    return option;
  }

  #emptyMessage(message: string): HTMLElement {
    const empty = document.createElement("p");

    empty.className = "material-storage-empty";
    empty.textContent = message;
    return empty;
  }
}
