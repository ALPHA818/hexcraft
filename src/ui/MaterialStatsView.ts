import {
  MATERIAL_STAT_KEYS,
  type MaterialDefinition,
  type MaterialStatKey,
} from "../materials/MaterialTypes.ts";
import { materialVisualsForMaterial } from "../materials/MaterialVisuals.ts";
import {
  classifyMaterialCapabilities,
  MATERIAL_CAPABILITY_KEYS,
  MATERIAL_CAPABILITY_LABELS,
} from "../materials/MaterialCapabilities.ts";
import {
  materialBalanceScores,
  MATERIAL_BALANCE_SCORE_LABELS,
} from "../materials/MaterialBalance.ts";

export type MaterialRecipeLine = Readonly<{
  label: string;
  materialId: string;
}>;

export type MaterialStatsViewModel = Readonly<{
  material: MaterialDefinition;
  parentNames: readonly string[];
  childResults: readonly MaterialRecipeLine[];
}>;

type StatRow = readonly [label: string, value: string];

const STAT_LABELS = {
  stability: "Stability",
  hardness: "Hardness",
  density: "Density",
  heat: "Heat",
  conductivity: "Conductivity",
  toxicity: "Toxicity",
  radioactivity: "Radioactivity",
  magic: "Magic",
  organic: "Organic %",
  metal: "Metal %",
  crystal: "Crystal %",
  gas: "Gas %",
  liquid: "Liquid %",
} as const satisfies Record<MaterialStatKey, string>;

function formatStat(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function materialStatRows(
  material: MaterialDefinition,
): readonly StatRow[] {
  return MATERIAL_STAT_KEYS.map((key) => [
    STAT_LABELS[key],
    formatStat(material[key]),
  ]);
}

export function materialMetadataRows(
  model: MaterialStatsViewModel,
): readonly StatRow[] {
  return [
    ["ID", model.material.id],
    ["Name", model.material.name],
    ["Generation", String(model.material.generation)],
    [
      "Parents",
      model.parentNames.length > 0
        ? model.parentNames.join(" + ")
        : "Base material",
    ],
    ["Rarity", model.material.rarity],
    ["Required research tier", model.material.requiredResearchTier ?? "None"],
    [
      "Station type",
      model.material.stationType ??
        (model.material.generation === 0 ? "Base material" : "Unknown"),
    ],
    ["Description", model.material.description ?? "No description."],
  ] satisfies readonly StatRow[];
}

export function materialCapabilityRows(
  material: MaterialDefinition,
): readonly StatRow[] {
  const capabilities = classifyMaterialCapabilities(material);

  return MATERIAL_CAPABILITY_KEYS.map((key) => [
    MATERIAL_CAPABILITY_LABELS[key],
    `${capabilities[key]}/100`,
  ]);
}

export function materialBalanceRows(
  material: MaterialDefinition,
): readonly StatRow[] {
  const scores = materialBalanceScores(material);

  return [
    [MATERIAL_BALANCE_SCORE_LABELS.valueScore, `${scores.valueScore}/100`],
    [MATERIAL_BALANCE_SCORE_LABELS.dangerScore, `${scores.dangerScore}/100`],
    [
      MATERIAL_BALANCE_SCORE_LABELS.usefulnessScore,
      `${scores.usefulnessScore}/100`,
    ],
  ] satisfies readonly StatRow[];
}

function appendDefinitionRow(
  list: HTMLDListElement,
  label: string,
  value: string,
): void {
  const term = document.createElement("dt");
  const description = document.createElement("dd");

  term.textContent = label;
  description.textContent = value;
  list.append(term, description);
}

export class MaterialStatsView {
  render(model: MaterialStatsViewModel): HTMLElement {
    const section = document.createElement("section");
    const title = document.createElement("h3");
    const summary = document.createElement("p");
    const visual = this.#createVisualSummary(model.material);
    const stats = document.createElement("dl");
    const balance = this.#createBalanceDetails(model.material);
    const capabilities = this.#createCapabilityDetails(model.material);
    const tags = document.createElement("p");
    const recipeHistory = this.#createRecipeHistory(model);

    section.className = "material-stats-view";
    title.textContent = model.material.name;
    summary.textContent = `${model.material.rarity} · generation ${model.material.generation}`;
    stats.className = "material-stats-grid";

    for (const [label, value] of materialMetadataRows(model)) {
      appendDefinitionRow(stats, label, value);
    }
    for (const [label, value] of materialStatRows(model.material)) {
      appendDefinitionRow(stats, label, value);
    }

    tags.className = "material-tags-detail";
    tags.textContent =
      model.material.tags.length > 0
        ? `Tags · ${model.material.tags.join(", ")}`
        : "Tags · none";

    section.append(
      title,
      summary,
      visual,
      stats,
      balance,
      capabilities,
      tags,
      recipeHistory,
    );
    return section;
  }

  #createVisualSummary(material: MaterialDefinition): HTMLElement {
    const visuals = materialVisualsForMaterial(material);
    const section = document.createElement("section");
    const swatch = document.createElement("span");
    const label = document.createElement("p");

    section.className = "material-visual-summary";
    swatch.className = "material-visual-swatch";
    swatch.style.setProperty("--material-base-color", visuals.baseColor);
    swatch.style.setProperty("--material-accent-color", visuals.accentColor);
    label.textContent = `Base ${visuals.baseColor} · Accent ${visuals.accentColor}`;
    section.append(swatch, label);
    return section;
  }

  #createBalanceDetails(material: MaterialDefinition): HTMLElement {
    const section = document.createElement("section");
    const title = document.createElement("h4");
    const list = document.createElement("dl");

    section.className = "material-balance-detail";
    title.textContent = "Balance scores";
    list.className = "material-stats-grid material-balance-grid";

    for (const [label, value] of materialBalanceRows(material)) {
      appendDefinitionRow(list, label, value);
    }

    section.append(title, list);
    return section;
  }

  #createCapabilityDetails(material: MaterialDefinition): HTMLElement {
    const section = document.createElement("section");
    const title = document.createElement("h4");
    const list = document.createElement("dl");

    section.className = "material-capabilities-detail";
    title.textContent = "Capability grades";
    list.className = "material-stats-grid material-capabilities-grid";

    for (const [label, value] of materialCapabilityRows(material)) {
      appendDefinitionRow(list, label, value);
    }

    section.append(title, list);
    return section;
  }

  #createRecipeHistory(model: MaterialStatsViewModel): HTMLElement {
    const section = document.createElement("section");
    const title = document.createElement("h4");
    const createdFrom = document.createElement("p");
    const childrenTitle = document.createElement("strong");
    const children = document.createElement("ul");

    section.className = "material-recipe-history";
    title.textContent = "Recipe history";
    createdFrom.textContent =
      model.parentNames.length >= 2
        ? `Created from ${model.parentNames.join(" + ")}`
        : "Base material from the starter codex.";
    childrenTitle.textContent = "Known child results";

    if (model.childResults.length === 0) {
      const empty = document.createElement("li");

      empty.textContent = "No known child results yet.";
      children.append(empty);
    } else {
      for (const child of model.childResults) {
        const item = document.createElement("li");

        item.textContent = child.label;
        children.append(item);
      }
    }

    section.append(title, createdFrom, childrenTitle, children);
    return section;
  }
}
