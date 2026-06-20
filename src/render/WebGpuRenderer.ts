import type { MeshData } from "../geometry/hexPrism.ts";
import type { FirstPersonCamera } from "../input/FirstPersonCamera.ts";
import { createBlockTextureAtlas } from "./blockTextureAtlas.ts";
import {
  identity,
  multiply,
  perspective,
} from "../math/mat4.ts";
import { hexPrismShader } from "./hexPrism.wgsl.ts";

const FLOAT_SIZE = Float32Array.BYTES_PER_ELEMENT;
const DEPTH_FORMAT: GPUTextureFormat = "depth24plus";
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
  readonly #uniformBuffer: GPUBuffer;
  readonly #uniformBindGroup: GPUBindGroup;
  readonly #uniformData = new Float32Array(40);

  #depthTexture: GPUTexture | null = null;
  #depthWidth = 0;
  #depthHeight = 0;
  #animationFrame = 0;
  #lastFrameTime = 0;
  #vertexBuffer: GPUBuffer;
  #vertexBufferCapacity: number;
  #vertexCount: number;

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

    this.#vertexCount = mesh.vertexCount;
    this.#vertexBufferCapacity = mesh.vertices.byteLength;
    this.#vertexBuffer = device.createBuffer({
      label: "Hex prism vertex buffer",
      size: this.#vertexBufferCapacity,
      usage: BUFFER_USAGE_VERTEX | BUFFER_USAGE_COPY_DST,
    });
    device.queue.writeBuffer(this.#vertexBuffer, 0, mesh.vertices);

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
      label: "Block texture nearest-neighbor sampler",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
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
      ],
    });

    this.#uniformBindGroup = device.createBindGroup({
      label: "Hex prism bind group",
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.#uniformBuffer } },
        { binding: 1, resource: blockSampler },
        { binding: 2, resource: blockTexture.createView() },
      ],
    });

    const shader = device.createShaderModule({
      label: "Hex prism shader",
      code: hexPrismShader,
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
    onFrame: () => void,
    onDeviceLost: (reason: string) => void,
  ): void {
    void this.#device.lost.then((information) => {
      cancelAnimationFrame(this.#animationFrame);
      onDeviceLost(information.message || information.reason);
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

  #render(camera: FirstPersonCamera): void {
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
    const modelViewProjection = multiply(
      projection,
      multiply(view, model),
    );

    this.#uniformData.set(modelViewProjection, 0);
    this.#uniformData.set(model, 16);
    this.#uniformData.set([0.35, -1, 0.5, 0], 32);
    this.#uniformData.set(camera.position(), 36);
    this.#device.queue.writeBuffer(
      this.#uniformBuffer,
      0,
      this.#uniformData,
    );

    const encoder = this.#device.createCommandEncoder({
      label: "Main render encoder",
    });
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
    pass.draw(this.#vertexCount);
    pass.end();

    this.#device.queue.submit([encoder.finish()]);
  }
}
