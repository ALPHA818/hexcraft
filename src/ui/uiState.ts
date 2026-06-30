export type UiScreen =
  "main-menu" | "world-creation" | "settings" | "pause" | "game";

export type UiState = Readonly<{
  screen: UiScreen;
  inGame: boolean;
}>;

export function applyUiStateToBodyClass(
  state: UiState,
  body: Pick<HTMLElement, "classList"> = document.body,
): void {
  body.classList.toggle("in-game", state.inGame);
  body.classList.toggle("menu-open", state.screen !== "game");
  body.classList.toggle("pause-open", state.screen === "pause");
}
