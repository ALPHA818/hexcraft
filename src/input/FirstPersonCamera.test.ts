import { describe, expect, it } from "vitest";

import { cameraForward } from "./FirstPersonCamera.ts";

describe("first-person camera direction", () => {
  it("faces down negative Z at zero rotation", () => {
    expect(cameraForward(0, 0)).toEqual([0, 0, -1]);
  });

  it("turns right toward positive X", () => {
    const [x, y, z] = cameraForward(Math.PI / 2, 0);

    expect(x).toBeCloseTo(1);
    expect(y).toBeCloseTo(0);
    expect(z).toBeCloseTo(0);
  });

  it("looks upward with positive pitch", () => {
    const [, y] = cameraForward(0, Math.PI / 4);

    expect(y).toBeCloseTo(Math.SQRT1_2);
  });
});
