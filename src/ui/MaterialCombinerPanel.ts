import {
  MaterialDiscoveryController,
  type MaterialDiscoveryInventory,
  type MaterialDiscoveryOption,
} from "../game/MaterialDiscoveryController.ts";
import type { MaterialWorldController } from "../game/MaterialWorldController.ts";
import {
  isMaterialProcessingStationType,
  materialStationDefinition,
  MATERIAL_PROCESSING_STATION_TYPES,
} from "../materials/MaterialStations.ts";
import type {
  MaterialDefinition,
  MaterialProcessingStationType,
} from "../materials/MaterialTypes.ts";
import { MATERIAL_RESEARCH_TIER_DISPLAY_NAMES } from "../materials/MaterialResearch.ts";
import {
  MaterialStatsView,
  type MaterialRecipeLine,
  type MaterialStatsViewModel,
} from "./MaterialStatsView.ts";

export type MaterialCombinerPanelSession = Readonly<{
  materialWorld: MaterialWorldController;
  inventory: MaterialDiscoveryInventory;
  onMaterialDiscovered?: () => void;
  onSaveRequested?: () => void;
}>;

export type MaterialCombinerStationOption = Readonly<{
  stationType: MaterialProcessingStationType;
  label: string;
  disabled: boolean;
}>;

type PanelMessage = Readonly<{
  tone: "success" | "warning" | "neutral";
  text: string;
}>;

export function materialOptionsForCombiner(
  controller: MaterialDiscoveryController,
): readonly MaterialDiscoveryOption[] {
  return controller.listDiscoveredMaterialItems();
}

export function materialCombinerKnownResultLabel(
  material: MaterialDefinition | null,
): string {
  return material ? `Known result: ${material.name}` : "Undiscovered Reaction";
}

export function materialCombinerStationOptions(
  selectedStation: MaterialProcessingStationType = "combiner",
  lockedToStation = false,
): readonly MaterialCombinerStationOption[] {
  return MATERIAL_PROCESSING_STATION_TYPES.map((stationType) => {
    const station = materialStationDefinition(stationType);
    const available = lockedToStation
      ? stationType === selectedStation
      : stationType === "combiner";

    return {
      stationType,
      label: available
        ? station.displayName
        : `${station.displayName} (locked)`,
      disabled: !available,
    };
  });
}

function countLabel(count: number): string {
  return count === Number.POSITIVE_INFINITY ? "∞" : String(count);
}

function createControlLabel(text: string, control: HTMLElement): HTMLElement {
  const label = document.createElement("label");
  const span = document.createElement("span");

  span.textContent = text;
  label.append(span, control);
  return label;
}

function materialDisplayName(
  materialWorld: MaterialWorldController,
  materialId: string,
): string {
  return materialWorld.getMaterialById(materialId)?.name ?? materialId;
}

function childRecipeLines(
  materialWorld: MaterialWorldController,
  material: MaterialDefinition,
): readonly MaterialRecipeLine[] {
  return materialWorld
    .serialize()
    .recipeResults.filter((recipe) =>
      [recipe.parentAId, recipe.parentBId].includes(material.id),
    )
    .map((recipe) => {
      const result = materialWorld.getMaterialById(recipe.resultMaterialId);

      return {
        materialId: recipe.resultMaterialId,
        label: `${materialDisplayName(
          materialWorld,
          recipe.parentAId,
        )} + ${materialDisplayName(materialWorld, recipe.parentBId)} → ${
          result?.name ?? recipe.resultMaterialId
        }`,
      };
    });
}

function materialStatsViewModel(
  materialWorld: MaterialWorldController,
  material: MaterialDefinition,
): MaterialStatsViewModel {
  return {
    material,
    parentNames: material.parents.map((parentId) =>
      materialDisplayName(materialWorld, parentId),
    ),
    childResults: childRecipeLines(materialWorld, material),
  };
}

export class MaterialCombinerPanel {
  readonly #root: HTMLElement;
  readonly #statsView = new MaterialStatsView();
  readonly #onOpenChange: (isOpen: boolean) => void;

  #session: MaterialCombinerPanelSession | null = null;
  #controller: MaterialDiscoveryController | null = null;
  #materialASelect: HTMLSelectElement | null = null;
  #materialBSelect: HTMLSelectElement | null = null;
  #stationSelect: HTMLSelectElement | null = null;
  #previewRoot: HTMLElement | null = null;
  #messageRoot: HTMLElement | null = null;
  #combineButton: HTMLButtonElement | null = null;
  #selectedMaterialAId: string | null = null;
  #selectedMaterialBId: string | null = null;
  #selectedStation: MaterialProcessingStationType = "combiner";
  #stationLocked = false;
  #message: PanelMessage | null = null;

  constructor(
    root: HTMLElement,
    session: MaterialCombinerPanelSession | null = null,
    onOpenChange: (isOpen: boolean) => void = () => {},
  ) {
    this.#root = root;
    this.#onOpenChange = onOpenChange;
    this.#root.className = "material-combiner-panel";
    this.#root.setAttribute("role", "dialog");
    this.#root.setAttribute("aria-label", "Material Combiner");
    this.#root.tabIndex = -1;
    this.setSession(session);
    this.hide();
  }

  setSession(session: MaterialCombinerPanelSession | null): void {
    this.#session = session;
    this.#controller = session
      ? new MaterialDiscoveryController(session)
      : null;
    this.#selectedMaterialAId = null;
    this.#selectedMaterialBId = null;
    this.#selectedStation = "combiner";
    this.#stationLocked = false;
    this.#message = null;

    if (this.isOpen()) {
      this.#renderShell();
    }
  }

  isOpen(): boolean {
    return !this.#root.hidden;
  }

  show(
    stationType: MaterialProcessingStationType = "combiner",
    lockedToStation = false,
  ): void {
    this.#selectedStation = stationType;
    this.#stationLocked = lockedToStation;
    this.#root.hidden = false;
    document.body.classList.add("material-combiner-open");
    this.#renderShell();
    this.#onOpenChange(true);
    this.#materialASelect?.focus({ preventScroll: true });
  }

  hide(): void {
    this.#root.hidden = true;
    this.#root.replaceChildren();
    document.body.classList.remove("material-combiner-open");
    this.#materialASelect = null;
    this.#materialBSelect = null;
    this.#stationSelect = null;
    this.#previewRoot = null;
    this.#messageRoot = null;
    this.#combineButton = null;
    this.#stationLocked = false;
    this.#message = null;
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
      this.#renderShell();
    }
  }

  #renderShell(): void {
    const card = document.createElement("section");
    const header = document.createElement("header");
    const titleGroup = document.createElement("div");
    const title = document.createElement("h2");
    const subtitle = document.createElement("p");
    const closeButton = document.createElement("button");
    const controls = document.createElement("section");
    const body = document.createElement("section");
    const actionRow = document.createElement("section");

    card.className = "material-combiner-card";
    title.textContent = "Material Combiner";
    subtitle.textContent = "Procedural material station";
    closeButton.type = "button";
    closeButton.className = "material-combiner-close";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", () => this.hide());
    titleGroup.append(title, subtitle);
    header.append(titleGroup, closeButton);

    controls.className = "material-combiner-controls";
    this.#materialASelect = document.createElement("select");
    this.#materialBSelect = document.createElement("select");
    this.#stationSelect = document.createElement("select");
    this.#materialASelect.addEventListener("change", () => {
      this.#selectedMaterialAId = this.#materialASelect?.value ?? null;
      this.#message = null;
      this.#renderPreview();
    });
    this.#materialBSelect.addEventListener("change", () => {
      this.#selectedMaterialBId = this.#materialBSelect?.value ?? null;
      this.#message = null;
      this.#renderPreview();
    });
    this.#stationSelect.addEventListener("change", () => {
      if (this.#stationLocked) {
        this.#stationSelect!.value = this.#selectedStation;
        return;
      }

      const value = this.#stationSelect?.value;

      this.#selectedStation = isMaterialProcessingStationType(value)
        ? value
        : "combiner";
      this.#message = null;
      this.#renderPreview();
    });
    controls.append(
      createControlLabel("Material A", this.#materialASelect),
      createControlLabel("Material B", this.#materialBSelect),
      createControlLabel("Station", this.#stationSelect),
    );

    body.className = "material-combiner-body";
    this.#previewRoot = document.createElement("section");
    this.#previewRoot.className = "material-combiner-preview";
    body.append(this.#previewRoot);

    actionRow.className = "material-combiner-actions";
    this.#messageRoot = document.createElement("p");
    this.#messageRoot.className = "material-combiner-message";
    this.#combineButton = document.createElement("button");
    this.#combineButton.type = "button";
    this.#combineButton.textContent = "Combine";
    this.#combineButton.addEventListener("click", () =>
      this.#combineSelected(),
    );
    actionRow.append(this.#messageRoot, this.#combineButton);

    card.append(header, controls, body, actionRow);
    this.#root.replaceChildren(card);
    this.#renderMaterialOptions();
    this.#renderStationOptions();
    this.#renderPreview();
  }

  #renderMaterialOptions(): void {
    if (!this.#materialASelect || !this.#materialBSelect) {
      return;
    }

    const controller = this.#controller;
    const options = controller ? materialOptionsForCombiner(controller) : [];
    const first = options[0]?.material.id ?? null;
    const second = options[1]?.material.id ?? first;
    const selectedA = options.some(
      (option) => option.material.id === this.#selectedMaterialAId,
    )
      ? this.#selectedMaterialAId
      : first;
    const selectedB = options.some(
      (option) => option.material.id === this.#selectedMaterialBId,
    )
      ? this.#selectedMaterialBId
      : second;

    this.#selectedMaterialAId = selectedA;
    this.#selectedMaterialBId = selectedB;

    for (const select of [this.#materialASelect, this.#materialBSelect]) {
      select.replaceChildren(
        ...options.map((option) => {
          const item = document.createElement("option");

          item.value = option.material.id;
          item.textContent = `${option.material.name} · ${countLabel(
            option.count,
          )}`;
          return item;
        }),
      );
      select.disabled = options.length === 0;
    }

    this.#materialASelect.value = selectedA ?? "";
    this.#materialBSelect.value = selectedB ?? "";
  }

  #renderStationOptions(): void {
    if (!this.#stationSelect) {
      return;
    }

    this.#stationSelect.replaceChildren(
      ...materialCombinerStationOptions(
        this.#selectedStation,
        this.#stationLocked,
      ).map((stationOption) => {
        const item = document.createElement("option");

        item.value = stationOption.stationType;
        item.textContent = stationOption.label;
        item.disabled = stationOption.disabled;
        return item;
      }),
    );
    this.#stationSelect.value = this.#selectedStation;
    this.#stationSelect.disabled = this.#stationLocked;
  }

  #renderPreview(): void {
    const session = this.#session;
    const controller = this.#controller;

    if (!this.#previewRoot || !this.#messageRoot || !this.#combineButton) {
      return;
    }

    this.#previewRoot.replaceChildren();
    this.#messageRoot.textContent = "";
    this.#messageRoot.className = "material-combiner-message";
    this.#combineButton.disabled = true;

    if (!session || !controller) {
      this.#previewRoot.append(this.#emptyMessage("No active material world."));
      return;
    }

    const parentAId = this.#selectedMaterialAId;
    const parentBId = this.#selectedMaterialBId;

    if (!parentAId || !parentBId) {
      this.#previewRoot.append(this.#emptyMessage("No discovered materials."));
      return;
    }

    const knownResult = controller.getKnownResult(
      parentAId,
      parentBId,
      this.#selectedStation,
    );
    const researchPreview = controller.previewResearchRequirement(
      parentAId,
      parentBId,
      this.#selectedStation,
    );
    const title = document.createElement("h3");
    const affordability = controller.canAfford(parentAId, parentBId);

    title.textContent = materialCombinerKnownResultLabel(knownResult);
    this.#previewRoot.append(title);

    if (knownResult) {
      this.#previewRoot.append(
        this.#statsView.render(
          materialStatsViewModel(session.materialWorld, knownResult),
        ),
      );
    } else {
      const summary = document.createElement("p");

      summary.textContent = `${materialDisplayName(
        session.materialWorld,
        parentAId,
      )} + ${materialDisplayName(session.materialWorld, parentBId)}`;
      this.#previewRoot.append(summary);
    }

    if (!affordability) {
      const warning = document.createElement("p");

      warning.className = "material-combiner-warning";
      warning.textContent = "Missing material items.";
      this.#previewRoot.append(warning);
    }

    if (researchPreview?.requiredResearchTier) {
      const required = document.createElement("p");

      required.className = "material-combiner-research";
      required.textContent = `Required tier: ${
        MATERIAL_RESEARCH_TIER_DISPLAY_NAMES[
          researchPreview.requiredResearchTier
        ]
      }`;
      this.#previewRoot.append(required);
    }

    if (researchPreview?.lockedResearchTier) {
      const warning = document.createElement("p");

      warning.className = "material-combiner-warning";
      warning.textContent =
        researchPreview.message ??
        `Requires ${
          MATERIAL_RESEARCH_TIER_DISPLAY_NAMES[
            researchPreview.lockedResearchTier
          ]
        }.`;
      this.#previewRoot.append(warning);
    }

    if (this.#message) {
      this.#messageRoot.textContent = this.#message.text;
      this.#messageRoot.classList.add(this.#message.tone);
    }

    this.#combineButton.disabled =
      !affordability || Boolean(researchPreview?.lockedResearchTier);
  }

  #combineSelected(): void {
    const controller = this.#controller;
    const parentAId = this.#selectedMaterialAId;
    const parentBId = this.#selectedMaterialBId;

    if (!controller || !parentAId || !parentBId) {
      this.#message = {
        tone: "warning",
        text: "Unknown material selected.",
      };
      this.#renderPreview();
      return;
    }

    const result = controller.combine(
      parentAId,
      parentBId,
      this.#selectedStation,
    );

    this.#message = result.ok
      ? {
          tone: "success",
          text: result.message,
        }
      : {
          tone: "warning",
          text: result.consumedIngredients
            ? `${result.message} Ingredients were consumed.`
            : result.message,
        };
    this.#renderMaterialOptions();
    this.#renderPreview();
  }

  #emptyMessage(text: string): HTMLElement {
    const message = document.createElement("p");

    message.className = "material-combiner-empty";
    message.textContent = text;
    return message;
  }
}
