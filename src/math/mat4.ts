export type Mat4 = Float32Array;
export type Vec3 = readonly [number, number, number];

export function identity(): Mat4 {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const output = new Float32Array(16);

  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      output[column * 4 + row] =
        a[row]! * b[column * 4]! +
        a[4 + row]! * b[column * 4 + 1]! +
        a[8 + row]! * b[column * 4 + 2]! +
        a[12 + row]! * b[column * 4 + 3]!;
    }
  }

  return output;
}

export function perspective(
  verticalFieldOfView: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 {
  const focalLength = 1 / Math.tan(verticalFieldOfView / 2);
  const rangeInverse = 1 / (near - far);

  return new Float32Array([
    focalLength / aspect,
    0,
    0,
    0,
    0,
    focalLength,
    0,
    0,
    0,
    0,
    far * rangeInverse,
    -1,
    0,
    0,
    far * near * rangeInverse,
    0,
  ]);
}

export function perspectiveWebGl(
  verticalFieldOfView: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 {
  const focalLength = 1 / Math.tan(verticalFieldOfView / 2);
  const rangeInverse = 1 / (near - far);

  return new Float32Array([
    focalLength / aspect,
    0,
    0,
    0,
    0,
    focalLength,
    0,
    0,
    0,
    0,
    (far + near) * rangeInverse,
    -1,
    0,
    0,
    2 * far * near * rangeInverse,
    0,
  ]);
}

export function orthographic(
  left: number,
  right: number,
  bottom: number,
  top: number,
  near: number,
  far: number,
): Mat4 {
  return new Float32Array([
    2 / (right - left),
    0,
    0,
    0,
    0,
    2 / (top - bottom),
    0,
    0,
    0,
    0,
    1 / (near - far),
    0,
    -(right + left) / (right - left),
    -(top + bottom) / (top - bottom),
    near / (near - far),
    1,
  ]);
}

export function orthographicWebGl(
  left: number,
  right: number,
  bottom: number,
  top: number,
  near: number,
  far: number,
): Mat4 {
  return new Float32Array([
    2 / (right - left),
    0,
    0,
    0,
    0,
    2 / (top - bottom),
    0,
    0,
    0,
    0,
    -2 / (far - near),
    0,
    -(right + left) / (right - left),
    -(top + bottom) / (top - bottom),
    -(far + near) / (far - near),
    1,
  ]);
}

export function rotationY(radians: number): Mat4 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);

  return new Float32Array([
    cosine,
    0,
    -sine,
    0,
    0,
    1,
    0,
    0,
    sine,
    0,
    cosine,
    0,
    0,
    0,
    0,
    1,
  ]);
}

function normalize([x, y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, y, z);
  return length > 0 ? [x / length, y / length, z / length] : [0, 0, 0];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const zAxis = normalize(subtract(eye, target));
  const xAxis = normalize(cross(up, zAxis));
  const yAxis = cross(zAxis, xAxis);

  return new Float32Array([
    xAxis[0],
    yAxis[0],
    zAxis[0],
    0,
    xAxis[1],
    yAxis[1],
    zAxis[1],
    0,
    xAxis[2],
    yAxis[2],
    zAxis[2],
    0,
    -dot(xAxis, eye),
    -dot(yAxis, eye),
    -dot(zAxis, eye),
    1,
  ]);
}
