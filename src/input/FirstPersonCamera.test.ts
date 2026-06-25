import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cameraForward,
  FirstPersonCamera,
} from "./FirstPersonCamera.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("moves from touch joystick input without pointer lock", () => {
    const world = {
      groundYAt: () => 0,
      isSolidAtWorld: () => false,
    };
    const camera = new FirstPersonCamera(
      {} as HTMLCanvasElement,
      world,
      true,
    );
    camera.spawnAt(0, 0);
    const before = camera.position()[2];

    camera.setTouchMovement(0, 1);
    camera.update(1 / 30);

    expect(camera.position()[2]).toBeLessThan(before);
  });

  it("flies vertically without gravity in creative mode", () => {
    const world = {
      groundYAt: () => 0,
      isSolidAtWorld: () => true,
    };
    const camera = new FirstPersonCamera(
      {} as HTMLCanvasElement,
      world,
      true,
      "creative",
    );
    camera.spawnAt(0, 0);
    const before = camera.position()[1];

    camera.setTouchVertical(1);
    camera.update(1 / 30);

    expect(camera.position()[1]).toBeGreaterThan(before);
  });

  it("reacquires desktop pointer lock after an interface closes", () => {
    const requestPointerLock = vi.fn(() => Promise.resolve());
    const canvas = {
      requestPointerLock,
    } as unknown as HTMLCanvasElement;
    vi.stubGlobal("document", { pointerLockElement: null });
    const camera = new FirstPersonCamera(
      canvas,
      {
        groundYAt: () => 0,
        isSolidAtWorld: () => false,
      },
      false,
    );

    camera.resumeInput();

    expect(requestPointerLock).toHaveBeenCalledOnce();
  });
});
