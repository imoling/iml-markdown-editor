/**
 * 实时转写要下载的东西：sherpa-onnx 的 Node 原生模块（按平台）+ 12 KB 的 JS 胶水层 + SenseVoice 与 VAD 模型。
 * 都是运行时下载到模型存放位置（默认在应用数据目录里），不打进安装包 —— 选型与取舍见 docs/transcription-spike.md。
 * 大小与 SHA256 是 2026-09-20 实际下载后算的；国内镜像与官方源是同一份字节。
 */

export const ASR_RUNTIME_VERSION = '1.13.8';

export interface AsrDownload {
  /** 下载后在本地的文件名 */
  file: string;
  size: number;
  sha256: string;
}

export interface NpmPackage extends AsrDownload { pkg: string }
export interface HfFile extends AsrDownload { repo: string; path: string }

/** JS 胶水层：纯 JS，全平台通用 */
export const GLUE_PACKAGE: NpmPackage = {
  pkg: 'sherpa-onnx-node', file: 'sherpa-onnx-node.tgz', size: 11954,
  sha256: 'db2a7b8b18d950b6e9ca5c1c919afec33fd3dd2bfef1aade0bea5a9fe7a1f0f1',
};

/** 原生模块：键是 `${process.platform}-${process.arch}` */
export const NATIVE_PACKAGES: Record<string, NpmPackage> = {
  'darwin-arm64': { pkg: 'sherpa-onnx-darwin-arm64', file: 'sherpa-onnx-native.tgz', size: 10047754, sha256: 'e1abc1d9676478996574de922e55714d80b4500b860bc4e7349aa01cd0ea4929' },
  'darwin-x64': { pkg: 'sherpa-onnx-darwin-x64', file: 'sherpa-onnx-native.tgz', size: 11191481, sha256: '3e583d3423160cb8a0f9316008e293ad9a6b66c63e1966ad399a88300390fbaa' },
  'win32-x64': { pkg: 'sherpa-onnx-win-x64', file: 'sherpa-onnx-native.tgz', size: 8894875, sha256: 'fe522f02a5c113c2567a43982107ef41ae517f9a431931e90731e7e4d4341073' },
};

export const MODEL_FILES: HfFile[] = [
  { repo: 'csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17', path: 'model.int8.onnx', file: 'sensevoice.int8.onnx', size: 239233841, sha256: 'c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51' },
  { repo: 'csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17', path: 'tokens.txt', file: 'sensevoice.tokens.txt', size: 315894, sha256: 'f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc' },
  { repo: 'csukuangfj/vad', path: 'silero_vad.onnx', file: 'silero_vad.onnx', size: 1807522, sha256: 'a35ebf52fd3ce5f1469b2a36158dba761bc47b973ea3382b3186ca15b1f5af28' },
];

/**
 * 区分说话人用的声纹模型（3D-Speaker CAM++，中英文，192 维）。可选：打开「区分说话人」时才下载。
 * 选它的依据：27 MB、每句话算一次只要十几毫秒；实测两句都 ≥1.5 秒时同一个人相似度 ≥0.85、不同人 ≤0.5
 */
export const SPEAKER_MODEL: HfFile = {
  repo: 'csukuangfj/speaker-embedding-models', path: '3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx',
  file: 'speaker.campplus.onnx', size: 28281164, sha256: 'aa3cfc16963a10586a9393f5035d6d6b57e98d358b347f80c2a30bf4f00ceba2',
};

export function nativePackageFor(platform: string, arch: string): NpmPackage | null {
  return NATIVE_PACKAGES[`${platform}-${arch}`] ?? null;
}

/** npm 包的下载地址：国内镜像与官方源互为备用，谁排前面跟着用户选的模型下载源走 */
export function npmTarballUrls(pkg: string, preferOfficial: boolean): string[] {
  const mirror = `https://registry.npmmirror.com/${pkg}/-/${pkg}-${ASR_RUNTIME_VERSION}.tgz`;
  const official = `https://registry.npmjs.org/${pkg}/-/${pkg}-${ASR_RUNTIME_VERSION}.tgz`;
  return preferOfficial ? [official, mirror] : [mirror, official];
}

/** 胶水层按 `../sherpa-onnx-<平台>-<架构>/sherpa-onnx.node` 找原生模块：Windows 在包名里写作 win 而不是 win32 */
export function nativeDirName(platform: string, arch: string): string {
  return `sherpa-onnx-${platform === 'win32' ? 'win' : platform}-${arch}`;
}

export const totalDownloadBytes = (platform: string, arch: string) =>
  GLUE_PACKAGE.size + (nativePackageFor(platform, arch)?.size ?? 0) + MODEL_FILES.reduce((n, f) => n + f.size, 0);
