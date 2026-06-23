import { describe, expect, it } from "vitest";

import { ACTIVE_GAME_MODE, isCreativeMode } from "./gameMode.ts";

describe("active game mode", () => {
  it("starts in creative mode for testing", () => {
    expect(ACTIVE_GAME_MODE).toBe("creative");
    expect(isCreativeMode()).toBe(true);
  });

  it("keeps survival mode available", () => {
    expect(isCreativeMode("survival")).toBe(false);
  });
});
