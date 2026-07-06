import { BLOCK_TEXTURE_TILE_COUNT } from "./blockTextureAtlas.ts";

export const hexPrismShader = /* wgsl */ `
struct Uniforms {
  model_view_projection: mat4x4<f32>,
  model: mat4x4<f32>,
  light_view_projection: mat4x4<f32>,
  light_direction: vec4<f32>,
  camera_position: vec4<f32>,
  light_color: vec4<f32>,
  fog_color: vec4<f32>,
  environment: vec4<f32>,
  lighting: vec4<f32>,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

@group(0) @binding(1)
var block_sampler: sampler;

@group(0) @binding(2)
var block_atlas: texture_2d<f32>;

@group(0) @binding(3)
var shadow_sampler: sampler_comparison;

@group(0) @binding(4)
var shadow_map: texture_depth_2d;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) color: vec3<f32>,
  @location(3) uv: vec2<f32>,
}

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) world_normal: vec3<f32>,
  @location(1) color: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) world_position: vec3<f32>,
  @location(4) light_position: vec4<f32>,
}

@vertex
fn vertex_main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let world_position = uniforms.model * vec4<f32>(input.position, 1.0);
  output.position = uniforms.model_view_projection * vec4<f32>(input.position, 1.0);
  output.world_normal =
    normalize((uniforms.model * vec4<f32>(input.normal, 0.0)).xyz);
  output.color = input.color;
  output.uv = input.uv;
  output.world_position = world_position.xyz;
  output.light_position = uniforms.light_view_projection * world_position;
  return output;
}

fn calculate_shadow(
  light_position: vec4<f32>,
  normal: vec3<f32>,
  direction_to_light: vec3<f32>,
) -> f32 {
  let projected = light_position.xyz / light_position.w;
  let uv = vec2<f32>(projected.x * 0.5 + 0.5, projected.y * -0.5 + 0.5);
  let depth = projected.z;
  if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0 || depth >= 1.0) {
    return 1.0;
  }

  let bias = max(0.0028 * (1.0 - dot(normal, direction_to_light)), 0.0007);
  let dimensions = vec2<f32>(textureDimensions(shadow_map));
  let texel = 1.0 / dimensions;
  var visibility = 0.0;
  for (var x = -1; x <= 1; x = x + 1) {
    for (var y = -1; y <= 1; y = y + 1) {
      visibility += textureSampleCompare(
        shadow_map,
        shadow_sampler,
        uv + vec2<f32>(f32(x), f32(y)) * texel,
        depth - bias,
      );
    }
  }
  return visibility / 9.0;
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let ambient = uniforms.environment.x;
  let time = uniforms.environment.z;
  let flow_time = time;
  let daylight = uniforms.environment.w;
  let sunlight = uniforms.lighting.x;
  let minimum_ambient = uniforms.lighting.y;
  let fog_start = uniforms.lighting.z;
  let fog_end = uniforms.lighting.w;
  var normal = normalize(input.world_normal);
  let tile = floor(input.uv.x * ${BLOCK_TEXTURE_TILE_COUNT}.0);
  let water = abs(tile - 8.0) < 0.5;
  let leaves = abs(tile - 11.0) < 0.5;
  var sample_uv = input.uv;

  if (water) {
    let tile_start = 8.0 / ${BLOCK_TEXTURE_TILE_COUNT}.0;
    let local_uv = vec2<f32>(
      fract(input.uv.x * ${BLOCK_TEXTURE_TILE_COUNT}.0),
      fract(input.uv.y),
    );
    let water_top = normal.y > 0.7;

    if (water_top) {
      let flow_direction = normalize(vec2<f32>(0.82, -0.57));
      var flowing_uv = fract(
        local_uv * 1.65 +
        flow_direction * flow_time * 0.34 +
        vec2<f32>(
          sin(input.world_position.z * 1.8 + flow_time * 1.7),
          cos(input.world_position.x * 1.6 - flow_time * 1.4),
        ) * 0.055
      );
      sample_uv = vec2<f32>(
        tile_start + flowing_uv.x / ${BLOCK_TEXTURE_TILE_COUNT}.0,
        flowing_uv.y,
      );

      normal = normalize(normal + vec3<f32>(
        sin(input.world_position.z * 1.8 + flow_time * 2.2) * 0.1,
        0.0,
        cos(input.world_position.x * 1.6 - flow_time * 1.9) * 0.1,
      ));
    } else {
      var flowing_uv = fract(vec2<f32>(
        local_uv.x * 1.35 +
          sin(input.world_position.y * 2.0 + flow_time) * 0.045,
        local_uv.y * 1.8 - flow_time * 0.72,
      ));
      sample_uv = vec2<f32>(
        tile_start + flowing_uv.x / ${BLOCK_TEXTURE_TILE_COUNT}.0,
        flowing_uv.y,
      );
    }
  }

  let direction_to_light = normalize(-uniforms.light_direction.xyz);
  let diffuse = max(dot(normal, direction_to_light), 0.0);
  let shadow = calculate_shadow(input.light_position, normal, direction_to_light);
  let light = max(minimum_ambient, ambient + diffuse * shadow * sunlight);
  let texel = textureSample(block_atlas, block_sampler, sample_uv);
  if (leaves && texel.a < 0.35) {
    discard;
  }
  var color = texel.rgb * input.color * light * uniforms.light_color.rgb;

  if (water) {
    let view_direction = normalize(uniforms.camera_position.xyz - input.world_position);
    let fresnel = pow(1.0 - max(dot(normal, view_direction), 0.0), 3.0);
    let sparkle = pow(
      max(dot(reflect(-direction_to_light, normal), view_direction), 0.0),
      56.0,
    );
    let reflected_sky = mix(
      vec3<f32>(0.08, 0.24, 0.34),
      uniforms.fog_color.rgb,
      0.72,
    );
    color = mix(color, reflected_sky, 0.28 + fresnel * 0.55);
    color += uniforms.light_color.rgb * sparkle * shadow * (0.7 + daylight * 0.8);
  }

  let camera_distance =
    distance(input.world_position, uniforms.camera_position.xyz);
  let fog = smoothstep(fog_start, fog_end, camera_distance);
  let alpha = select(1.0, 0.64, water);
  return vec4<f32>(mix(color, uniforms.fog_color.rgb, fog), alpha);
}
`;

export const shadowShader = /* wgsl */ `
struct Uniforms {
  model_view_projection: mat4x4<f32>,
  model: mat4x4<f32>,
  light_view_projection: mat4x4<f32>,
  light_direction: vec4<f32>,
  camera_position: vec4<f32>,
  light_color: vec4<f32>,
  fog_color: vec4<f32>,
  environment: vec4<f32>,
  lighting: vec4<f32>,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

@vertex
fn shadow_vertex(@location(0) position: vec3<f32>) -> @builtin(position) vec4<f32> {
  return uniforms.light_view_projection * uniforms.model * vec4<f32>(position, 1.0);
}
`;

export const atmosphereParticleShader = /* wgsl */ `
struct Uniforms {
  model_view_projection: mat4x4<f32>,
  model: mat4x4<f32>,
  light_view_projection: mat4x4<f32>,
  light_direction: vec4<f32>,
  camera_position: vec4<f32>,
  light_color: vec4<f32>,
  fog_color: vec4<f32>,
  environment: vec4<f32>,
  lighting: vec4<f32>,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

struct ParticleInput {
  @location(0) position: vec3<f32>,
  @location(1) color: vec4<f32>,
}

struct ParticleOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
  @location(1) world_position: vec3<f32>,
}

@vertex
fn atmosphere_particle_vertex(input: ParticleInput) -> ParticleOutput {
  var output: ParticleOutput;
  output.position = uniforms.model_view_projection * vec4<f32>(input.position, 1.0);
  output.color = input.color;
  output.world_position = input.position;
  return output;
}

@fragment
fn atmosphere_particle_fragment(input: ParticleOutput) -> @location(0) vec4<f32> {
  let camera_distance = distance(input.world_position, uniforms.camera_position.xyz);
  let fog_amount = smoothstep(uniforms.lighting.z, uniforms.lighting.w, camera_distance);
  let color = mix(input.color.rgb, uniforms.fog_color.rgb, fog_amount * 0.42);
  return vec4<f32>(color, input.color.a);
}
`;
