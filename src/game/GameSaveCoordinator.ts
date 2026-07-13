import type { WorldSaveManager } from "../save/WorldSaveManager.ts";
import { settingsFromMetadata } from "../save/WorldSaveTypes.ts";
import { captureGameSavePayload, type ActiveGame } from "./GameSession.ts";

export type GameSaveCoordinatorOptions = Readonly<{
  saveManager: WorldSaveManager;
  getActiveGame: () => ActiveGame | null;
  setActiveGame: (game: ActiveGame) => void;
}>;

export class GameSaveCoordinator {
  readonly #saveManager: WorldSaveManager;
  readonly #getActiveGame: () => ActiveGame | null;
  readonly #setActiveGame: (game: ActiveGame) => void;
  #saveQueue: Promise<void> = Promise.resolve();

  constructor(options: GameSaveCoordinatorOptions) {
    this.#saveManager = options.saveManager;
    this.#getActiveGame = options.getActiveGame;
    this.#setActiveGame = options.setActiveGame;
  }

  saveActiveGame(): Promise<void> {
    const game = this.#getActiveGame();

    if (!game) {
      return Promise.resolve();
    }

    const payload = captureGameSavePayload(game);

    this.#saveQueue = this.#saveQueue
      .catch(() => {
        // Keep later saves moving even if an earlier IndexedDB write failed.
      })
      .then(async () => {
        const metadata = await this.#saveManager.saveWorld(payload);
        const activeGame = this.#getActiveGame();

        if (activeGame?.id === game.id) {
          this.#setActiveGame({
            ...activeGame,
            metadata,
            settings: settingsFromMetadata(metadata),
          });
        }
      })
      .catch((error) => {
        console.error("World save failed.", error);
      });

    return this.#saveQueue;
  }

  startAutosave(intervalMs = 30_000): ReturnType<typeof window.setInterval> {
    return window.setInterval(() => {
      void this.saveActiveGame();
    }, intervalMs);
  }

  stopAutosave(timer: ReturnType<typeof window.setInterval>): void {
    window.clearInterval(timer);
  }

  attachPageLifecycleEvents(): void {
    window.addEventListener("pagehide", () => {
      void this.saveActiveGame();
    });

    window.addEventListener("beforeunload", () => {
      void this.saveActiveGame();
    });
  }
}
