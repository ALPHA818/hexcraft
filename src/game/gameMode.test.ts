import { describe, expect, it } from "vitest";

import { isCreativeMode } from "./gameMode.ts";

describe("game mode helpers", () => {
  it("detects creative mode", () => {
    expect(isCreativeMode("creative")).toBe(true);
  });

  it("detects survival mode", () => {
    expect(isCreativeMode("survival")).toBe(false);
  });
});
