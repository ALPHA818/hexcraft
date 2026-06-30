export class DeathScreen {
  readonly #root: HTMLElement;

  constructor(root: HTMLElement) {
    this.#root = root;
    this.#root.className = "death-screen";
    this.hide();
  }

  show(worldName: string): void {
    const panel = document.createElement("section");
    const title = document.createElement("h2");
    const detail = document.createElement("p");

    panel.className = "death-panel";
    title.textContent = "You died";
    detail.textContent = `${worldName} will respawn you in a moment.`;
    panel.append(title, detail);
    this.#root.replaceChildren(panel);
    this.#root.hidden = false;
  }

  hide(): void {
    this.#root.hidden = true;
    this.#root.replaceChildren();
  }
}
