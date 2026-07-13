import type {
  ProgressionController,
  ProgressionObjectiveView,
} from "../game/ProgressionController.ts";

const VISIBLE_OBJECTIVE_LIMIT = 5;

export class ObjectiveTracker {
  readonly #root: HTMLElement;
  #controller: ProgressionController | null = null;
  #toastTimer: ReturnType<typeof window.setTimeout> | null = null;
  #toast: HTMLElement | null = null;

  constructor(root: HTMLElement) {
    this.#root = root;
    this.#root.className = "objective-tracker";
    this.#root.setAttribute("aria-label", "Objectives");
    this.#root.hidden = true;
  }

  setController(controller: ProgressionController | null): void {
    this.#controller = controller;
    this.refresh();
  }

  refresh(): void {
    const controller = this.#controller;

    if (!controller) {
      this.#root.hidden = true;
      this.#root.replaceChildren();
      return;
    }

    this.#root.hidden = false;
    this.#root.replaceChildren(
      controller.isHidden()
        ? this.#renderCollapsed(controller)
        : this.#renderExpanded(controller),
    );

    for (const notification of controller.takeNotifications()) {
      this.#showNotification(notification);
    }
  }

  destroy(): void {
    if (this.#toastTimer) {
      window.clearTimeout(this.#toastTimer);
      this.#toastTimer = null;
    }

    this.#toast = null;
    this.#controller = null;
    this.#root.hidden = true;
    this.#root.replaceChildren();
  }

  #renderCollapsed(controller: ProgressionController): HTMLElement {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "objective-tracker-toggle collapsed";
    button.textContent = "Objectives";
    button.title = "Show objectives";
    button.addEventListener("click", () => {
      controller.setHidden(false);
      this.refresh();
    });
    return button;
  }

  #renderExpanded(controller: ProgressionController): HTMLElement {
    const card = document.createElement("section");
    const header = document.createElement("header");
    const title = document.createElement("strong");
    const hideButton = document.createElement("button");
    const list = document.createElement("ol");
    const objectives = this.#visibleObjectives(controller.objectives());

    card.className = "objective-tracker-card";
    title.textContent = "Objectives";
    hideButton.type = "button";
    hideButton.className = "objective-tracker-toggle";
    hideButton.textContent = "Hide";
    hideButton.title = "Hide objectives";
    hideButton.addEventListener("click", () => {
      controller.setHidden(true);
      this.refresh();
    });
    header.append(title, hideButton);

    list.className = "objective-tracker-list";
    list.replaceChildren(
      ...objectives.map((objective) => this.#objectiveRow(objective)),
    );
    card.append(header, list);
    return card;
  }

  #visibleObjectives(
    objectives: readonly ProgressionObjectiveView[],
  ): readonly ProgressionObjectiveView[] {
    const firstIncompleteIndex = objectives.findIndex(
      (objective) => !objective.completed,
    );

    if (firstIncompleteIndex < 0) {
      return objectives.slice(-VISIBLE_OBJECTIVE_LIMIT);
    }

    const start = Math.max(0, firstIncompleteIndex - 1);

    return objectives.slice(start, start + VISIBLE_OBJECTIVE_LIMIT);
  }

  #objectiveRow(objective: ProgressionObjectiveView): HTMLElement {
    const row = document.createElement("li");
    const title = document.createElement("span");
    const detail = document.createElement("small");

    row.className = objective.completed
      ? "objective-row completed"
      : "objective-row";
    title.textContent = objective.title;
    detail.textContent = objective.description;
    row.append(title, detail);
    return row;
  }

  #showNotification(text: string): void {
    const toast = document.createElement("p");

    if (this.#toastTimer) {
      window.clearTimeout(this.#toastTimer);
      this.#toastTimer = null;
    }
    this.#toast?.remove();

    toast.className = "objective-toast";
    toast.textContent = text;
    this.#root.append(toast);
    this.#toast = toast;
    this.#toastTimer = window.setTimeout(() => {
      toast.remove();
      if (this.#toast === toast) {
        this.#toast = null;
      }
      this.#toastTimer = null;
    }, 2_400);
  }
}
