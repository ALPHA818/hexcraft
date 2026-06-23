import type { MeshData } from "../geometry/hexPrism.ts";
import type { Atmosphere } from "../environment/Atmosphere.ts";
import type { FirstPersonCamera } from "../input/FirstPersonCamera.ts";
import { DEVICE_PROFILE } from "../platform/deviceProfile.ts";
import { createBlockTextureAtlas } from "./blockTextureAtlas.ts";
import {
  identity,
  multiply,
  perspectiveWebGl,
} from "../math/mat4.ts";
import { lightViewProjection } from "./lighting.ts";

const SHADOW_MAP_SIZE = DEVICE_PROFILE.shadowMapSize;
const ATLAS_TILE_COUNT = 13;

const VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in vec3 color;
layout(location = 3) in vec2 uv;

uniform mat4 model_view_projection;
uniform mat4 model;
uniform mat4 light_view_projection;
uniform vec3 camera_position;

out vec3 world_normal;
out vec3 vertex_color;
out vec2 texture_uv;
out vec3 world_position;
out vec4 light_position;

void main() {
  gl_Position = model_view_projection * vec4(position, 1.0);
  world_normal = normalize((model * vec4(normal, 0.0)).xyz);
  vertex_color = color;
  texture_uv = uv;
  world_position = (model * vec4(position, 1.0)).xyz;
  light_position = light_view_projection * vec4(world_position, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec3 world_normal;
in vec3 vertex_color;
in vec2 texture_uv;
in vec3 world_position;
in vec4 light_position;

uniform vec3 light_direction;
uniform vec3 light_color;
uniform vec3 fog_color;
uniform vec3 camera_position;
uniform sampler2D block_atlas;
uniform sampler2D shadow_map;
uniform vec4 environment;

out vec4 output_color;

float calculate_shadow(vec3 normal, vec3 direction_to_light) {
  vec3 projected = light_position.xyz / light_position.w;
  vec2 uv = projected.xy * 0.5 + 0.5;
  float depth = projected.z * 0.5 + 0.5;
  if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0 || depth >= 1.0) {
    return 1.0;
  }

  float bias = max(0.0028 * (1.0 - dot(normal, direction_to_light)), 0.0007);
  vec2 texel = 1.0 / vec2(textureSize(shadow_map, 0));
  float visibility = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      float closest = texture(shadow_map, uv + vec2(x, y) * texel).r;
      visibility += depth - bias <= closest ? 1.0 : 0.0;
    }
  }
  return visibility / 9.0;
}

void main() {
  float ambient = environment.x;
  float weather = environment.y;
  float time = environment.z;
  float daylight = environment.w;
  vec3 normal = normalize(world_normal);
  float tile = floor(texture_uv.x * ${ATLAS_TILE_COUNT}.0);
  bool water = abs(tile - 8.0) < 0.5;
  bool leaves = abs(tile - 11.0) < 0.5;
  vec2 sample_uv = texture_uv;
  if (water) {
    float tile_start = 8.0 / ${ATLAS_TILE_COUNT}.0;
    float local_u = fract(texture_uv.x * ${ATLAS_TILE_COUNT}.0);
    local_u += sin(world_position.x * 1.7 + time * 1.9) * 0.022;
    local_u += cos(world_position.z * 1.35 - time * 1.4) * 0.018;
    sample_uv.x = tile_start + clamp(local_u, 0.025, 0.975) / ${ATLAS_TILE_COUNT}.0;
    sample_uv.y += sin((world_position.x + world_position.z) * 1.2 + time * 2.2) * 0.018;
    normal = normalize(normal + vec3(
      sin(world_position.z * 1.8 + time * 2.1) * 0.12,
      0.0,
      cos(world_position.x * 1.6 - time * 1.7) * 0.12
    ));
  }
  vec3 direction_to_light = normalize(-light_direction);
  float diffuse = max(dot(normal, direction_to_light), 0.0);
  float shadow = calculate_shadow(normal, direction_to_light);
  float light = ambient + diffuse * shadow * (0.82 - weather * 0.22);
  vec4 texel = texture(block_atlas, sample_uv);
  if (leaves && texel.a < 0.35) {
    discard;
  }
  vec3 color = texel.rgb * vertex_color * light * light_color;

  if (water) {
    vec3 view_direction = normalize(camera_position - world_position);
    float fresnel = pow(1.0 - max(dot(normal, view_direction), 0.0), 3.0);
    float sparkle = pow(max(dot(reflect(-direction_to_light, normal), view_direction), 0.0), 56.0);
    vec3 reflected_sky = mix(vec3(0.08, 0.24, 0.34), fog_color, 0.72);
    color = mix(color, reflected_sky, 0.28 + fresnel * 0.55);
    color += light_color * sparkle * shadow * (0.7 + daylight * 0.8);
  }

  float camera_distance = distance(world_position, camera_position);
  float fog_start = mix(32.0, 19.0, weather);
  float fog = smoothstep(fog_start, 47.0, camera_distance);
  float alpha = water ? 0.64 : 1.0;
  output_color = vec4(mix(color, fog_color, fog), alpha);
}
`;

const SHADOW_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec3 position;
uniform mat4 light_view_projection;

void main() {
  gl_Position = light_view_projection * vec4(position, 1.0);
}
`;

const SHADOW_FRAGMENT_SHADER = `#version 300 es
precision highp float;
void main() {}
`;

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error("Could not create a WebGL shader.");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown shader error.";
    gl.deleteShader(shader);
    throw new Error(`WebGL shader compilation failed: ${message}`);
  }

  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    FRAGMENT_SHADER,
  );
  const program = gl.createProgram();

  if (!program) {
    throw new Error("Could not create the WebGL shader program.");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "Unknown link error.";
    gl.deleteProgram(program);
    throw new Error(`WebGL shader linking failed: ${message}`);
  }

  return program;
}

function createShadowProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertexShader = compileShader(
    gl,
    gl.VERTEX_SHADER,
    SHADOW_VERTEX_SHADER,
  );
  const fragmentShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    SHADOW_FRAGMENT_SHADER,
  );
  const program = gl.createProgram();

  if (!program) {
    throw new Error("Could not create the WebGL shadow program.");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(
      `WebGL shadow linking failed: ${gl.getProgramInfoLog(program) ?? "unknown error"}`,
    );
  }
  return program;
}

function requireUniform(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);

  if (!location) {
    throw new Error(`WebGL uniform "${name}" was not found.`);
  }

  return location;
}

export class WebGlRenderer {
  readonly #canvas: HTMLCanvasElement;
  readonly #gl: WebGL2RenderingContext;
  readonly #program: WebGLProgram;
  readonly #shadowProgram: WebGLProgram;
  readonly #shadowFramebuffer: WebGLFramebuffer;
  readonly #shadowTexture: WebGLTexture;
  readonly #blockTexture: WebGLTexture;
  readonly #vertexArray: WebGLVertexArrayObject;
  readonly #vertexBuffer: WebGLBuffer;
  readonly #modelViewProjectionLocation: WebGLUniformLocation;
  readonly #modelLocation: WebGLUniformLocation;
  readonly #lightViewProjectionLocation: WebGLUniformLocation;
  readonly #lightDirectionLocation: WebGLUniformLocation;
  readonly #lightColorLocation: WebGLUniformLocation;
  readonly #fogColorLocation: WebGLUniformLocation;
  readonly #environmentLocation: WebGLUniformLocation;
  readonly #cameraPositionLocation: WebGLUniformLocation;
  readonly #blockAtlasLocation: WebGLUniformLocation;
  readonly #shadowMapLocation: WebGLUniformLocation;
  readonly #shadowLightViewProjectionLocation: WebGLUniformLocation;

  #animationFrame = 0;
  #lastFrameTime = 0;
  #opaqueVertexCount: number;
  #translucentVertexCount: number;

  private constructor(
    canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
    mesh: MeshData,
  ) {
    this.#canvas = canvas;
    this.#gl = gl;
    this.#program = createProgram(gl);
    this.#shadowProgram = createShadowProgram(gl);

    this.#modelViewProjectionLocation = requireUniform(
      gl,
      this.#program,
      "model_view_projection",
    );
    this.#modelLocation = requireUniform(gl, this.#program, "model");
    this.#lightViewProjectionLocation = requireUniform(
      gl,
      this.#program,
      "light_view_projection",
    );
    this.#lightDirectionLocation = requireUniform(
      gl,
      this.#program,
      "light_direction",
    );
    this.#cameraPositionLocation = requireUniform(
      gl,
      this.#program,
      "camera_position",
    );
    this.#lightColorLocation = requireUniform(
      gl,
      this.#program,
      "light_color",
    );
    this.#fogColorLocation = requireUniform(
      gl,
      this.#program,
      "fog_color",
    );
    this.#environmentLocation = requireUniform(
      gl,
      this.#program,
      "environment",
    );
    this.#blockAtlasLocation = requireUniform(
      gl,
      this.#program,
      "block_atlas",
    );
    this.#shadowMapLocation = requireUniform(
      gl,
      this.#program,
      "shadow_map",
    );
    this.#shadowLightViewProjectionLocation = requireUniform(
      gl,
      this.#shadowProgram,
      "light_view_projection",
    );

    this.#opaqueVertexCount = mesh.opaqueVertexCount ?? mesh.vertexCount;
    this.#translucentVertexCount = mesh.translucentVertexCount ?? 0;

    const vertexArray = gl.createVertexArray();
    const vertexBuffer = gl.createBuffer();

    if (!vertexArray || !vertexBuffer) {
      throw new Error("Could not allocate the WebGL prism geometry.");
    }

    this.#vertexArray = vertexArray;
    this.#vertexBuffer = vertexBuffer;
    gl.bindVertexArray(vertexArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);

    const stride = mesh.floatsPerVertex * Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(
      1,
      3,
      gl.FLOAT,
      false,
      stride,
      3 * Float32Array.BYTES_PER_ELEMENT,
    );
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(
      2,
      3,
      gl.FLOAT,
      false,
      stride,
      6 * Float32Array.BYTES_PER_ELEMENT,
    );
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(
      3,
      2,
      gl.FLOAT,
      false,
      stride,
      9 * Float32Array.BYTES_PER_ELEMENT,
    );

    const atlas = createBlockTextureAtlas();
    const blockTexture = gl.createTexture();

    if (!blockTexture) {
      throw new Error("Could not allocate the block texture atlas.");
    }
    this.#blockTexture = blockTexture;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, blockTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      atlas.width,
      atlas.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      atlas.pixels,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const shadowTexture = gl.createTexture();
    const shadowFramebuffer = gl.createFramebuffer();
    if (!shadowTexture || !shadowFramebuffer) {
      throw new Error("Could not allocate the WebGL shadow map.");
    }
    this.#shadowTexture = shadowTexture;
    this.#shadowFramebuffer = shadowFramebuffer;
    gl.bindTexture(gl.TEXTURE_2D, shadowTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.DEPTH_COMPONENT24,
      SHADOW_MAP_SIZE,
      SHADOW_MAP_SIZE,
      0,
      gl.DEPTH_COMPONENT,
      gl.UNSIGNED_INT,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFramebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.DEPTH_ATTACHMENT,
      gl.TEXTURE_2D,
      shadowTexture,
      0,
    );
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("The WebGL shadow framebuffer is incomplete.");
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
  }

  static create(
    canvas: HTMLCanvasElement,
    mesh: MeshData,
  ): WebGlRenderer {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: true,
      depth: true,
      powerPreference: "high-performance",
    });

    if (!gl) {
      throw new Error("Neither WebGPU nor WebGL 2 is available.");
    }

    return new WebGlRenderer(canvas, gl, mesh);
  }

  start(
    camera: FirstPersonCamera,
    atmosphere: Atmosphere,
    onFrame: () => void,
    onContextLost: (reason: string) => void,
  ): void {
    this.#canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      cancelAnimationFrame(this.#animationFrame);
      onContextLost("WebGL context lost.");
    });

    const renderFrame = (time: number): void => {
      const deltaSeconds =
        this.#lastFrameTime === 0 ? 0 : (time - this.#lastFrameTime) / 1000;
      this.#lastFrameTime = time;
      camera.update(deltaSeconds);
      atmosphere.update(deltaSeconds);
      onFrame();
      this.#render(camera, atmosphere);
      this.#animationFrame = requestAnimationFrame(renderFrame);
    };

    this.#animationFrame = requestAnimationFrame(renderFrame);
  }

  updateMesh(mesh: MeshData): void {
    const gl = this.#gl;
    gl.bindVertexArray(this.#vertexArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
    this.#opaqueVertexCount = mesh.opaqueVertexCount ?? mesh.vertexCount;
    this.#translucentVertexCount = mesh.translucentVertexCount ?? 0;
  }

  #resize(): void {
    const scale = Math.min(
      window.devicePixelRatio,
      DEVICE_PROFILE.maxPixelRatio,
    );
    const width = Math.max(
      1,
      Math.floor(this.#canvas.clientWidth * scale),
    );
    const height = Math.max(
      1,
      Math.floor(this.#canvas.clientHeight * scale),
    );

    if (this.#canvas.width !== width || this.#canvas.height !== height) {
      this.#canvas.width = width;
      this.#canvas.height = height;
    }

    this.#gl.viewport(0, 0, width, height);
  }

  #render(camera: FirstPersonCamera, atmosphere: Atmosphere): void {
    this.#resize();

    const model = identity();
    const view = camera.viewMatrix();
    const projection = perspectiveWebGl(
      Math.PI / 3,
      this.#canvas.width / this.#canvas.height,
      0.1,
      48,
    );
    const modelViewProjection = multiply(
      projection,
      multiply(view, model),
    );
    const environment = atmosphere.state();
    const lightMatrix = lightViewProjection(
      camera.position(),
      environment,
      true,
    );

    const gl = this.#gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.#shadowFramebuffer);
    gl.viewport(0, 0, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    gl.clearDepth(1);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.#shadowProgram);
    gl.bindVertexArray(this.#vertexArray);
    gl.uniformMatrix4fv(
      this.#shadowLightViewProjectionLocation,
      false,
      lightMatrix,
    );
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(2, 4);
    gl.cullFace(gl.FRONT);
    gl.drawArrays(gl.TRIANGLES, 0, this.#opaqueVertexCount);
    gl.cullFace(gl.BACK);
    gl.disable(gl.POLYGON_OFFSET_FILL);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.#program);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.#shadowTexture);
    gl.uniform1i(this.#shadowMapLocation, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.#blockTexture);
    gl.uniform1i(this.#blockAtlasLocation, 0);
    gl.bindVertexArray(this.#vertexArray);
    gl.uniformMatrix4fv(
      this.#modelViewProjectionLocation,
      false,
      modelViewProjection,
    );
    gl.uniformMatrix4fv(this.#modelLocation, false, model);
    gl.uniformMatrix4fv(
      this.#lightViewProjectionLocation,
      false,
      lightMatrix,
    );
    gl.uniform3fv(
      this.#lightDirectionLocation,
      environment.lightDirection,
    );
    gl.uniform3fv(this.#lightColorLocation, environment.lightColor);
    gl.uniform3fv(this.#fogColorLocation, environment.fogColor);
    gl.uniform4f(
      this.#environmentLocation,
      environment.ambient,
      environment.weatherIntensity,
      environment.timeSeconds,
      environment.daylight,
    );
    gl.uniform3fv(this.#cameraPositionLocation, camera.position());
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.drawArrays(gl.TRIANGLES, 0, this.#opaqueVertexCount);

    if (this.#translucentVertexCount > 0) {
      gl.enable(gl.BLEND);
      gl.depthMask(false);
      gl.drawArrays(
        gl.TRIANGLES,
        this.#opaqueVertexCount,
        this.#translucentVertexCount,
      );
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
  }
}
