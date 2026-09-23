/**
 * 界面上会在好几处出现的同一句话，统一放这里。
 * 以前是各写各的（同一句抄在两三个文件里），改一处漏一处；现在要改就改这一处。
 */

// 主进程也要说的那几句在 electron/shared/uiText.ts，这里原样转出去，界面只认这一个入口
export { AI_DISABLED, MIC_DENIED } from '../../electron/shared/uiText';

/** 浏览器端的音频管线起不来 */
export const AUDIO_WORKLET_FAILED = '音频处理模块加载失败';

/** 首次运行新下载的可执行文件，macOS 会扫一遍 */
export const GATEKEEPER_SCAN = '系统正在检查新程序，约十几秒…';

/** 大文件下载不阻塞界面 */
export const DOWNLOAD_IN_BACKGROUND = '下载在后台继续，可以关掉这个窗口';

/** 下载完校验文件指纹 */
export const VERIFYING_FILE = '正在校验文件…';
