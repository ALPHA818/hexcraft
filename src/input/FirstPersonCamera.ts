import { lookAt, type Mat4, type Vec3 } from "../math/mat4.ts";
import type { GameMode } from "../game/gameMode.ts";

type MutableVec3 = [number, number, number];

export type FirstPersonCollisionWorld = Readonly<{
  groundYAt: (x: number, z: number, maximumY: number) => number;
  isSolidAtWorld: (x: number, y: number, z: number) => boolean;
  isFluidAtWorld?: (x: number, y: number, z: number) => boolean;
}>;

export type FirstPersonCameraState = Readonly<{
  grounded: boolean;
  fallDistance: number;
  sprinting: boolean;
  inWater: boolean;
}>;

const WALK_SPEED = 4.5;
const SPRINT_MULTIPLIER = 1.65;
const MOUSE_SENSITIVITY = 0.002;
const TOUCH_SENSITIVITY = 0.004;
const MAX_PITCH = Math.PI / 2 - 0.02;
export const PLAYER_EYE_HEIGHT = 1.55;
const STEP_HEIGHT = 0.78;
const GRAVITY = 20;
const JUMP_SPEED = 7.2;
const CREATIVE_FLY_SPEED = 9;
const SWIM_UP_SPEED = 2.9;
const WATER_MOVEMENT_MULTIPLIER = 0.58;
const WATER_GRAVITY_MULTIPLIER = 0.18;
const WATER_TERMINAL_FALL_SPEED = -2.1;
const MOVEMENT_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "Space",
  "ShiftLeft",
  "ShiftRight",
]);

export function cameraForward(yaw: number, pitch: number): Vec3 {
  const horizontal = Math.cos(pitch);
  return [
    Math.sin(yaw) * horizontal,
    Math.sin(pitch),
    -Math.cos(yaw) * horizontal,
  ];
}

export class FirstPersonCamera {
  readonly #canvas: HTMLCanvasElement;
  readonly #world: FirstPersonCollisionWorld;
  readonly #isMobile: boolean;
  readonly #isCreative: boolean;
  readonly #keys = new Set<string>();
  readonly #position: MutableVec3 = [0, 12, 18];

  #yaw = 0;
  #pitch = -0.18;
  #velocityY = 0;
  #isPointerLocked = false;
  #acceptsInput = true;
  #onGround = false;
  #jumpWasHeld = false;
  #touchStrafe = 0;
  #touchForward = 0;
  #touchJumpQueued = false;
  #touchVertical = 0;
  #fallStartY = this.#position[1];
  #lastFallDistance = 0;
  #isSprinting = false;
  #inWater = false;

  constructor(
    canvas: HTMLCanvasElement,
    world: FirstPersonCollisionWorld,
    isMobile = false,
    mode: GameMode = "survival",
  ) {
    this.#canvas = canvas;
    this.#world = world;
    this.#isMobile = isMobile;
    this.#isCreative = mode === "creative";
  }

  start(): void {
    this.#acceptsInput = true;
    this.#canvas.addEventListener("pointerdown", (event) => {
      if (
        this.#acceptsInput &&
        event.pointerType === "mouse" &&
        !this.#isPointerLocked
      ) {
        void this.#canvas.requestPointerLock();
      }
    });
    this.#canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });

    document.addEventListener("pointerlockchange", () => {
      this.#isPointerLocked = document.pointerLockElement === this.#canvas;
      document.body.classList.toggle("pointer-locked", this.#isPointerLocked);

      if (!this.#isPointerLocked) {
        this.#keys.clear();
      }
    });

    document.addEventListener("mousemove", (event) => {
      if (!this.#acceptsInput || !this.#isPointerLocked) {
        return;
      }

      this.#yaw += event.movementX * MOUSE_SENSITIVITY;
      this.#pitch -= event.movementY * MOUSE_SENSITIVITY;
      this.#pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.#pitch));
    });

    document.addEventListener("keydown", (event) => {
      if (
        !this.#acceptsInput ||
        !this.#isPointerLocked ||
        !MOVEMENT_KEYS.has(event.code)
      ) {
        return;
      }

      event.preventDefault();
      this.#keys.add(event.code);
    });

    document.addEventListener("keyup", (event) => {
      if (this.#acceptsInput) {
        this.#keys.delete(event.code);
      }
    });

    window.addEventListener("blur", () => {
      this.#keys.clear();
    });
  }

  spawnAt(x: number, z: number): void {
    const ground = this.#world.groundYAt(x, z, 100);
    this.#position[0] = x;
    this.#position[1] = ground + PLAYER_EYE_HEIGHT;
    this.#position[2] = z;
    this.#velocityY = 0;
    this.#onGround = true;
    this.#fallStartY = this.#position[1];
    this.#lastFallDistance = 0;
  }

  setPosition(position: readonly [number, number, number]): void {
    this.#position[0] = position[0];
    this.#position[1] = position[1];
    this.#position[2] = position[2];
    this.#velocityY = 0;
    this.#onGround = false;
    this.#fallStartY = this.#position[1];
    this.#lastFallDistance = 0;
  }

  update(deltaSeconds: number): void {
    const delta = Math.min(deltaSeconds, 0.05);
    const wasOnGround = this.#onGround;
    const forwardX = Math.sin(this.#yaw);
    const forwardZ = -Math.cos(this.#yaw);
    const rightX = Math.cos(this.#yaw);
    const rightZ = Math.sin(this.#yaw);
    let movementX = 0;
    let movementZ = 0;
    const inWater =
      this.#world.isFluidAtWorld?.(
        this.#position[0],
        this.#position[1] - PLAYER_EYE_HEIGHT * 0.55,
        this.#position[2],
      ) ?? false;
    this.#inWater = inWater;
    this.#isSprinting = false;
    this.#lastFallDistance = 0;

    if (this.#isPointerLocked) {
      if (this.#keys.has("KeyW")) {
        movementX += forwardX;
        movementZ += forwardZ;
      }
      if (this.#keys.has("KeyS")) {
        movementX -= forwardX;
        movementZ -= forwardZ;
      }
      if (this.#keys.has("KeyD")) {
        movementX += rightX;
        movementZ += rightZ;
      }
      if (this.#keys.has("KeyA")) {
        movementX -= rightX;
        movementZ -= rightZ;
      }
    }
    if (this.#isMobile) {
      movementX += forwardX * this.#touchForward;
      movementZ += forwardZ * this.#touchForward;
      movementX += rightX * this.#touchStrafe;
      movementZ += rightZ * this.#touchStrafe;
    }

    const movementLength = Math.hypot(movementX, movementZ);
    if (this.#isCreative) {
      const verticalMovement =
        (this.#keys.has("Space") ? 1 : 0) -
        (this.#keys.has("ShiftLeft") || this.#keys.has("ShiftRight") ? 1 : 0) +
        this.#touchVertical +
        (this.#touchJumpQueued ? 1 : 0);
      const speed = CREATIVE_FLY_SPEED * delta;

      if (movementLength > 0) {
        this.#position[0] += (movementX / movementLength) * speed;
        this.#position[2] += (movementZ / movementLength) * speed;
      }
      this.#position[1] += Math.max(-1, Math.min(1, verticalMovement)) * speed;
      this.#velocityY = 0;
      this.#onGround = false;
      this.#fallStartY = this.#position[1];
      this.#touchJumpQueued = false;
      return;
    }

    if (movementLength > 0) {
      const sprinting =
        this.#keys.has("ShiftLeft") || this.#keys.has("ShiftRight");
      this.#isSprinting = sprinting && !inWater;
      const speed =
        WALK_SPEED *
        (this.#isSprinting ? SPRINT_MULTIPLIER : 1) *
        (inWater ? WATER_MOVEMENT_MULTIPLIER : 1) *
        delta;
      const stepX = (movementX / movementLength) * speed;
      const stepZ = (movementZ / movementLength) * speed;
      this.#moveHorizontal(stepX, stepZ);
    }

    const jumpHeld = this.#keys.has("Space") || this.#touchJumpQueued;
    if (jumpHeld && !this.#jumpWasHeld && this.#onGround) {
      this.#velocityY = JUMP_SPEED;
      this.#onGround = false;
      this.#fallStartY = this.#position[1];
    } else if (jumpHeld && inWater) {
      this.#velocityY = Math.max(this.#velocityY, SWIM_UP_SPEED);
    }
    this.#jumpWasHeld = jumpHeld;
    this.#touchJumpQueued = false;

    this.#velocityY -=
      GRAVITY * (inWater ? WATER_GRAVITY_MULTIPLIER : 1) * delta;
    if (inWater) {
      this.#velocityY = Math.max(this.#velocityY, WATER_TERMINAL_FALL_SPEED);
    }
    this.#position[1] += this.#velocityY * delta;
    if (!this.#onGround && this.#velocityY > 0) {
      this.#fallStartY = Math.max(this.#fallStartY, this.#position[1]);
    }

    const feet = this.#position[1] - PLAYER_EYE_HEIGHT;
    const ground = this.#world.groundYAt(
      this.#position[0],
      this.#position[2],
      feet + STEP_HEIGHT,
    );

    if (this.#velocityY <= 0 && feet <= ground) {
      if (!wasOnGround) {
        this.#lastFallDistance = Math.max(
          0,
          this.#fallStartY - (ground + PLAYER_EYE_HEIGHT),
        );
      }
      this.#position[1] = ground + PLAYER_EYE_HEIGHT;
      this.#velocityY = 0;
      this.#onGround = true;
      this.#fallStartY = this.#position[1];
    } else {
      this.#onGround = false;
      if (wasOnGround) {
        this.#fallStartY = this.#position[1];
      }
    }

    if (
      this.#velocityY > 0 &&
      this.#world.isSolidAtWorld(
        this.#position[0],
        this.#position[1] + 0.12,
        this.#position[2],
      )
    ) {
      this.#velocityY = 0;
    }
  }

  #moveHorizontal(stepX: number, stepZ: number): void {
    const moveAxis = (nextX: number, nextZ: number): void => {
      const feet = this.#position[1] - PLAYER_EYE_HEIGHT;
      const ground = this.#world.groundYAt(nextX, nextZ, feet + STEP_HEIGHT);
      const blockedByStep = ground > feet + STEP_HEIGHT;
      const blockedBody =
        this.#world.isSolidAtWorld(nextX, feet + 0.18, nextZ) ||
        this.#world.isSolidAtWorld(nextX, this.#position[1] - 0.15, nextZ);

      if (!blockedByStep && !blockedBody) {
        this.#position[0] = nextX;
        this.#position[2] = nextZ;

        if (this.#onGround && ground > feet) {
          this.#position[1] = ground + PLAYER_EYE_HEIGHT;
        }
      }
    };

    moveAxis(this.#position[0] + stepX, this.#position[2]);
    moveAxis(this.#position[0], this.#position[2] + stepZ);
  }

  isPointerLocked(): boolean {
    return this.#isPointerLocked;
  }

  resumeInput(): void {
    if (
      !this.#acceptsInput ||
      this.#isMobile ||
      document.pointerLockElement === this.#canvas
    ) {
      return;
    }

    void this.#canvas.requestPointerLock();
  }

  releaseInput(): void {
    this.#keys.clear();
    this.#touchStrafe = 0;
    this.#touchForward = 0;
    this.#touchVertical = 0;
    this.#touchJumpQueued = false;

    if (document.pointerLockElement === this.#canvas) {
      document.exitPointerLock();
    }
    document.body.classList.remove("pointer-locked");
  }

  stopInput(): void {
    this.#acceptsInput = false;
    this.releaseInput();
  }

  isInputActive(): boolean {
    return this.#acceptsInput && (this.#isMobile || this.#isPointerLocked);
  }

  state(): FirstPersonCameraState {
    return {
      grounded: this.#onGround,
      fallDistance: this.#lastFallDistance,
      sprinting: this.#isSprinting,
      inWater: this.#inWater,
    };
  }

  isGrounded(): boolean {
    return this.#onGround;
  }

  fallDistance(): number {
    return this.#lastFallDistance;
  }

  isSprinting(): boolean {
    return this.#isSprinting;
  }

  isInWater(): boolean {
    return this.#inWater;
  }

  setTouchMovement(strafe: number, forward: number): void {
    this.#touchStrafe = Math.max(-1, Math.min(1, strafe));
    this.#touchForward = Math.max(-1, Math.min(1, forward));
  }

  lookBy(deltaX: number, deltaY: number): void {
    this.#yaw += deltaX * TOUCH_SENSITIVITY;
    this.#pitch -= deltaY * TOUCH_SENSITIVITY;
    this.#pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.#pitch));
  }

  queueJump(): void {
    this.#touchJumpQueued = true;
  }

  setTouchVertical(direction: number): void {
    this.#touchVertical = Math.max(-1, Math.min(1, direction));
  }

  direction(): Vec3 {
    return cameraForward(this.#yaw, this.#pitch);
  }

  position(): Vec3 {
    return this.#position;
  }

  viewMatrix(): Mat4 {
    const forward = this.direction();
    const target: Vec3 = [
      this.#position[0] + forward[0],
      this.#position[1] + forward[1],
      this.#position[2] + forward[2],
    ];

    return lookAt(this.#position, target, [0, 1, 0]);
  }
}
