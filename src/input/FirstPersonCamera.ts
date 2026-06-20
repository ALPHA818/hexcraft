import { lookAt, type Mat4, type Vec3 } from "../math/mat4.ts";

type MutableVec3 = [number, number, number];

export type FirstPersonCollisionWorld = Readonly<{
  groundYAt: (x: number, z: number, maximumY: number) => number;
  isSolidAtWorld: (x: number, y: number, z: number) => boolean;
}>;

const WALK_SPEED = 4.5;
const SPRINT_MULTIPLIER = 1.65;
const MOUSE_SENSITIVITY = 0.002;
const MAX_PITCH = Math.PI / 2 - 0.02;
export const PLAYER_EYE_HEIGHT = 1.55;
const STEP_HEIGHT = 0.78;
const GRAVITY = 20;
const JUMP_SPEED = 7.2;
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
  readonly #keys = new Set<string>();
  readonly #position: MutableVec3 = [0, 12, 18];

  #yaw = 0;
  #pitch = -0.18;
  #velocityY = 0;
  #isPointerLocked = false;
  #onGround = false;
  #jumpWasHeld = false;

  constructor(
    canvas: HTMLCanvasElement,
    world: FirstPersonCollisionWorld,
  ) {
    this.#canvas = canvas;
    this.#world = world;
  }

  start(): void {
    this.#canvas.addEventListener("click", () => {
      if (!this.#isPointerLocked) {
        void this.#canvas.requestPointerLock();
      }
    });
    this.#canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });

    document.addEventListener("pointerlockchange", () => {
      this.#isPointerLocked = document.pointerLockElement === this.#canvas;
      document.body.classList.toggle(
        "pointer-locked",
        this.#isPointerLocked,
      );

      if (!this.#isPointerLocked) {
        this.#keys.clear();
      }
    });

    document.addEventListener("mousemove", (event) => {
      if (!this.#isPointerLocked) {
        return;
      }

      this.#yaw += event.movementX * MOUSE_SENSITIVITY;
      this.#pitch -= event.movementY * MOUSE_SENSITIVITY;
      this.#pitch = Math.max(
        -MAX_PITCH,
        Math.min(MAX_PITCH, this.#pitch),
      );
    });

    document.addEventListener("keydown", (event) => {
      if (!this.#isPointerLocked || !MOVEMENT_KEYS.has(event.code)) {
        return;
      }

      event.preventDefault();
      this.#keys.add(event.code);
    });

    document.addEventListener("keyup", (event) => {
      this.#keys.delete(event.code);
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
  }

  update(deltaSeconds: number): void {
    const delta = Math.min(deltaSeconds, 0.05);
    const forwardX = Math.sin(this.#yaw);
    const forwardZ = -Math.cos(this.#yaw);
    const rightX = Math.cos(this.#yaw);
    const rightZ = Math.sin(this.#yaw);
    let movementX = 0;
    let movementZ = 0;

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

    const movementLength = Math.hypot(movementX, movementZ);
    if (movementLength > 0) {
      const sprinting =
        this.#keys.has("ShiftLeft") || this.#keys.has("ShiftRight");
      const speed =
        WALK_SPEED * (sprinting ? SPRINT_MULTIPLIER : 1) * delta;
      const stepX = (movementX / movementLength) * speed;
      const stepZ = (movementZ / movementLength) * speed;
      this.#moveHorizontal(stepX, stepZ);
    }

    const jumpHeld = this.#keys.has("Space");
    if (jumpHeld && !this.#jumpWasHeld && this.#onGround) {
      this.#velocityY = JUMP_SPEED;
      this.#onGround = false;
    }
    this.#jumpWasHeld = jumpHeld;

    this.#velocityY -= GRAVITY * delta;
    this.#position[1] += this.#velocityY * delta;

    const feet = this.#position[1] - PLAYER_EYE_HEIGHT;
    const ground = this.#world.groundYAt(
      this.#position[0],
      this.#position[2],
      feet + STEP_HEIGHT,
    );

    if (this.#velocityY <= 0 && feet <= ground) {
      this.#position[1] = ground + PLAYER_EYE_HEIGHT;
      this.#velocityY = 0;
      this.#onGround = true;
    } else {
      this.#onGround = false;
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
      const ground = this.#world.groundYAt(
        nextX,
        nextZ,
        feet + STEP_HEIGHT,
      );
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
