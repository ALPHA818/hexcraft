export const hexPrismShader = /* wgsl */ `
struct Uniforms {
  model_view_projection: mat4x4<f32>,
  model: mat4x4<f32>,
  light_direction: vec4<f32>,
  camera_position: vec4<f32>,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

@group(0) @binding(1)
var block_sampler: sampler;

@group(0) @binding(2)
var block_atlas: texture_2d<f32>;

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
}

@vertex
fn vertex_main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position =
    uniforms.model_view_projection * vec4<f32>(input.position, 1.0);
  output.world_normal =
    normalize((uniforms.model * vec4<f32>(input.normal, 0.0)).xyz);
  output.color = input.color;
  output.uv = input.uv;
  output.world_position =
    (uniforms.model * vec4<f32>(input.position, 1.0)).xyz;
  return output;
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let normal = normalize(input.world_normal);
  let direction_to_light = normalize(-uniforms.light_direction.xyz);
  let diffuse = max(dot(normal, direction_to_light), 0.0);
  let light = 0.28 + diffuse * 0.72;
  let texel = textureSample(block_atlas, block_sampler, input.uv).rgb;
  let color = texel * input.color * light;
  let camera_distance =
    distance(input.world_position, uniforms.camera_position.xyz);
  let fog = smoothstep(32.0, 47.0, camera_distance);
  let fog_color = vec3<f32>(0.55, 0.72, 0.82);
  return vec4<f32>(mix(color, fog_color, fog), 1.0);
}
`;
