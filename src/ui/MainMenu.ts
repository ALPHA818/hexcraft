import type { WorldSaveMetadata } from "../save/WorldSaveTypes.ts";

export type MainMenuCallbacks = Readonly<{
  createNewWorld: () => void;
  openSettings: () => void;
  loadWorld: (worldId: string) => void;
  deleteWorld: (worldId: string) => void;
  renameWorld: (worldId: string, name: string) => void;
  resumeGame: () => void;
  backToMainMenu: () => void;
}>;

export class MainMenu {
  readonly #root: HTMLElement;
  readonly #callbacks: MainMenuCallbacks;

  constructor(root: HTMLElement, callbacks: MainMenuCallbacks) {
    this.#root = root;
    this.#callbacks = callbacks;
  }

  show(message = "", worlds: readonly WorldSaveMetadata[] = []): void {
    const panel = this.#createPanel("Hexcraft", "Shape the first world.");
    const createButton = this.#button("Create New World", () =>
      this.#callbacks.createNewWorld(),
    );
    const settingsButton = this.#button("Settings", () =>
      this.#callbacks.openSettings(),
    );
    const notice = document.createElement("p");

    notice.className = "menu-notice";
    notice.textContent = message;
    panel.append(
      createButton,
      settingsButton,
      this.#createSavedWorldsSection(worlds),
      notice,
    );
    this.#showPanel(panel);
  }

  showPause(worldName: string): void {
    const panel = this.#createPanel("Paused", `${worldName} · Esc resumes`);

    panel.append(
      this.#button("Resume", () => this.#callbacks.resumeGame()),
      this.#button("Settings", () => this.#callbacks.openSettings()),
      this.#button("Back to Main Menu", () => this.#callbacks.backToMainMenu()),
    );
    this.#showPanel(panel);
  }

  hide(): void {
    this.#root.hidden = true;
    this.#root.replaceChildren();
  }

  #showPanel(panel: HTMLElement): void {
    this.#root.hidden = false;
    this.#root.replaceChildren(panel);
  }

  #createPanel(title: string, subtitle: string): HTMLElement {
    const panel = document.createElement("section");
    const heading = document.createElement("h2");
    const description = document.createElement("p");

    panel.className = "menu-panel";
    heading.textContent = title;
    description.textContent = subtitle;
    panel.append(heading, description);
    return panel;
  }

  #createSavedWorldsSection(worlds: readonly WorldSaveMetadata[]): HTMLElement {
    const section = document.createElement("section");
    const title = document.createElement("h3");

    section.className = "saved-worlds";
    title.textContent = "Saved Worlds";
    section.append(title);

    if (worlds.length === 0) {
      const empty = document.createElement("p");

      empty.className = "empty-worlds";
      empty.textContent = "No saved worlds yet.";
      section.append(empty);
      return section;
    }

    for (const world of worlds) {
      section.append(this.#createSavedWorldRow(world));
    }

    return section;
  }

  #createSavedWorldRow(world: WorldSaveMetadata): HTMLElement {
    const row = document.createElement("article");
    const details = document.createElement("div");
    const name = document.createElement("strong");
    const meta = document.createElement("span");
    const actions = document.createElement("div");
    const loadButton = this.#button("Load", () =>
      this.#callbacks.loadWorld(world.id),
    );
    const renameButton = this.#button("Rename", () => {
      const nextName = globalThis.prompt?.("Rename world", world.name);

      if (nextName !== undefined && nextName !== null) {
        this.#callbacks.renameWorld(world.id, nextName);
      }
    });
    const deleteButton = this.#button("Delete", () =>
      this.#callbacks.deleteWorld(world.id),
    );

    row.className = "saved-world";
    details.className = "saved-world-details";
    actions.className = "saved-world-actions";
    loadButton.classList.add("primary");
    deleteButton.classList.add("danger");
    name.textContent = world.name;
    meta.textContent =
      `${world.gameMode} · seed ${world.seed} · ` +
      `updated ${new Date(world.updatedAt).toLocaleString()}`;
    details.append(name, meta);
    actions.append(loadButton, renameButton, deleteButton);
    row.append(details, actions);
    return row;
  }

  #button(label: string, action: () => void): HTMLButtonElement {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "menu-button";
    button.textContent = label;
    button.addEventListener("click", action);
    return button;
  }
}
