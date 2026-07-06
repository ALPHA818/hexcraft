import {
  lookAt,
  multiply,
  orthographic,
  orthographicWebGl,
  type Mat4,
  type Vec3,
} from "../math/mat4.ts";

export function lightViewProjection(
  cameraPosition: Vec3,
  atmosphere: Readonly<{ lightDirection: readonly [number, number, number] }>,
  webGl: boolean,
): Mat4 {
  const target: Vec3 = [
    Math.round(cameraPosition[0] / 2) * 2,
    cameraPosition[1] - 4,
    Math.round(cameraPosition[2] / 2) * 2,
  ];
  const direction = atmosphere.lightDirection;
  const eye: Vec3 = [
    target[0] - direction[0] * 42,
    target[1] - direction[1] * 42,
    target[2] - direction[2] * 42,
  ];
  const view = lookAt(eye, target, [0, 1, 0]);
  const projection = webGl
    ? orthographicWebGl(-28, 28, -28, 28, 1, 82)
    : orthographic(-28, 28, -28, 28, 1, 82);

  return multiply(projection, view);
}
