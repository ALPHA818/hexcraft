import type {
  AtmosphereState,
  WeatherKind,
} from "../environment/Atmosphere.ts";
import type { CloudLayerSample } from "../environment/CloudLayer.ts";
import type { WorldWeatherParticle } from "../environment/WorldWeatherParticles.ts";

export const WEATHER_PARTICLE_FLOATS_PER_VERTEX = 7;
export const WEATHER_PARTICLE_VERTICES_PER_PARTICLE = 6;

export type RendererAtmosphereSnapshot = Readonly<{
  lightDirection: readonly [number, number, number];
  sunDirection: readonly [number, number, number];
  moonDirection: readonly [number, number, number];
  skyTopColor: readonly [number, number, number];
  skyHorizonColor: readonly [number, number, number];
  fogColor: readonly [number, number, number];
  lightColor: readonly [number, number, number];
  fogDensity: number;
  ambient: number;
  weatherIntensity: number;
  cloudCover: number;
  daylight: number;
  timeSeconds: number;
  weather: WeatherKind;
  rendererLighting: readonly [number, number, number, number];
  cloudLayer: CloudLayerSample;
  weatherParticles: readonly WorldWeatherParticle[];
}>;

const SAFE_CLOUD_LAYER: CloudLayerSample = {
  worldU: 0,
  worldV: 0,
  wind: [1, 0],
  textureOffsetX: 0,
  textureOffsetY: 0,
  screenOffsetX: 0,
  screenOffsetY: 0,
  opacity: 0,
};

function oppositeDirection(
  direction: readonly [number, number, number],
): [number, number, number] {
  return [-direction[0], direction[1], -direction[2]];
}

function particleColor(
  kind: WeatherKind,
): readonly [number, number, number, number] {
  switch (kind) {
    case "snow":
      return [0.92, 0.97, 1, 0.74];
    case "sandstorm":
      return [0.88, 0.58, 0.22, 0.38];
    case "fog":
      return [0.88, 0.92, 0.9, 0.12];
    case "storm":
      return [0.7, 0.84, 0.92, 0.58];
    case "rain":
      return [0.72, 0.9, 1, 0.46];
    case "cloudy":
    case "clear":
      return [1, 1, 1, 0];
  }
}

function particleSize(
  kind: WeatherKind,
  length: number,
): readonly [number, number] {
  switch (kind) {
    case "snow":
      return [0.09 + length * 0.005, 0.09 + length * 0.005];
    case "sandstorm":
      return [0.06, 0.9 + length * 0.035];
    case "fog":
      return [1.2 + length * 0.11, 0.22 + length * 0.025];
    case "storm":
      return [0.025, 0.82 + length * 0.045];
    case "rain":
      return [0.025, 0.58 + length * 0.035];
    case "cloudy":
    case "clear":
      return [0, 0];
  }
}

function normalizeHorizontalDirection(
  direction: readonly [number, number, number],
): readonly [number, number] {
  const length = Math.hypot(direction[0], direction[2]);

  return length > 0.0001
    ? [direction[0] / length, direction[2] / length]
    : [0, -1];
}

export function rendererAtmosphereSnapshotFromState(
  state: AtmosphereState,
): RendererAtmosphereSnapshot {
  const world = state.worldAtmosphere;

  return {
    lightDirection: state.lightDirection,
    sunDirection: world?.celestial.sunDirection ?? state.lightDirection,
    moonDirection:
      world?.celestial.moonDirection ?? oppositeDirection(state.lightDirection),
    skyTopColor: world?.celestial.skyColor ?? state.fogColor,
    skyHorizonColor: world?.celestial.horizonColor ?? state.fogColor,
    fogColor: state.fogColor,
    lightColor: state.lightColor,
    fogDensity: state.fogDensity ?? state.weatherIntensity,
    ambient: state.ambient,
    weatherIntensity: state.weatherIntensity,
    cloudCover: state.cloudCover,
    daylight: state.daylight,
    timeSeconds: state.timeSeconds,
    weather: state.weather,
    rendererLighting: state.rendererLighting,
    cloudLayer: world?.clouds ?? SAFE_CLOUD_LAYER,
    weatherParticles: state.weatherParticles ?? [],
  };
}

export function weatherParticleVertexFloatCount(particleCount: number): number {
  return (
    Math.max(0, particleCount) *
    WEATHER_PARTICLE_VERTICES_PER_PARTICLE *
    WEATHER_PARTICLE_FLOATS_PER_VERTEX
  );
}

export function writeWeatherParticleVertices(
  target: Float32Array,
  snapshot: RendererAtmosphereSnapshot,
  cameraDirection: readonly [number, number, number],
): number {
  const [forwardX, forwardZ] = normalizeHorizontalDirection(cameraDirection);
  const cameraRight: readonly [number, number, number] = [
    -forwardZ,
    0,
    forwardX,
  ];
  const cloudWind = snapshot.cloudLayer.wind;
  let offset = 0;
  let vertexCount = 0;

  for (const particle of snapshot.weatherParticles) {
    const [width, height] = particleSize(particle.kind, particle.length);
    const color = particleColor(particle.kind);

    if (width <= 0 || height <= 0 || color[3] <= 0) {
      continue;
    }

    const axis =
      particle.kind === "sandstorm" || particle.kind === "fog"
        ? ([
            cloudWind[0] * height,
            particle.kind === "fog" ? Math.sin(particle.phase) * 0.08 : 0,
            cloudWind[1] * height,
          ] as const)
        : ([
            (cloudWind[0] * 0.18 + particle.drift * 0.2) * height,
            -height,
            (cloudWind[1] * 0.18 + particle.drift * 0.08) * height,
          ] as const);
    const side: readonly [number, number, number] = [
      cameraRight[0] * width,
      cameraRight[1] * width,
      cameraRight[2] * width,
    ];
    const center: readonly [number, number, number] = [
      particle.worldX,
      particle.worldY,
      particle.worldZ,
    ];
    const corners = [
      [
        center[0] - side[0] - axis[0] * 0.5,
        center[1] - side[1] - axis[1] * 0.5,
        center[2] - side[2] - axis[2] * 0.5,
      ],
      [
        center[0] + side[0] - axis[0] * 0.5,
        center[1] + side[1] - axis[1] * 0.5,
        center[2] + side[2] - axis[2] * 0.5,
      ],
      [
        center[0] + side[0] + axis[0] * 0.5,
        center[1] + side[1] + axis[1] * 0.5,
        center[2] + side[2] + axis[2] * 0.5,
      ],
      [
        center[0] - side[0] + axis[0] * 0.5,
        center[1] - side[1] + axis[1] * 0.5,
        center[2] - side[2] + axis[2] * 0.5,
      ],
    ] as const;
    const triangles = [
      corners[0],
      corners[1],
      corners[2],
      corners[0],
      corners[2],
      corners[3],
    ];

    if (
      offset + triangles.length * WEATHER_PARTICLE_FLOATS_PER_VERTEX >
      target.length
    ) {
      break;
    }

    for (const vertex of triangles) {
      target[offset++] = vertex[0];
      target[offset++] = vertex[1];
      target[offset++] = vertex[2];
      target[offset++] = color[0];
      target[offset++] = color[1];
      target[offset++] = color[2];
      target[offset++] = color[3];
      vertexCount += 1;
    }
  }

  return vertexCount;
}
