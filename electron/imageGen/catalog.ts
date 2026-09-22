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
    { key: 'textEncoder', label: '文本编码器（Qwen3-VL-8B）', repo: 'Qwen/Qwen3-VL-8B-Instruct-GGUF', file: 'Qwen3VL-8B-Instruct-Q4_K_M.gguf', size: 0, sha256: '67d1659bfe71b89d50b45a4ad1a9e5b997e5bb16ce5da66a6a6167abd569e9e2', gguf: true },
    { key: 'vae', label: 'VAE', repo: 'abenzerps/Qwen-Image-2.1-GGUF', file: 'vae/qwen_image_2.1_vae_bf16.safetensors', size: 675509688, sha256: 'bb21f7473051e1ac368515dd3f2e15cd44d7a11748ee8823e1ddca3e4876b7c9', gguf: false },
  ] as ImageFileSpec[],
} as const;

/** 文本编码器的准确大小要等第一次下完才知道：先按 5.03 GB 估 */
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
  { id: '768x768', width: 768, height: 768, label: '768 × 768（方，快）' },
  { id: '1024x1024', width: 1024, height: 1024, label: '1024 × 1024（方）' },
  { id: '768x1024', width: 768, height: 1024, label: '768 × 1024（竖）' },
  { id: '1024x768', width: 1024, height: 768, label: '1024 × 768（横）' },
];
export const DEFAULT_SIZE = '768x768';

export interface StepOption { id: string; steps: number; label: string }
export const STEP_OPTIONS: StepOption[] = [
  { id: 'fast', steps: 12, label: '快（12 步）' },
  { id: 'standard', steps: 20, label: '标准（20 步）' },
  { id: 'fine', steps: 30, label: '精细（30 步）' },
];
export const DEFAULT_STEPS = 'standard';

export function sizeOf(id: string | undefined): SizeOption { return SIZE_OPTIONS.find((s) => s.id === id) || SIZE_OPTIONS[0]; }
export function stepsOf(id: string | undefined): StepOption { return STEP_OPTIONS.find((s) => s.id === id) || STEP_OPTIONS[1]; }

/** 跑起来大概要多少内存：模型文件 + 工作内存（潜空间、注意力）粗估 2.5 GB */
export function localImageEstimateBytes(installedBytes: number): number {
  return installedBytes > 0 ? Math.round(installedBytes * 1.05 + 2.5 * 1024 ** 3) : 0;
}
