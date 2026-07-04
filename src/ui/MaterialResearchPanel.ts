import type { MaterialWorldController } from "../game/MaterialWorldController.ts";
import {
  MATERIAL_RESEARCH_TIERS,
  MATERIAL_RESEARCH_TIER_DISPLAY_NAMES,
  type MaterialResearchTier,
} from "../materials/MaterialResearch.ts";

export type MaterialResearchPanelSession = Readonly<{
  materialWorld: MaterialWorldController;
  canDebugUnlock?: () => boolean;
  onResearchChanged?: () => void;
  onSaveRequested?: () => void;
}>;

export type MaterialResearchTierRow = Readonly<{
  tier: MaterialResearchTier;
  label: string;
  unlocked: boolean;
}>;

export function materialResearchTierRows(
  unlockedTiers: readonly MaterialResearchTier[],
): readonly MaterialResearchTierRow[] {
  const unlocked = new Set(unlockedTiers);

  return MATERIAL_RESEARCH_TIERS.map((tier) => ({
    tier,
    label: MATERIAL_RESEARCH_TIER_DISPLAY_NAMES[tier],
    unlocked: unlocked.has(tier),
  }));
}

export class MaterialResearchPanel {
  readonly #root: HTMLElement;
  readonly #onOpenChange: (isOpen: boolean) => void;

  #session: MaterialResearchPanelSession | null = null;
  #message = "";

  constructor(
    root: HTMLElement,
    session: MaterialResearchPanelSession | null = null,
    onOpenChange: (isOpen: boolean) => void = () => {},
  ) {
    this.#root = root;
    this.#onOpenChange = onOpenChange;
    this.#root.className = "material-research-panel";
    this.#root.setAttribute("role", "dialog");
    this.#root.setAttribute("aria-label", "Material Research");
    this.#root.tabIndex = -1;
    this.setSession(session);
    this.hide();
  }

  setSession(session: MaterialResearchPanelSession | null): void {
    this.#session = session;
    this.#message = "";

    if (this.isOpen()) {
      this.#render();
    }
  }

  isOpen(): boolean {
    return !this.#root.hidden;
  }

  show(): void {
    this.#root.hidden = false;
    document.body.classList.add("material-research-open");
    this.#render();
    this.#onOpenChange(true);
    this.#root.focus({ preventScroll: true });
  }

  hide(): void {
    this.#root.hidden = true;
    this.#root.replaceChildren();
    document.body.classList.remove("material-research-open");
    this.#message = "";
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
    const list = document.createElement("section");
    const message = document.createElement("p");

    card.className = "material-research-card";
    title.textContent = "Material Research";
    subtitle.textContent = "Progression tiers for advanced reactions";
    closeButton.type = "button";
    closeButton.className = "material-research-close";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", () => this.hide());
    titleGroup.append(title, subtitle);
    header.append(titleGroup, closeButton);

    list.className = "material-research-list";
    const session = this.#session;
    if (session) {
      const debugUnlock = session.canDebugUnlock?.() ?? false;

      list.replaceChildren(
        ...materialResearchTierRows(
          session.materialWorld.unlockedResearchTiers(),
        ).map((row) => this.#createTierRow(row, debugUnlock)),
      );
    } else {
      const empty = document.createElement("p");

      empty.className = "material-research-empty";
      empty.textContent = "No active material world.";
      list.append(empty);
    }

    message.className = "material-research-message";
    message.textContent = this.#message;
    card.append(header, list, message);
    this.#root.replaceChildren(card);
  }

  #createTierRow(
    row: MaterialResearchTierRow,
    debugUnlock: boolean,
  ): HTMLElement {
    const article = document.createElement("article");
    const details = document.createElement("div");
    const title = document.createElement("strong");
    const status = document.createElement("span");

    article.className = "material-research-tier";
    article.classList.toggle("unlocked", row.unlocked);
    article.classList.toggle("locked", !row.unlocked);
    title.textContent = row.label;
    status.textContent = row.unlocked ? "Unlocked" : "Locked";
    details.append(title, status);
    article.append(details);

    if (debugUnlock && !row.unlocked) {
      const button = document.createElement("button");

      button.type = "button";
      button.textContent = "Unlock";
      button.addEventListener("click", () => this.#unlock(row.tier));
      article.append(button);
    }

    return article;
  }

  #unlock(tier: MaterialResearchTier): void {
    const session = this.#session;

    if (!session) {
      return;
    }

    const unlocked = session.materialWorld.unlockResearchTier(tier);
    this.#message = unlocked
      ? `Unlocked ${MATERIAL_RESEARCH_TIER_DISPLAY_NAMES[tier]}.`
      : `${MATERIAL_RESEARCH_TIER_DISPLAY_NAMES[tier]} is already unlocked.`;

    if (unlocked) {
      session.onResearchChanged?.();
      session.onSaveRequested?.();
    }
    this.#render();
  }
}
