/**
 * 本机生图（Qwen-Image 2.1）要下的东西：三个模型文件 + stable-diffusion.cpp 的运行时。
 * 模型走和对话模型一样的下载源（hf-mirror / huggingface / 自定义）；运行时是 GitHub Release 的压缩包。
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

export const IMAGE_MODEL = {
  id: 'qwen-image-2.1-q4km',
  name: 'Qwen-Image 2.1',
  quant: 'Q4_K_M',
  vendor: '阿里通义',
  /** 三个文件加起来约 10 GB，跑起来还要几个 GB 的工作内存 */
  minRamGB: 16,
  files: [
    { key: 'diffusion', label: '扩散模型', repo: 'abenzerps/Qwen-Image-2.1-GGUF', file: 'qwen-image-2.1-Q4_K_M.gguf', size: 4604557984, sha256: '833439e91bc1152d28f37aa198c7f6f4218b7de95754c2f7a318a2422ab4b2f8', gguf: true },
    { key: 'textEncoder', label: '文本编码器（Qwen3-VL-8B）', repo: 'Qwen/Qwen3-VL-8B-Instruct-GGUF', file: 'Qwen3VL-8B-Instruct-Q4_K_M.gguf', size: 5027784800, sha256: '67d1659bfe71b89d50b45a4ad1a9e5b997e5bb16ce5da66a6a6167abd569e9e2', gguf: true },
    { key: 'vae', label: 'VAE', repo: 'abenzerps/Qwen-Image-2.1-GGUF', file: 'vae/qwen_image_2.1_vae_bf16.safetensors', size: 675509688, sha256: 'bb21f7473051e1ac368515dd3f2e15cd44d7a11748ee8823e1ddca3e4876b7c9', gguf: false },
  ] as ImageFileSpec[],
} as const;

/** 兜底：清单里某个文件没写大小时按这个估 */
export const TEXT_ENCODER_APPROX = 5030000000;
export const IMAGE_MODEL_TOTAL_BYTES = IMAGE_MODEL.files.reduce((sum, f) => sum + (f.size || TEXT_ENCODER_APPROX), 0);

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
  { id: '1024x1024', width: 1024, height: 1024, label: '1024 × 1024（方，更清楚）' },
  { id: '768x1024', width: 768, height: 1024, label: '768 × 1024（竖）' },
  { id: '1024x768', width: 1024, height: 768, label: '1024 × 768（横）' },
  { id: '512x512', width: 512, height: 512, label: '512 × 512（省不了多少时间，细节明显变差）' },
];
export const DEFAULT_SIZE = '768x768';

export interface StepOption { id: string; steps: number; label: string }
// 步数是快慢的真正旋钮：每一步的开销和分辨率几乎无关，步数翻倍时间就翻倍
export const STEP_OPTIONS: StepOption[] = [
  { id: 'draft', steps: 8, label: '草稿（8 步，看个意思）' },
  { id: 'fast', steps: 12, label: '快（12 步）' },
  { id: 'standard', steps: 20, label: '标准（20 步，模型推荐）' },
  { id: 'fine', steps: 30, label: '精细（30 步）' },
];
export const DEFAULT_STEPS = 'standard';

export function sizeOf(id: string | undefined): SizeOption { return SIZE_OPTIONS.find((s) => s.id === id) || SIZE_OPTIONS[0]; }
export function stepsOf(id: string | undefined): StepOption { return STEP_OPTIONS.find((s) => s.id === id) || STEP_OPTIONS.find((s) => s.id === DEFAULT_STEPS)!; }

/**
 * 估计这一张要画多久。实测出来的形状是「每步一笔固定开销 + 一笔跟像素走的开销，最后加一次 VAE 解码」：
 * M4 基础款上每步 32 秒的固定开销压倒一切（权重来回搬），所以**步数才是快慢的旋钮，分辨率影响很小**。
 * 两次实测（768×768 二十步 21.4 分、512×512 八步 7.6 分）都落在这条曲线上。
 * 画过一张之后，用那一次的实测和这条曲线的比值把整条曲线缩放到这台机器上——GPU 核心多的机器第一张之后就估得准了。
 */
const STEP_FIXED_MS = 32000;          // 每步与分辨率无关的那部分
const STEP_PER_PIXEL_MS = 0.0357;     // 每步每像素（毫秒）
const VAE_PER_PIXEL_MS = 0.336;       // 解码一次，只跟像素走（毫秒）
const MODEL_LOAD_MS = 40000;          // 第一次出图要先把模型读进来

function rawEstimate(pixels: number, steps: number): number {
  return steps * (STEP_FIXED_MS + STEP_PER_PIXEL_MS * pixels) + VAE_PER_PIXEL_MS * pixels;
}

export function estimateMs(size: SizeOption, steps: StepOption, sample?: { ms: number; pixels: number; steps: number } | null, opts: { includeModelLoad?: boolean } = {}): number {
  const base = rawEstimate(size.width * size.height, steps.steps);
  // 上一次实测比这条曲线快多少 / 慢多少，等比例折算过来
  const scale = sample && sample.ms > 0 && sample.pixels > 0 && sample.steps > 0
    ? sample.ms / rawEstimate(sample.pixels, sample.steps)
    : 1;
  return Math.round(base * scale + (opts.includeModelLoad ? MODEL_LOAD_MS * scale : 0));
}

/** 「约 6 分钟」「约 40 秒」 */
export function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 90) return `约 ${Math.max(5, Math.round(sec / 5) * 5)} 秒`;
  const min = Math.round(sec / 60);
  return min < 60 ? `约 ${min} 分钟` : `约 ${(min / 60).toFixed(1)} 小时`;
}

/** 跑起来大概要多少内存：模型文件 + 工作内存（潜空间、注意力）粗估 2.5 GB */
export function localImageEstimateBytes(installedBytes: number): number {
  return installedBytes > 0 ? Math.round(installedBytes * 1.05 + 2.5 * 1024 ** 3) : 0;
}
