/**
 * 本机生图能用的模型，和 stable-diffusion.cpp 的运行时。
 * 每个模型都是「扩散模型 + 文本编码器 + VAE」三件套，走和对话模型一样的下载源（hf-mirror / huggingface / 自定义）；
 * 运行时是 GitHub Release 的压缩包，所有模型共用一份。
 */
export type ImageFileKey = 'diffusion' | 'textEncoder' | 'vae';

export interface ImageFileSpec {
  key: ImageFileKey;
  label: string;
  repo: string;
  file: string;
  /** 字节数：进度条与完整性校验 */
  size: number;
  sha256: string;
  /** 是 GGUF 就顺便校验文件头 */
  gguf: boolean;
}

/** 这台机器上画一张要多久的曲线：每步 = 固定开销 + 每像素，另加一次 VAE 解码。都是实测拟合出来的 */
export interface ImagePerf {
  stepFixedMs: number;
  stepPerPixelMs: number;
  vaePerPixelMs: number;
  /** 第一次出图要先把模型读进来 */
  loadMs: number;
}

export interface ImageModelSpec {
  id: string;
  name: string;
  vendor: string;
  quant: string;
  /** 一句话：快慢、特点 */
  note: string;
  minRamGB: number;
  /** 蒸馏模型不用无条件分支，CFG 就是 1；普通模型要 2 遍，所以慢一倍 */
  cfgScale: number;
  defaultStepsId: string;
  files: ImageFileSpec[];
  /**
   * 768 × 768 时的峰值内存（实测）。别拿文件大小去推：开着 --offload-to-cpu 时权重不会同时驻留，
   * Qwen-Image 三个文件 10.3 GB，实测峰值只有 5.6 GB。别的尺寸按 localImageEstimateBytes 折算
   */
  peakBytes: number;
  /** 基准机（M4 基础款 24 GB）上的实测曲线；换台机器第一张画完就按实测折算 */
  perf: ImagePerf;
}

export const IMAGE_MODELS: ImageModelSpec[] = [
  {
    id: 'z-image-turbo-q4k',
    name: 'Z-Image Turbo',
    vendor: '阿里通义',
    quant: 'Q4_K',
    note: '八步出图，比 Qwen-Image 快 7 倍，质量还更好',
    minRamGB: 16,
    cfgScale: 1.0,
    defaultStepsId: 'turbo8',
    files: [
      { key: 'diffusion', label: '扩散模型', repo: 'leejet/Z-Image-Turbo-GGUF', file: 'z_image_turbo-Q4_K.gguf', size: 3864250304, sha256: '14b375ab4f226bc5378f68f37e899ef3c2242b8541e61e2bc1aff40976086fbd', gguf: true },
      { key: 'textEncoder', label: '文本编码器（Qwen3-4B）', repo: 'unsloth/Qwen3-4B-Instruct-2507-GGUF', file: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf', size: 2497281120, sha256: '3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597', gguf: true },
      // FLUX 的 VAE。官方那个仓库要先同意许可才能下，这里用公开镜像（文件逐字节相同，SHA256 对得上）
      { key: 'vae', label: 'VAE', repo: 'Comfy-Org/Lumina_Image_2.0_Repackaged', file: 'split_files/vae/ae.safetensors', size: 335304388, sha256: 'afc8e28272cd15db3919bacdb6918ce9c1ed22e96cb12c4d5ed0fba823529e38', gguf: false },
    ],
    peakBytes: 6_920_273_920,   // 实测 768×768 八步（512×512 是 5.74 GB，两点定出上面那条斜率）
    // 两次实测拟合（768×768 八步 2.9 分、512×512 八步 1.4 分）：每步的固定开销只有 1.5 秒，
    // 所以它和 Qwen-Image 不一样——**分辨率是主要变量**，降到 512 时间直接减半
    perf: { stepFixedMs: 1536, stepPerPixelMs: 0.0317, vaePerPixelMs: 0.0217, loadMs: 8000 },
  },
  {
    id: 'qwen-image-2.1-q4km',
    name: 'Qwen-Image 2.1',
    vendor: '阿里通义',
    quant: 'Q4_K_M',
    note: '模型更大，中文长句和画面里的文字更稳；但要慢七倍',
    minRamGB: 16,
    cfgScale: 6.0,
    defaultStepsId: 'standard',
    files: [
      { key: 'diffusion', label: '扩散模型', repo: 'abenzerps/Qwen-Image-2.1-GGUF', file: 'qwen-image-2.1-Q4_K_M.gguf', size: 4604557984, sha256: '833439e91bc1152d28f37aa198c7f6f4218b7de95754c2f7a318a2422ab4b2f8', gguf: true },
      { key: 'textEncoder', label: '文本编码器（Qwen3-VL-8B）', repo: 'Qwen/Qwen3-VL-8B-Instruct-GGUF', file: 'Qwen3VL-8B-Instruct-Q4_K_M.gguf', size: 5027784800, sha256: '67d1659bfe71b89d50b45a4ad1a9e5b997e5bb16ce5da66a6a6167abd569e9e2', gguf: true },
      { key: 'vae', label: 'VAE', repo: 'abenzerps/Qwen-Image-2.1-GGUF', file: 'vae/qwen_image_2.1_vae_bf16.safetensors', size: 675509688, sha256: 'bb21f7473051e1ac368515dd3f2e15cd44d7a11748ee8823e1ddca3e4876b7c9', gguf: false },
    ],
    peakBytes: 5_586_108_416,   // 实测 768×768 二十步
    // 实测 768×768 二十步：采样 1061.4 s（53.1 s/步）、VAE 198.0 s
    perf: { stepFixedMs: 32000, stepPerPixelMs: 0.0357, vaePerPixelMs: 0.336, loadMs: 40000 },
  },
];

export const DEFAULT_IMAGE_MODEL = IMAGE_MODELS[0].id;
export function imageModelOf(id: string | undefined): ImageModelSpec {
  return IMAGE_MODELS.find((m) => m.id === id) || IMAGE_MODELS[0];
}
export function modelTotalBytes(model: ImageModelSpec): number {
  return model.files.reduce((sum, f) => sum + f.size, 0);
}

export const SD_RUNTIME = {
  version: 'master-890-74988b2',
  base: 'https://github.com/leejet/stable-diffusion.cpp/releases/download/master-890-74988b2/',
  /** 每个平台的压缩包：macOS 那个是 arm64 + x86_64 通用的（Metal）；Windows 用 Vulkan 版，绝大多数显卡都认 */
  assets: {
    'darwin-arm64': 'sd-master-74988b2-bin-Darwin-macOS-26.6.2-arm64.zip',
    'darwin-x64': 'sd-master-74988b2-bin-Darwin-macOS-26.6.2-arm64.zip',
    'win32-x64': 'sd-master-74988b2-bin-win-vulkan-x64.zip',
    'linux-x64': 'sd-master-74988b2-bin-Linux-Ubuntu-24.04-x86_64-vulkan.zip',
  } as Record<string, string>,
};

export function runtimeAssetFor(platform: string, arch: string): string | null {
  return SD_RUNTIME.assets[`${platform}-${arch}`] ?? null;
}

export interface SizeOption { id: string; width: number; height: number; label: string }
/** 尺寸都能被 32 整除（模型的要求） */
export const SIZE_OPTIONS: SizeOption[] = [
  { id: '768x768', width: 768, height: 768, label: '768 × 768（方）' },
  { id: '1024x1024', width: 1024, height: 1024, label: '1024 × 1024（方，最清楚）' },
  { id: '768x1024', width: 768, height: 1024, label: '768 × 1024（竖）' },
  { id: '1024x768', width: 1024, height: 768, label: '1024 × 768（横）' },
  { id: '512x512', width: 512, height: 512, label: '512 × 512（最快）' },
];
export const DEFAULT_SIZE = '768x768';

export interface StepOption { id: string; steps: number; label: string }
// 步数是快慢的真正旋钮：每一步的开销和分辨率几乎无关，步数翻倍时间就翻倍。
// 蒸馏（Turbo）模型 8 步就画好了，再加步数只是白等
export const STEP_OPTIONS: StepOption[] = [
  { id: 'turbo6', steps: 6, label: '更快（6 步）' },
  { id: 'turbo8', steps: 8, label: '标准（8 步，模型推荐）' },
  { id: 'turbo12', steps: 12, label: '精细（12 步）' },
  { id: 'draft', steps: 8, label: '草稿（8 步，看个意思）' },
  { id: 'fast', steps: 12, label: '快（12 步）' },
  { id: 'standard', steps: 20, label: '标准（20 步，模型推荐）' },
  { id: 'fine', steps: 30, label: '精细（30 步）' },
];
/** 这个模型能选的步数：蒸馏模型一套，普通模型另一套 */
export function stepOptionsFor(model: ImageModelSpec): StepOption[] {
  const turbo = model.cfgScale <= 1.5;
  return STEP_OPTIONS.filter((o) => (turbo ? o.id.startsWith('turbo') : !o.id.startsWith('turbo')));
}
export const DEFAULT_STEPS = 'turbo8';

export function sizeOf(id: string | undefined): SizeOption { return SIZE_OPTIONS.find((s) => s.id === id) || SIZE_OPTIONS[0]; }
export function stepsOf(id: string | undefined): StepOption { return STEP_OPTIONS.find((s) => s.id === id) || STEP_OPTIONS.find((s) => s.id === DEFAULT_STEPS)!; }

/**
 * 估计这一张要画多久。实测出来的形状是「每步一笔固定开销 + 一笔跟像素走的开销，最后加一次 VAE 解码」，
 * 每个模型一条自己的曲线（见 IMAGE_MODELS 里的 perf，都是在 M4 基础款上量的）。
 * 画过一张之后，用那一次的实测和曲线的比值把它缩放到这台机器上——GPU 核心多的机器第一张之后就估得准了。
 */
function rawEstimate(perf: ImagePerf, pixels: number, steps: number): number {
  return steps * (perf.stepFixedMs + perf.stepPerPixelMs * pixels) + perf.vaePerPixelMs * pixels;
}

export function estimateMs(model: ImageModelSpec, size: SizeOption, steps: StepOption, sample?: { ms: number; pixels: number; steps: number } | null, opts: { includeModelLoad?: boolean } = {}): number {
  const base = rawEstimate(model.perf, size.width * size.height, steps.steps);
  const scale = sample && sample.ms > 0 && sample.pixels > 0 && sample.steps > 0
    ? sample.ms / rawEstimate(model.perf, sample.pixels, sample.steps)
    : 1;
  return Math.round(base * scale + (opts.includeModelLoad ? model.perf.loadMs * scale : 0));
}

/** 「约 6 分钟」「约 40 秒」 */
export function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 90) return `约 ${Math.max(5, Math.round(sec / 5) * 5)} 秒`;
  const min = Math.round(sec / 60);
  return min < 60 ? `约 ${min} 分钟` : `约 ${(min / 60).toFixed(1)} 小时`;
}

/** 每像素的工作内存：Z-Image 两次实测（512² 5.74 GB、768² 6.92 GB）解出来的斜率，别的模型先按同一条用 */
const PEAK_PER_PIXEL_BYTES = 3601;
const PEAK_REF_PIXELS = 768 * 768;

/**
 * 跑起来大概要多少内存：实测峰值里「权重那一半」是固定的，「工作内存那一半」跟像素走，
 * 所以出小图时要的内存明显少——内存紧张时这能决定出不出得了图。
 * 不再额外加余量：peakBytes 本来就是实测的峰值，再乘一次只会把跑得动的活拦下来
 * （调度那边留了一点系统回收的余地，见 MEMORY_SLACK）。没下载完就当 0
 */
export function localImageEstimateBytes(model: ImageModelSpec, downloaded: boolean, pixels = PEAK_REF_PIXELS): number {
  if (!downloaded) return 0;
  const base = model.peakBytes - PEAK_PER_PIXEL_BYTES * PEAK_REF_PIXELS;
  return Math.round(base + PEAK_PER_PIXEL_BYTES * Math.max(0, pixels));
}

/** 兜底：老配置里存的步数 id 可能不属于这个模型，换成它自己的默认 */
export function stepsForModel(model: ImageModelSpec, id: string | undefined): StepOption {
  const allowed = stepOptionsFor(model);
  return allowed.find((o) => o.id === id) || allowed.find((o) => o.id === model.defaultStepsId) || allowed[0];
}
