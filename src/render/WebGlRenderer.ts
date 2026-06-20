import type { MeshData } from "../geometry/hexPrism.ts";
import type { FirstPersonCamera } from "../input/FirstPersonCamera.ts";
import { createBlockTextureAtlas } from "./blockTextureAtlas.ts";
import {
  identity,
  multiply,
  perspectiveWebGl,
} from "../math/mat4.ts";

const VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in vec3 color;
layout(location = 3) in vec2 uv;

uniform mat4 model_view_projection;
uniform mat4 model;
uniform vec3 camera_position;

out vec3 world_normal;
out vec3 vertex_color;
out vec2 texture_uv;
out vec3 world_position;

void main() {
  gl_Position = model_view_projection * vec4(position, 1.0);
  world_normal = normalize((model * vec4(normal, 0.0)).xyz);
  vertex_color = color;
  texture_uv = uv;
  world_position = (model * vec4(position, 1.0)).xyz;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec3 world_normal;
in vec3 vertex_color;
in vec2 texture_uv;
in vec3 world_position;

uniform vec3 light_direction;
uniform vec3 camera_position;
uniform sampler2D block_atlas;

out vec4 output_color;

void main() {
  vec3 normal = normalize(world_normal);
  vec3 direction_to_light = normalize(-light_direction);
  float diffuse = max(dot(normal, direction_to_light), 0.0);
  float light = 0.28 + diffuse * 0.72;
  vec3 texel = texture(block_atlas, texture_uv).rgb;
  vec3 color = texel * vertex_color * light;
  float camera_distance = distance(world_position, camera_position);
  float fog = smoothstep(32.0, 47.0, camera_distance);
  vec3 fog_color = vec3(0.55, 0.72, 0.82);
  output_color = vec4(mix(color, fog_color, fog), 1.0);
}
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
  readonly #vertexArray: WebGLVertexArrayObject;
  readonly #vertexBuffer: WebGLBuffer;
  readonly #modelViewProjectionLocation: WebGLUniformLocation;
  readonly #modelLocation: WebGLUniformLocation;
  readonly #lightDirectionLocation: WebGLUniformLocation;
  readonly #cameraPositionLocation: WebGLUniformLocation;
  readonly #blockAtlasLocation: WebGLUniformLocation;

  #animationFrame = 0;
  #lastFrameTime = 0;
  #vertexCount: number;

  private constructor(
    canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
    mesh: MeshData,
  ) {
    this.#canvas = canvas;
    this.#gl = gl;
    this.#program = createProgram(gl);

    this.#modelViewProjectionLocation = requireUniform(
      gl,
      this.#program,
      "model_view_projection",
    );
    this.#modelLocation = requireUniform(gl, this.#program, "model");
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
    this.#blockAtlasLocation = requireUniform(
      gl,
      this.#program,
      "block_atlas",
    );

    this.#vertexCount = mesh.vertexCount;

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

    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
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
      onFrame();
      this.#render(camera);
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
    this.#vertexCount = mesh.vertexCount;
  }

  #resize(): void {
    const scale = Math.min(window.devicePixelRatio, 2);
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

  #render(camera: FirstPersonCamera): void {
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

    const gl = this.#gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.#program);
    gl.uniform1i(this.#blockAtlasLocation, 0);
    gl.bindVertexArray(this.#vertexArray);
    gl.uniformMatrix4fv(
      this.#modelViewProjectionLocation,
      false,
      modelViewProjection,
    );
    gl.uniformMatrix4fv(this.#modelLocation, false, model);
    gl.uniform3f(this.#lightDirectionLocation, 0.35, -1, 0.5);
    gl.uniform3fv(this.#cameraPositionLocation, camera.position());
    gl.drawArrays(gl.TRIANGLES, 0, this.#vertexCount);
  }
}
