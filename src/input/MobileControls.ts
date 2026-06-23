import type { Atmosphere } from "../environment/Atmosphere.ts";
import type { Inventory } from "../game/Inventory.ts";
import type { SurvivalController } from "../game/SurvivalController.ts";
import type { FirstPersonCamera } from "./FirstPersonCamera.ts";

export class MobileControls {
  readonly #root: HTMLElement;
  readonly #joystick: HTMLElement;
  readonly #knob: HTMLElement;
  readonly #lookZone: HTMLElement;
  readonly #camera: FirstPersonCamera;

  #movePointer: number | null = null;
  #lookPointer: number | null = null;
  #lookX = 0;
  #lookY = 0;

  constructor(
    camera: FirstPersonCamera,
    survival: SurvivalController,
    inventory: Inventory,
    atmosphere: Atmosphere,
  ) {
    const root = document.querySelector<HTMLElement>("#mobile-controls");
    const joystick = document.querySelector<HTMLElement>("#move-stick");
    const knob = document.querySelector<HTMLElement>("#move-knob");
    const lookZone = document.querySelector<HTMLElement>("#look-zone");

    if (!root || !joystick || !knob || !lookZone) {
      throw new Error("Mobile control elements are missing.");
    }

    this.#root = root;
    this.#joystick = joystick;
    this.#knob = knob;
    this.#lookZone = lookZone;
    this.#camera = camera;

    document.body.classList.add("mobile-game");
    root.hidden = false;
    this.#bindMovement();
    this.#bindLook();
    this.#bindHoldButton(
      "#touch-jump",
      () => camera.setTouchVertical(1),
      () => camera.setTouchVertical(0),
    );
    this.#bindHoldButton(
      "#touch-down",
      () => camera.setTouchVertical(-1),
      () => camera.setTouchVertical(0),
    );
    this.#bindButton("#touch-mine", () => survival.mine());
    this.#bindButton("#touch-place", () => survival.place());
    this.#bindButton("#touch-inventory", () => inventory.toggle());
    this.#bindButton("#touch-slot", () => inventory.selectRelative(1));
    this.#bindButton("#touch-weather", () => atmosphere.cycleWeather());
  }

  #bindButton(selector: string, action: () => void): void {
    const button = this.#root.querySelector<HTMLButtonElement>(selector);
    if (!button) {
      throw new Error(`Mobile control ${selector} is missing.`);
    }

    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      action();
    });
  }

  #bindHoldButton(
    selector: string,
    start: () => void,
    stop: () => void,
  ): void {
    const button = this.#root.querySelector<HTMLButtonElement>(selector);
    if (!button) {
      throw new Error(`Mobile control ${selector} is missing.`);
    }

    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.setPointerCapture(event.pointerId);
      start();
    });
    const release = (event: PointerEvent): void => {
      event.preventDefault();
      stop();
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", stop);
  }

  #bindMovement(): void {
    const update = (event: PointerEvent): void => {
      const bounds = this.#joystick.getBoundingClientRect();
      const radius = bounds.width / 2;
      const offsetX = event.clientX - (bounds.left + radius);
      const offsetY = event.clientY - (bounds.top + radius);
      const distance = Math.hypot(offsetX, offsetY);
      const scale = distance > radius ? radius / distance : 1;
      const x = offsetX * scale;
      const y = offsetY * scale;

      this.#knob.style.transform =
        `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
      this.#camera.setTouchMovement(x / radius, -y / radius);
    };

    this.#joystick.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.#movePointer = event.pointerId;
      this.#joystick.setPointerCapture(event.pointerId);
      update(event);
    });
    this.#joystick.addEventListener("pointermove", (event) => {
      if (event.pointerId === this.#movePointer) {
        update(event);
      }
    });

    const release = (event: PointerEvent): void => {
      if (event.pointerId !== this.#movePointer) {
        return;
      }
      this.#movePointer = null;
      this.#knob.style.transform = "translate(-50%, -50%)";
      this.#camera.setTouchMovement(0, 0);
    };
    this.#joystick.addEventListener("pointerup", release);
    this.#joystick.addEventListener("pointercancel", release);
  }

  #bindLook(): void {
    this.#lookZone.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.#lookPointer = event.pointerId;
      this.#lookX = event.clientX;
      this.#lookY = event.clientY;
      this.#lookZone.setPointerCapture(event.pointerId);
    });
    this.#lookZone.addEventListener("pointermove", (event) => {
      if (event.pointerId !== this.#lookPointer) {
        return;
      }

      const deltaX = event.clientX - this.#lookX;
      const deltaY = event.clientY - this.#lookY;
      this.#lookX = event.clientX;
      this.#lookY = event.clientY;
      this.#camera.lookBy(deltaX, deltaY);
    });

    const release = (event: PointerEvent): void => {
      if (event.pointerId === this.#lookPointer) {
        this.#lookPointer = null;
      }
    };
    this.#lookZone.addEventListener("pointerup", release);
    this.#lookZone.addEventListener("pointercancel", release);
  }
}
