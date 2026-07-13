import type { PanelManager } from "../ui/PanelManager.ts";
import type { ActiveGame } from "./GameSession.ts";

export type GameRuntimeEventsOptions = Readonly<{
  panelManager: PanelManager;
  getActiveGame: () => ActiveGame | null;
  toggleDebugOverlay: () => void;
  toggleMaterialCodex: () => void;
  toggleMaterialResearch: () => void;
  toggleBasicWorkbench: () => void;
  pauseGame: () => void;
}>;

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export class GameRuntimeEvents {
  readonly #panelManager: PanelManager;
  readonly #getActiveGame: () => ActiveGame | null;
  readonly #toggleDebugOverlay: () => void;
  readonly #toggleMaterialCodex: () => void;
  readonly #toggleMaterialResearch: () => void;
  readonly #toggleBasicWorkbench: () => void;
  readonly #pauseGame: () => void;

  constructor(options: GameRuntimeEventsOptions) {
    this.#panelManager = options.panelManager;
    this.#getActiveGame = options.getActiveGame;
    this.#toggleDebugOverlay = options.toggleDebugOverlay;
    this.#toggleMaterialCodex = options.toggleMaterialCodex;
    this.#toggleMaterialResearch = options.toggleMaterialResearch;
    this.#toggleBasicWorkbench = options.toggleBasicWorkbench;
    this.#pauseGame = options.pauseGame;
  }

  attach(): void {
    document.addEventListener("keydown", this.#handleKeyDown);
    document.addEventListener(
      "pointerlockchange",
      this.#handlePointerLockChange,
    );
  }

  readonly #handleKeyDown = (event: KeyboardEvent): void => {
    const activeGame = this.#getActiveGame();

    if (event.code === "F3" && !event.repeat) {
      event.preventDefault();
      this.#toggleDebugOverlay();
      return;
    }

    if (
      event.code === "KeyM" &&
      !event.repeat &&
      activeGame &&
      !isEditableTarget(event.target)
    ) {
      event.preventDefault();
      this.#toggleMaterialCodex();
      return;
    }

    if (
      event.code === "KeyR" &&
      !event.repeat &&
      activeGame &&
      !isEditableTarget(event.target)
    ) {
      event.preventDefault();
      this.#toggleMaterialResearch();
      return;
    }

    if (
      event.code === "KeyB" &&
      !event.repeat &&
      activeGame &&
      !isEditableTarget(event.target)
    ) {
      event.preventDefault();
      this.#toggleBasicWorkbench();
      return;
    }

    if (event.code !== "Escape" || event.repeat || !activeGame) {
      return;
    }

    event.preventDefault();
    if (this.#panelManager.handleEscape()) {
      return;
    }
    this.#pauseGame();
  };

  readonly #handlePointerLockChange = (): void => {
    if (
      this.#getActiveGame() &&
      document.pointerLockElement === null &&
      this.#panelManager.shouldResumeInput()
    ) {
      this.#pauseGame();
    }
  };
}
