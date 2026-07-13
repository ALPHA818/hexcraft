export type GameplayPanelId =
  | "inventory"
  | "creative-catalog"
  | "material-codex"
  | "material-combiner"
  | "material-research"
  | "material-storage"
  | "equipment"
  | "workbench";

export type ManagedPanel = Readonly<{
  id: GameplayPanelId;
  bodyClass: string;
  close: () => void;
}>;

type PanelBody = Pick<HTMLElement, "classList">;

export type PanelManagerOptions = Readonly<{
  body?: PanelBody;
  isGameActive?: () => boolean;
  releaseInput?: () => void;
  resumeInput?: () => void;
}>;

export class PanelManager {
  readonly #body: PanelBody | null;
  readonly #isGameActive: () => boolean;
  readonly #releaseInput: () => void;
  readonly #resumeInput: () => void;
  readonly #panels = new Map<GameplayPanelId, ManagedPanel>();
  #activePanel: GameplayPanelId | null = null;
  #suppressResume = false;

  constructor(options: PanelManagerOptions = {}) {
    this.#body =
      options.body ?? (typeof document === "undefined" ? null : document.body);
    this.#isGameActive = options.isGameActive ?? (() => true);
    this.#releaseInput = options.releaseInput ?? (() => {});
    this.#resumeInput = options.resumeInput ?? (() => {});
  }

  registerPanel(panel: ManagedPanel): void {
    this.#panels.set(panel.id, panel);
    this.#syncBodyClasses();
  }

  activePanel(): GameplayPanelId | null {
    return this.#activePanel;
  }

  isGameplayPanelOpen(): boolean {
    return this.#activePanel !== null;
  }

  shouldResumeInput(): boolean {
    return this.#activePanel === null && this.#isGameActive();
  }

  openPanel(panelId: GameplayPanelId, open: () => void): void {
    if (this.#activePanel === panelId) {
      return;
    }

    this.#withSuppressedResume(() => {
      this.#closePanelsExcept(panelId);
    });
    open();
    this.#syncBodyClasses();
  }

  notifyPanelOpenChange(panelId: GameplayPanelId, isOpen: boolean): void {
    if (isOpen) {
      this.#activePanel = panelId;
      this.#withSuppressedResume(() => {
        this.#closePanelsExcept(panelId);
      });
      this.#releaseInput();
      this.#syncBodyClasses();
      return;
    }

    if (this.#activePanel !== panelId) {
      this.#syncBodyClasses();
      return;
    }

    this.#activePanel = null;
    this.#syncBodyClasses();

    if (!this.#suppressResume && this.shouldResumeInput()) {
      this.#resumeInput();
    }
  }

  closeActivePanel(): boolean {
    const panelId = this.#activePanel;

    if (!panelId) {
      return false;
    }

    this.#panels.get(panelId)?.close();
    return true;
  }

  closeAllPanels(options: Readonly<{ resumeInput?: boolean }> = {}): void {
    const shouldResume = options.resumeInput ?? true;

    this.#withSuppressedResume(() => {
      for (const panel of this.#panels.values()) {
        panel.close();
      }
      this.#activePanel = null;
      this.#syncBodyClasses();
    });

    if (shouldResume && this.shouldResumeInput()) {
      this.#resumeInput();
    }
  }

  handleEscape(): boolean {
    return this.closeActivePanel();
  }

  #closePanelsExcept(panelId: GameplayPanelId): void {
    for (const panel of this.#panels.values()) {
      if (panel.id !== panelId) {
        panel.close();
      }
    }
  }

  #withSuppressedResume(action: () => void): void {
    const wasSuppressed = this.#suppressResume;

    this.#suppressResume = true;
    try {
      action();
    } finally {
      this.#suppressResume = wasSuppressed;
    }
  }

  #syncBodyClasses(): void {
    if (!this.#body) {
      return;
    }

    for (const panel of this.#panels.values()) {
      this.#body.classList.toggle(
        panel.bodyClass,
        panel.id === this.#activePanel,
      );
    }
  }
}
