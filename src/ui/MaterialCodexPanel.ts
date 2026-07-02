import type { MaterialRegistry } from "../materials/MaterialRegistry.ts";
import type {
  MaterialDefinition,
  MaterialRarity,
} from "../materials/MaterialTypes.ts";
import {
  MaterialStatsView,
  type MaterialRecipeLine,
  type MaterialStatsViewModel,
} from "./MaterialStatsView.ts";

export type MaterialCodexSort =
  | "name"
  | "generation"
  | "generation-asc"
  | "generation-desc"
  | "rarity"
  | "stability"
  | "hardness"
  | "magic"
  | "toxicity"
  | "radioactivity";

const RARITY_RANK: Record<MaterialRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
};

export function topMaterialTags(
  material: Pick<MaterialDefinition, "tags">,
  count = 3,
): readonly string[] {
  return material.tags.slice(0, Math.max(0, count));
}

export function discoveredMaterialsForCodex(
  registry: MaterialRegistry,
  query = "",
  tag = "",
  sort: MaterialCodexSort = "name",
): readonly MaterialDefinition[] {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedTag = tag.trim().toLowerCase();
  const materials = registry
    .allDiscoveredMaterials()
    .filter((material) =>
      normalizedQuery === ""
        ? true
        : material.name.toLowerCase().includes(normalizedQuery) ||
          material.id.toLowerCase().includes(normalizedQuery),
    )
    .filter((material) =>
      normalizedTag === ""
        ? true
        : material.tags.some(
            (materialTag) => materialTag.toLowerCase() === normalizedTag,
          ),
    );

  return [...materials].sort((a, b) => compareMaterials(a, b, sort));
}

export function materialCodexTags(
  registry: MaterialRegistry,
): readonly string[] {
  return [
    ...new Set(
      registry
        .allDiscoveredMaterials()
        .flatMap((material) => material.tags.map((tag) => tag.toLowerCase())),
    ),
  ].sort();
}

export function materialStatsViewModel(
  material: MaterialDefinition,
  registry: MaterialRegistry,
): MaterialStatsViewModel {
  return {
    material,
    parentNames: material.parents.map((parentId) =>
      materialDisplayName(parentId, registry),
    ),
    childResults: childRecipeLines(material, registry),
  };
}

function compareMaterials(
  a: MaterialDefinition,
  b: MaterialDefinition,
  sort: MaterialCodexSort,
): number {
  if (sort === "generation-asc") {
    return a.generation - b.generation || a.name.localeCompare(b.name);
  }
  if (sort === "generation" || sort === "generation-desc") {
    return b.generation - a.generation || a.name.localeCompare(b.name);
  }
  if (sort === "rarity") {
    return (
      RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] ||
      a.name.localeCompare(b.name)
    );
  }
  if (sort === "stability") {
    return b.stability - a.stability || a.name.localeCompare(b.name);
  }
  if (sort === "hardness") {
    return b.hardness - a.hardness || a.name.localeCompare(b.name);
  }
  if (sort === "magic") {
    return b.magic - a.magic || a.name.localeCompare(b.name);
  }
  if (sort === "toxicity") {
    return b.toxicity - a.toxicity || a.name.localeCompare(b.name);
  }
  if (sort === "radioactivity") {
    return b.radioactivity - a.radioactivity || a.name.localeCompare(b.name);
  }

  return a.name.localeCompare(b.name);
}

function materialDisplayName(
  materialId: string,
  registry: MaterialRegistry,
): string {
  return registry.getMaterialById(materialId)?.name ?? materialId;
}

function childRecipeLines(
  material: MaterialDefinition,
  registry: MaterialRegistry,
): readonly MaterialRecipeLine[] {
  return registry
    .allDiscoveredMaterials()
    .filter((candidate) => candidate.parents.includes(material.id))
    .sort((a, b) => a.generation - b.generation || a.name.localeCompare(b.name))
    .map((child) => ({
      materialId: child.id,
      label: `${child.parents
        .map((parentId) => materialDisplayName(parentId, registry))
        .join(" + ")} → ${child.name}`,
    }));
}

function createControlLabel(text: string, control: HTMLElement): HTMLElement {
  const label = document.createElement("label");
  const span = document.createElement("span");

  span.textContent = text;
  label.append(span, control);
  return label;
}

export class MaterialCodexPanel {
  readonly #root: HTMLElement;
  readonly #statsView = new MaterialStatsView();
  readonly #onOpenChange: (isOpen: boolean) => void;

  #registry: MaterialRegistry | null = null;
  #query = "";
  #tag = "";
  #sort: MaterialCodexSort = "name";
  #selectedMaterialId: string | null = null;
  #listRoot: HTMLElement | null = null;
  #detailsRoot: HTMLElement | null = null;
  #countRoot: HTMLElement | null = null;
  #searchInput: HTMLInputElement | null = null;
  #tagSelect: HTMLSelectElement | null = null;

  constructor(
    root: HTMLElement,
    registry: MaterialRegistry | null = null,
    onOpenChange: (isOpen: boolean) => void = () => {},
  ) {
    this.#root = root;
    this.#registry = registry;
    this.#onOpenChange = onOpenChange;
    this.#root.className = "material-codex-panel";
    this.#root.setAttribute("role", "dialog");
    this.#root.setAttribute("aria-label", "Material Codex");
    this.#root.tabIndex = -1;
    this.hide();
  }

  setRegistry(registry: MaterialRegistry | null): void {
    this.#registry = registry;
    this.#selectedMaterialId = null;

    if (this.isOpen()) {
      this.#renderShell();
      this.#renderMaterials();
    }
  }

  isOpen(): boolean {
    return !this.#root.hidden;
  }

  show(): void {
    this.#root.hidden = false;
    document.body.classList.add("material-codex-open");
    this.#renderShell();
    this.#renderMaterials();
    this.#onOpenChange(true);
    this.#searchInput?.focus({ preventScroll: true });
  }

  hide(): void {
    this.#root.hidden = true;
    this.#root.replaceChildren();
    document.body.classList.remove("material-codex-open");
    this.#listRoot = null;
    this.#detailsRoot = null;
    this.#countRoot = null;
    this.#searchInput = null;
    this.#tagSelect = null;
    this.#onOpenChange(false);
  }

  toggle(): void {
    if (this.isOpen()) {
      this.hide();
    } else {
      this.show();
    }
  }

  refresh(): void {
    if (this.isOpen()) {
      this.#renderMaterials();
    }
  }

  #renderShell(): void {
    const panel = document.createElement("section");
    const header = document.createElement("header");
    const title = document.createElement("div");
    const heading = document.createElement("h2");
    const hint = document.createElement("p");
    const closeButton = document.createElement("button");
    const controls = document.createElement("div");
    const searchInput = document.createElement("input");
    const tagSelect = document.createElement("select");
    const sortSelect = document.createElement("select");
    const body = document.createElement("div");
    const listColumn = document.createElement("section");
    const count = document.createElement("p");
    const list = document.createElement("div");
    const details = document.createElement("section");

    panel.className = "material-codex-card";
    heading.textContent = "Material Codex";
    hint.textContent = "M to close · search, filter, and inspect discoveries";
    title.append(heading, hint);
    closeButton.type = "button";
    closeButton.className = "material-codex-close";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", () => this.hide());
    header.append(title, closeButton);

    controls.className = "material-codex-controls";
    searchInput.type = "search";
    searchInput.placeholder = "Search by name or id";
    searchInput.value = this.#query;
    searchInput.addEventListener("input", () => {
      this.#query = searchInput.value;
      this.#renderMaterials();
    });
    tagSelect.addEventListener("change", () => {
      this.#tag = tagSelect.value;
      this.#renderMaterials();
    });
    sortSelect.append(
      this.#sortOption("name", "Name"),
      this.#sortOption("generation", "Generation"),
      this.#sortOption("rarity", "Rarity"),
      this.#sortOption("stability", "Stability"),
      this.#sortOption("hardness", "Hardness"),
      this.#sortOption("magic", "Magic"),
      this.#sortOption("toxicity", "Toxicity"),
      this.#sortOption("radioactivity", "Radioactivity"),
    );
    sortSelect.value = this.#sort;
    sortSelect.addEventListener("change", () => {
      this.#sort = sortSelect.value as MaterialCodexSort;
      this.#renderMaterials();
    });
    controls.append(
      createControlLabel("Search", searchInput),
      createControlLabel("Tag", tagSelect),
      createControlLabel("Sort", sortSelect),
    );

    body.className = "material-codex-body";
    listColumn.className = "material-codex-list-column";
    count.className = "material-codex-count";
    list.className = "material-codex-list";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Discovered materials");
    details.className = "material-codex-details";
    listColumn.append(count, list);
    body.append(listColumn, details);
    panel.append(header, controls, body);

    this.#root.replaceChildren(panel);
    this.#root.removeEventListener("keydown", this.#handleKeyDown);
    this.#root.addEventListener("keydown", this.#handleKeyDown);
    this.#listRoot = list;
    this.#detailsRoot = details;
    this.#countRoot = count;
    this.#searchInput = searchInput;
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

  #sortOption(value: MaterialCodexSort, label: string): HTMLOptionElement {
    const option = document.createElement("option");

    option.value = value;
    option.textContent = label;
    return option;
  }

  #renderTagOptions(): void {
    if (!this.#tagSelect) {
      return;
    }

    const registry = this.#registry;
    const options = [document.createElement("option")];

    options[0]!.value = "";
    options[0]!.textContent = "All tags";
    if (registry) {
      for (const tag of materialCodexTags(registry)) {
        const option = document.createElement("option");

        option.value = tag;
        option.textContent = tag;
        options.push(option);
      }
    }

    this.#tagSelect.replaceChildren(...options);
    this.#tagSelect.value = this.#tag;
  }

  #renderMaterials(): void {
    const registry = this.#registry;

    if (!this.#listRoot || !this.#detailsRoot || !this.#countRoot) {
      return;
    }

    if (!registry) {
      this.#countRoot.textContent = "No active world.";
      this.#listRoot.replaceChildren(
        this.#emptyMessage("Enter a world first."),
      );
      this.#detailsRoot.replaceChildren(
        this.#emptyMessage("Material discoveries are stored per world."),
      );
      return;
    }

    this.#renderTagOptions();

    const materials = discoveredMaterialsForCodex(
      registry,
      this.#query,
      this.#tag,
      this.#sort,
    );

    if (
      this.#selectedMaterialId === null ||
      !materials.some((material) => material.id === this.#selectedMaterialId)
    ) {
      this.#selectedMaterialId = materials[0]?.id ?? null;
    }

    this.#countRoot.textContent = `${materials.length.toLocaleString()} discovered materials`;
    this.#listRoot.replaceChildren(
      ...(materials.length > 0
        ? materials.map((material) => this.#createMaterialRow(material))
        : [this.#emptyMessage("No materials match that search.")]),
    );
    this.#renderDetails();
  }

  #renderDetails(): void {
    const registry = this.#registry;
    const detailsRoot = this.#detailsRoot;
    const material = this.#selectedMaterialId
      ? registry?.getMaterialById(this.#selectedMaterialId)
      : null;

    if (!detailsRoot) {
      return;
    }

    if (!registry || !material) {
      detailsRoot.replaceChildren(
        this.#emptyMessage("Select a material to inspect it."),
      );
      return;
    }

    detailsRoot.replaceChildren(
      this.#statsView.render(materialStatsViewModel(material, registry)),
    );
  }

  #createMaterialRow(material: MaterialDefinition): HTMLButtonElement {
    const row = document.createElement("button");
    const main = document.createElement("span");
    const name = document.createElement("strong");
    const meta = document.createElement("small");
    const tags = document.createElement("span");

    row.type = "button";
    row.className = "material-codex-row";
    row.classList.toggle("selected", material.id === this.#selectedMaterialId);
    row.setAttribute("role", "option");
    row.setAttribute(
      "aria-selected",
      String(material.id === this.#selectedMaterialId),
    );
    name.textContent = material.name;
    meta.textContent = `gen ${material.generation} · ${material.rarity} · stability ${Math.round(
      material.stability,
    )}`;
    main.append(name, meta);
    tags.className = "material-codex-tags";
    tags.textContent = topMaterialTags(material).join(" · ") || "untagged";
    row.append(main, tags);
    row.addEventListener("click", () => {
      this.#selectedMaterialId = material.id;
      this.#renderMaterials();
    });
    return row;
  }

  #emptyMessage(message: string): HTMLElement {
    const empty = document.createElement("p");

    empty.className = "material-codex-empty";
    empty.textContent = message;
    return empty;
  }
}
