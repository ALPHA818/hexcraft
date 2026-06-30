import {
  TERRAIN_BASE_Y,
  TERRAIN_BLOCK_HEIGHT,
  TERRAIN_BLOCK_RADIUS,
  TerrainMaterial,
} from "../geometry/terrainChunk.ts";
import type { FirstPersonCamera } from "../input/FirstPersonCamera.ts";
import {
  multiply,
  perspectiveWebGl,
  type Mat4,
  type Vec3,
} from "../math/mat4.ts";
import {
  axialToWorld,
  type VoxelRaycastHit,
} from "../world/InfiniteTerrain.ts";

type ScreenPoint = Readonly<{
  x: number;
  y: number;
}>;

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const TARGET_FIELD_OF_VIEW = Math.PI / 3;
const TARGET_NEAR_PLANE = 0.1;
const TARGET_FAR_PLANE = 48;

function transformPoint(
  matrix: Mat4,
  point: Vec3,
): readonly [x: number, y: number, z: number, w: number] {
  const [x, y, z] = point;

  return [
    matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!,
    matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!,
    matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!,
    matrix[3]! * x + matrix[7]! * y + matrix[11]! * z + matrix[15]!,
  ];
}

function projectPoint(
  matrix: Mat4,
  point: Vec3,
  viewport: DOMRect,
): ScreenPoint | null {
  const [clipX, clipY, , clipW] = transformPoint(matrix, point);

  if (clipW <= 0.001) {
    return null;
  }

  const normalizedX = clipX / clipW;
  const normalizedY = clipY / clipW;

  return {
    x: viewport.left + (normalizedX * 0.5 + 0.5) * viewport.width,
    y: viewport.top + (-normalizedY * 0.5 + 0.5) * viewport.height,
  };
}

function hexPrismVertices(target: VoxelRaycastHit): readonly Vec3[] {
  const center = axialToWorld(target.voxel.q, target.voxel.r);
  const lowerY = TERRAIN_BASE_Y + target.voxel.level * TERRAIN_BLOCK_HEIGHT;
  const upperY =
    lowerY +
    TERRAIN_BLOCK_HEIGHT *
      (target.material === TerrainMaterial.Water ? 0.86 : 1);
  const vertices: Vec3[] = [];

  for (let side = 0; side < 6; side += 1) {
    const angle = -Math.PI / 6 + side * (Math.PI / 3);
    vertices.push([
      center.x + Math.cos(angle) * TERRAIN_BLOCK_RADIUS,
      upperY,
      center.z + Math.sin(angle) * TERRAIN_BLOCK_RADIUS,
    ]);
  }

  for (let side = 0; side < 6; side += 1) {
    const angle = -Math.PI / 6 + side * (Math.PI / 3);
    vertices.push([
      center.x + Math.cos(angle) * TERRAIN_BLOCK_RADIUS,
      lowerY,
      center.z + Math.sin(angle) * TERRAIN_BLOCK_RADIUS,
    ]);
  }

  return vertices;
}

function outlinePath(points: readonly ScreenPoint[]): string {
  const segments: string[] = [];

  for (let side = 0; side < 6; side += 1) {
    const next = (side + 1) % 6;
    const top = points[side]!;
    const topNext = points[next]!;
    const bottom = points[side + 6]!;
    const bottomNext = points[next + 6]!;

    segments.push(
      `M ${top.x.toFixed(1)} ${top.y.toFixed(1)} L ${topNext.x.toFixed(1)} ${topNext.y.toFixed(1)}`,
      `M ${bottom.x.toFixed(1)} ${bottom.y.toFixed(1)} L ${bottomNext.x.toFixed(1)} ${bottomNext.y.toFixed(1)}`,
      `M ${top.x.toFixed(1)} ${top.y.toFixed(1)} L ${bottom.x.toFixed(1)} ${bottom.y.toFixed(1)}`,
    );
  }

  return segments.join(" ");
}

function highlightedFacePointIndexes(
  target: VoxelRaycastHit,
): readonly number[] {
  if (target.face === "top") {
    return [0, 1, 2, 3, 4, 5];
  }

  if (target.face === "bottom") {
    return [11, 10, 9, 8, 7, 6];
  }

  const next = (target.face + 1) % 6;
  return [target.face, next, next + 6, target.face + 6];
}

function polygonPoints(
  points: readonly ScreenPoint[],
  indexes: readonly number[],
): string {
  return indexes
    .map(
      (index) =>
        `${points[index]!.x.toFixed(1)},${points[index]!.y.toFixed(1)}`,
    )
    .join(" ");
}

export class TargetHighlight {
  readonly #canvas: HTMLCanvasElement;
  readonly #root: SVGSVGElement;
  readonly #outline: SVGPathElement;
  readonly #face: SVGPolygonElement;

  constructor(canvas: HTMLCanvasElement) {
    this.#canvas = canvas;
    this.#root = document.createElementNS(SVG_NAMESPACE, "svg");
    this.#outline = document.createElementNS(SVG_NAMESPACE, "path");
    this.#face = document.createElementNS(SVG_NAMESPACE, "polygon");

    this.#root.classList.add("target-highlight");
    this.#root.setAttribute("aria-hidden", "true");
    this.#outline.classList.add("target-highlight-outline");
    this.#face.classList.add("target-highlight-face");
    this.#root.append(this.#face, this.#outline);
    document.body.append(this.#root);
    this.clear();
  }

  update(target: VoxelRaycastHit | null, camera: FirstPersonCamera): void {
    if (!target) {
      this.clear();
      return;
    }

    const viewport = this.#canvas.getBoundingClientRect();
    if (viewport.width <= 0 || viewport.height <= 0) {
      this.clear();
      return;
    }

    const projection = perspectiveWebGl(
      TARGET_FIELD_OF_VIEW,
      viewport.width / viewport.height,
      TARGET_NEAR_PLANE,
      TARGET_FAR_PLANE,
    );
    const viewProjection = multiply(projection, camera.viewMatrix());
    const projected = hexPrismVertices(target).map((point) =>
      projectPoint(viewProjection, point, viewport),
    );

    if (projected.some((point) => point === null)) {
      this.clear();
      return;
    }

    const points = projected as ScreenPoint[];
    const viewportWidth = Math.max(1, document.documentElement.clientWidth);
    const viewportHeight = Math.max(1, document.documentElement.clientHeight);

    this.#root.setAttribute(
      "viewBox",
      `0 0 ${viewportWidth} ${viewportHeight}`,
    );
    this.#outline.setAttribute("d", outlinePath(points));
    this.#face.setAttribute(
      "points",
      polygonPoints(points, highlightedFacePointIndexes(target)),
    );
    this.#root.removeAttribute("hidden");
  }

  clear(): void {
    this.#root.setAttribute("hidden", "");
    this.#outline.removeAttribute("d");
    this.#face.removeAttribute("points");
  }

  destroy(): void {
    this.#root.remove();
  }
}
