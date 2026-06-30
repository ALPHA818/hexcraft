import type { MeshData } from "../geometry/hexPrism.ts";
import type { Atmosphere } from "../environment/Atmosphere.ts";
import type { FirstPersonCamera } from "../input/FirstPersonCamera.ts";
import { DEVICE_PROFILE } from "../platform/deviceProfile.ts";
import { createBlockTextureAtlas } from "./blockTextureAtlas.ts";
import { identity, multiply, perspective } from "../math/mat4.ts";
import { hexPrismShader, shadowShader } from "./hexPrism.wgsl.ts";
import { lightViewProjection } from "./lighting.ts";

const FLOAT_SIZE = Float32Array.BYTES_PER_ELEMENT;
const DEPTH_FORMAT: GPUTextureFormat = "depth24plus";
const SHADOW_FORMAT: GPUTextureFormat = "depth32float";
const SHADOW_MAP_SIZE = DEVICE_PROFILE.shadowMapSize;
// WebGPU bit flags. TypeScript 6 declares the API types but not these runtime
// constant objects, so keeping the tiny set we use here avoids duplicate types.
const BUFFER_USAGE_COPY_DST = 0x0008;
const BUFFER_USAGE_UNIFORM = 0x0040;
const BUFFER_USAGE_VERTEX = 0x0020;
const SHADER_STAGE_VERTEX = 0x1;
const SHADER_STAGE_FRAGMENT = 0x2;
const TEXTURE_USAGE_RENDER_ATTACHMENT = 0x10;
const TEXTURE_USAGE_COPY_DST = 0x02;
const TEXTURE_USAGE_BINDING = 0x04;

export class WebGpuRenderer {
  readonly #canvas: HTMLCanvasElement;
  readonly #context: GPUCanvasContext;
  readonly #device: GPUDevice;
  readonly #pipeline: GPURenderPipeline;
  readonly #transparentPipeline: GPURenderPipeline;
  readonly #shadowPipeline: GPURenderPipeline;
  readonly #shadowTexture: GPUTexture;
  readonly #shadowBindGroup: GPUBindGroup;
  readonly #uniformBuffer: GPUBuffer;
  readonly #uniformBindGroup: GPUBindGroup;
  readonly #uniformData = new Float32Array(72);

  #depthTexture: GPUTexture | null = null;
  #depthWidth = 0;
  #depthHeight = 0;
  #animationFrame = 0;
  #lastFrameTime = 0;
  #isRunning = false;
  #animationSeconds = 0;
  #vertexBuffer: GPUBuffer;
  #vertexBufferCapacity: number;
  #entityVertexBuffer: GPUBuffer;
  #entityVertexBufferCapacity: number;
  #opaqueVertexCount: number;
  #translucentVertexCount: number;
  #entityVertexCount = 0;

  private constructor(
    canvas: HTMLCanvasElement,
    context: GPUCanvasContext,
    device: GPUDevice,
    format: GPUTextureFormat,
    mesh: MeshData,
  ) {
    this.#canvas = canvas;
    this.#context = context;
    this.#device = device;

    this.#opaqueVertexCount = mesh.opaqueVertexCount ?? mesh.vertexCount;
    this.#translucentVertexCount = mesh.translucentVertexCount ?? 0;
    this.#vertexBufferCapacity = mesh.vertices.byteLength;
    this.#vertexBuffer = device.createBuffer({
      label: "Hex prism vertex buffer",
      size: this.#vertexBufferCapacity,
      usage: BUFFER_USAGE_VERTEX | BUFFER_USAGE_COPY_DST,
    });
    device.queue.writeBuffer(this.#vertexBuffer, 0, mesh.vertices);
    this.#entityVertexBufferCapacity = Math.max(
      FLOAT_SIZE * mesh.floatsPerVertex,
      4,
    );
    this.#entityVertexBuffer = device.createBuffer({
      label: "Entity vertex buffer",
      size: this.#entityVertexBufferCapacity,
      usage: BUFFER_USAGE_VERTEX | BUFFER_USAGE_COPY_DST,
    });

    this.#uniformBuffer = device.createBuffer({
      label: "Hex prism uniforms",
      size: this.#uniformData.byteLength,
      usage: BUFFER_USAGE_UNIFORM | BUFFER_USAGE_COPY_DST,
    });

    const atlas = createBlockTextureAtlas();
    const blockTexture = device.createTexture({
      label: "Block texture atlas",
      size: [atlas.width, atlas.height],
      format: "rgba8unorm",
      usage: TEXTURE_USAGE_COPY_DST | TEXTURE_USAGE_BINDING,
    });
    device.queue.writeTexture(
      { texture: blockTexture },
      atlas.pixels,
      {
        offset: 0,
        bytesPerRow: atlas.width * 4,
        rowsPerImage: atlas.height,
      },
      [atlas.width, atlas.height],
    );
    const blockSampler = device.createSampler({
      label: "Soft block texture sampler",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
    });
    this.#shadowTexture = device.createTexture({
      label: "Directional shadow map",
      size: [SHADOW_MAP_SIZE, SHADOW_MAP_SIZE],
      format: SHADOW_FORMAT,
      usage: TEXTURE_USAGE_RENDER_ATTACHMENT | TEXTURE_USAGE_BINDING,
    });
    const shadowSampler = device.createSampler({
      label: "Shadow comparison sampler",
      compare: "less",
      magFilter: "linear",
      minFilter: "linear",
    });

    const bindGroupLayout = device.createBindGroupLayout({
      label: "Hex prism bind group layout",
      entries: [
        {
          binding: 0,
          visibility: SHADER_STAGE_VERTEX | SHADER_STAGE_FRAGMENT,
          buffer: { type: "uniform" },
        },
        {
          binding: 1,
          visibility: SHADER_STAGE_FRAGMENT,
          sampler: { type: "filtering" },
        },
        {
          binding: 2,
          visibility: SHADER_STAGE_FRAGMENT,
          texture: { sampleType: "float" },
        },
        {
          binding: 3,
          visibility: SHADER_STAGE_FRAGMENT,
          sampler: { type: "comparison" },
        },
        {
          binding: 4,
          visibility: SHADER_STAGE_FRAGMENT,
          texture: { sampleType: "depth" },
        },
      ],
    });

    this.#uniformBindGroup = device.createBindGroup({
      label: "Hex prism bind group",
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.#uniformBuffer } },
        { binding: 1, resource: blockSampler },
        { binding: 2, resource: blockTexture.createView() },
        { binding: 3, resource: shadowSampler },
        { binding: 4, resource: this.#shadowTexture.createView() },
      ],
    });

    const shader = device.createShaderModule({
      label: "Hex prism shader",
      code: hexPrismShader,
    });
    const shadowModule = device.createShaderModule({
      label: "Shadow map shader",
      code: shadowShader,
    });
    const shadowBindGroupLayout = device.createBindGroupLayout({
      label: "Shadow bind group layout",
      entries: [
        {
          binding: 0,
          visibility: SHADER_STAGE_VERTEX,
          buffer: { type: "uniform" },
        },
      ],
    });
    this.#shadowBindGroup = device.createBindGroup({
      label: "Shadow bind group",
      layout: shadowBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.#uniformBuffer } }],
    });
    this.#shadowPipeline = device.createRenderPipeline({
      label: "Directional shadow pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [shadowBindGroupLayout],
      }),
      vertex: {
        module: shadowModule,
        entryPoint: "shadow_vertex",
        buffers: [
          {
            arrayStride: mesh.floatsPerVertex * FLOAT_SIZE,
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: "float32x3",
              },
            ],
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
        frontFace: "ccw",
        cullMode: "front",
      },
      depthStencil: {
        format: SHADOW_FORMAT,
        depthWriteEnabled: true,
        depthCompare: "less",
        depthBias: 2,
        depthBiasSlopeScale: 2,
      },
    });

    this.#pipeline = device.createRenderPipeline({
      label: "Hex prism pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      }),
      vertex: {
        module: shader,
        entryPoint: "vertex_main",
        buffers: [
          {
            arrayStride: mesh.floatsPerVertex * FLOAT_SIZE,
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: "float32x3",
              },
              {
                shaderLocation: 1,
                offset: 3 * FLOAT_SIZE,
                format: "float32x3",
              },
              {
                shaderLocation: 2,
                offset: 6 * FLOAT_SIZE,
                format: "float32x3",
              },
              {
                shaderLocation: 3,
                offset: 9 * FLOAT_SIZE,
                format: "float32x2",
              },
            ],
          },
        ],
      },
      fragment: {
        module: shader,
        entryPoint: "fragment_main",
        targets: [{ format }],
      },
      primitive: {
        topology: "triangle-list",
        frontFace: "ccw",
        cullMode: "back",
      },
      depthStencil: {
        format: DEPTH_FORMAT,
        depthWriteEnabled: true,
        depthCompare: "less",
      },
    });

    this.#transparentPipeline = device.createRenderPipeline({
      label: "Transparent water pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      }),
      vertex: {
        module: shader,
        entryPoint: "vertex_main",
        buffers: [
          {
            arrayStride: mesh.floatsPerVertex * FLOAT_SIZE,
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: "float32x3",
              },
              {
                shaderLocation: 1,
                offset: 3 * FLOAT_SIZE,
                format: "float32x3",
              },
              {
                shaderLocation: 2,
                offset: 6 * FLOAT_SIZE,
                format: "float32x3",
              },
              {
                shaderLocation: 3,
                offset: 9 * FLOAT_SIZE,
                format: "float32x2",
              },
            ],
          },
        ],
      },
      fragment: {
        module: shader,
        entryPoint: "fragment_main",
        targets: [
          {
            format,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
        frontFace: "ccw",
        cullMode: "back",
      },
      depthStencil: {
        format: DEPTH_FORMAT,
        depthWriteEnabled: false,
        depthCompare: "less",
      },
    });
  }

  static async create(
    canvas: HTMLCanvasElement,
    mesh: MeshData,
  ): Promise<WebGpuRenderer> {
    if (!navigator.gpu) {
      throw new Error(
        "WebGPU is unavailable. Enable it in Firefox or use a current Chromium-based browser.",
      );
    }

    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: "high-performance",
    });

    if (!adapter) {
      throw new Error("No compatible graphics adapter was found.");
    }

    const device = await adapter.requestDevice();
    const context = canvas.getContext("webgpu") as GPUCanvasContext | null;

    if (!context) {
      throw new Error("Could not create the WebGPU canvas context.");
    }

    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
      device,
      format,
      alphaMode: "premultiplied",
    });

    return new WebGpuRenderer(canvas, context, device, format, mesh);
  }

  start(
    camera: FirstPersonCamera,
    atmosphere: Atmosphere,
    onFrame: (deltaSeconds: number) => void,
    onDeviceLost: (reason: string) => void,
  ): void {
    this.#isRunning = true;
    void this.#device.lost.then((information) => {
      if (!this.#isRunning) {
        return;
      }

      cancelAnimationFrame(this.#animationFrame);
      onDeviceLost(information.message || information.reason);
    });

    const renderFrame = (time: number): void => {
      if (!this.#isRunning) {
        return;
      }

      const deltaSeconds =
        this.#lastFrameTime === 0 ? 0 : (time - this.#lastFrameTime) / 1000;
      this.#lastFrameTime = time;
      this.#animationSeconds += Math.min(deltaSeconds, 0.1);
      camera.update(deltaSeconds);
      atmosphere.update(deltaSeconds);
      onFrame(deltaSeconds);
      this.#render(camera, atmosphere);
      this.#animationFrame = requestAnimationFrame(renderFrame);
    };

    this.#animationFrame = requestAnimationFrame(renderFrame);
  }

  stop(): void {
    this.#isRunning = false;
    cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = 0;
    this.#lastFrameTime = 0;
  }

  updateMesh(mesh: MeshData): void {
    if (mesh.vertices.byteLength > this.#vertexBufferCapacity) {
      this.#vertexBuffer.destroy();
      this.#vertexBufferCapacity = mesh.vertices.byteLength;
      this.#vertexBuffer = this.#device.createBuffer({
        label: "Streamed terrain vertex buffer",
        size: this.#vertexBufferCapacity,
        usage: BUFFER_USAGE_VERTEX | BUFFER_USAGE_COPY_DST,
      });
    }

    this.#device.queue.writeBuffer(this.#vertexBuffer, 0, mesh.vertices);
    this.#opaqueVertexCount = mesh.opaqueVertexCount ?? mesh.vertexCount;
    this.#translucentVertexCount = mesh.translucentVertexCount ?? 0;
  }

  updateEntityMesh(mesh: MeshData): void {
    if (mesh.vertices.byteLength > this.#entityVertexBufferCapacity) {
      this.#entityVertexBuffer.destroy();
      this.#entityVertexBufferCapacity = mesh.vertices.byteLength;
      this.#entityVertexBuffer = this.#device.createBuffer({
        label: "Dynamic entity vertex buffer",
        size: this.#entityVertexBufferCapacity,
        usage: BUFFER_USAGE_VERTEX | BUFFER_USAGE_COPY_DST,
      });
    }

    if (mesh.vertices.byteLength > 0) {
      this.#device.queue.writeBuffer(
        this.#entityVertexBuffer,
        0,
        mesh.vertices,
      );
    }
    this.#entityVertexCount = mesh.opaqueVertexCount ?? mesh.vertexCount;
  }

  #resize(): void {
    const scale = Math.min(
      window.devicePixelRatio,
      DEVICE_PROFILE.maxPixelRatio,
    );
    const width = Math.max(1, Math.floor(this.#canvas.clientWidth * scale));
    const height = Math.max(1, Math.floor(this.#canvas.clientHeight * scale));

    if (this.#canvas.width !== width || this.#canvas.height !== height) {
      this.#canvas.width = width;
      this.#canvas.height = height;
    }

    if (this.#depthWidth === width && this.#depthHeight === height) {
      return;
    }

    this.#depthTexture?.destroy();
    this.#depthTexture = this.#device.createTexture({
      label: "Main depth texture",
      size: [width, height],
      format: DEPTH_FORMAT,
      usage: TEXTURE_USAGE_RENDER_ATTACHMENT,
    });
    this.#depthWidth = width;
    this.#depthHeight = height;
  }

  #render(camera: FirstPersonCamera, atmosphere: Atmosphere): void {
    this.#resize();

    if (!this.#depthTexture) {
      return;
    }

    const model = identity();
    const view = camera.viewMatrix();
    const projection = perspective(
      Math.PI / 3,
      this.#canvas.width / this.#canvas.height,
      0.1,
      48,
    );
    const modelViewProjection = multiply(projection, multiply(view, model));
    const environment = atmosphere.state();
    const lightMatrix = lightViewProjection(
      camera.position(),
      environment,
      false,
    );

    this.#uniformData.set(modelViewProjection, 0);
    this.#uniformData.set(model, 16);
    this.#uniformData.set(lightMatrix, 32);
    this.#uniformData.set([...environment.lightDirection, 0], 48);
    this.#uniformData.set([...camera.position(), 0], 52);
    this.#uniformData.set([...environment.lightColor, 0], 56);
    this.#uniformData.set([...environment.fogColor, 0], 60);
    this.#uniformData.set(
      [
        environment.ambient,
        environment.weatherIntensity,
        this.#animationSeconds,
        environment.daylight,
      ],
      64,
    );
    this.#uniformData.set(environment.rendererLighting, 68);
    this.#device.queue.writeBuffer(this.#uniformBuffer, 0, this.#uniformData);

    const encoder = this.#device.createCommandEncoder({
      label: "Main render encoder",
    });
    const shadowPass = encoder.beginRenderPass({
      label: "Directional shadow pass",
      colorAttachments: [],
      depthStencilAttachment: {
        view: this.#shadowTexture.createView(),
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });
    shadowPass.setPipeline(this.#shadowPipeline);
    shadowPass.setBindGroup(0, this.#shadowBindGroup);
    shadowPass.setVertexBuffer(0, this.#vertexBuffer);
    shadowPass.draw(this.#opaqueVertexCount);
    if (this.#entityVertexCount > 0) {
      shadowPass.setVertexBuffer(0, this.#entityVertexBuffer);
      shadowPass.draw(this.#entityVertexCount);
    }
    shadowPass.end();

    const pass = encoder.beginRenderPass({
      label: "Main render pass",
      colorAttachments: [
        {
          view: this.#context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: this.#depthTexture.createView(),
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });

    pass.setPipeline(this.#pipeline);
    pass.setBindGroup(0, this.#uniformBindGroup);
    pass.setVertexBuffer(0, this.#vertexBuffer);
    pass.draw(this.#opaqueVertexCount);
    if (this.#entityVertexCount > 0) {
      pass.setVertexBuffer(0, this.#entityVertexBuffer);
      pass.draw(this.#entityVertexCount);
    }
    if (this.#translucentVertexCount > 0) {
      pass.setPipeline(this.#transparentPipeline);
      pass.setVertexBuffer(0, this.#vertexBuffer);
      pass.draw(this.#translucentVertexCount, 1, this.#opaqueVertexCount);
    }
    pass.end();

    this.#device.queue.submit([encoder.finish()]);
  }
}
