import React, { useState, useEffect } from 'react';
import { X, Moon, Sun, Monitor, Palette, Power, Save, Trash2, AlertTriangle, FolderOpen, Coffee, Type, ImageDown, Link2, SpellCheck, ShieldCheck, ImageOff, Paintbrush, Keyboard } from 'lucide-react';
import { QuickCaptureRow } from './QuickCaptureRow';
import { libraryToReturnTo } from '../../../electron/shared/syncFolders';
import { DEFAULT_CAPTURE_SHORTCUT } from '../../../electron/shared/capture';
import { useAppStore, THEME_PRESETS, EDITOR_FONTS, PAGE_WIDTHS, DEFAULT_EDITOR_PREFS, normalizeEditorPrefs, applyEditorPrefs, type EditorPrefs } from '../../stores/appStore';

type AppearanceMode = 'light' | 'dark' | 'system' | 'eye-protection';

const APPEARANCE_OPTIONS: { id: AppearanceMode; name: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'system', name: '系统', icon: Monitor },
  { id: 'light', name: '亮色', icon: Sun },
  { id: 'dark', name: '深色', icon: Moon },
  { id: 'eye-protection', name: '护眼', icon: Coffee },
];

interface Props {
  /** 主窗口内浮层模式的关闭回调；独立窗口（?window=settings）不需要 */
  onClose?: () => void;
}

/** 全局设置：改动先缓存在本地，保存时一次写盘；外观与主题改动实时预览。既可作主窗口内的浮层，也可作独立窗口 */
export const SettingsModal: React.FC<Props> = ({ onClose }) => {
  const isStandalone = new URLSearchParams(window.location.search).get('window') === 'settings';
  const isMac = window.api.app.platform === 'darwin';
  const { setTheme, applyAppearance, loadSettings, openDialog } = useAppStore();
  const isOpen = isStandalone || !!onClose;

  const [local, setLocal] = useState({
    appearanceMode: 'light' as string,
    startupBehavior: 'restore' as string,
    autoSave: true,
    defaultLibraryPath: '',
    /** 放进同步盘之前笔记库在哪：「改回原来的目录」要用；不在同步盘里时为空 */
    libraryPathBeforeSync: '',
    themeId: 'indigo',
    editorPrefs: DEFAULT_EDITOR_PREFS as EditorPrefs,
    imageCompression: true,
    fetchLinkTitle: true,
    linkPreview: true,
    userCss: true,
    vimMode: false,
    spellcheck: false,
    aiEnabled: true,
    quickCapture: { enabled: true, shortcut: DEFAULT_CAPTURE_SHORTCUT },
  });

  // 从磁盘加载并预览
  useEffect(() => {
    if (!isOpen) return;
    window.api.app.getSettings().then((settings: any) => {
      if (!settings) return;
      setLocal({
        appearanceMode: settings.appearanceMode || 'light',
        startupBehavior: settings.startupBehavior || 'restore',
        autoSave: settings.autoSave ?? true,
        defaultLibraryPath: settings.defaultLibraryPath || '',
        libraryPathBeforeSync: settings.libraryPathBeforeSync || '',
        themeId: settings.themeId || 'indigo',
        editorPrefs: normalizeEditorPrefs(settings.editorPrefs),
        imageCompression: settings.imageCompression ?? true,
        fetchLinkTitle: settings.fetchLinkTitle ?? true,
        linkPreview: settings.linkPreview ?? true,
        userCss: settings.userCss ?? true,
        vimMode: !!settings.vimMode,
        spellcheck: !!settings.spellcheck,
        aiEnabled: settings.aiEnabled ?? true,
        quickCapture: { enabled: settings.quickCapture?.enabled !== false, shortcut: settings.quickCapture?.shortcut || DEFAULT_CAPTURE_SHORTCUT },
      });
      applyAppearance(settings.appearanceMode || 'light');
      setTheme(settings.themeId || 'indigo');
    });
  }, [isOpen]);

  // 本机装了哪些同步盘（iCloud Drive、坚果云、OneDrive…）：一键把笔记库放进去，多台设备就共用一份了。没装的不显示
  const [syncFolders, setSyncFolders] = useState<{ id: string; name: string; root: string; libraryPath: string; libraryExists: boolean }[]>([]);
  useEffect(() => {
    window.api.app.detectSyncFolders().then(setSyncFolders).catch(() => setSyncFolders([]));
  }, []);
  /** 现在的笔记库是不是已经在某个同步盘里了 */
  const syncedIn = syncFolders.find((f) => local.defaultLibraryPath === f.root || local.defaultLibraryPath.startsWith(f.root + (f.root.includes('\\') ? '\\' : '/')));
  const moveLibraryInto = async (folder: { libraryPath: string; libraryExists: boolean }) => {
    // 选了才建目录（检测的时候不建）：免得只是打开设置看一眼，同步盘里就多出一个空文件夹
    if (!folder.libraryExists && !(await window.api.fs.exists(folder.libraryPath))) await window.api.fs.mkdir(folder.libraryPath);
    // 记下放进去之前的位置，反悔时能一键改回来；本来就在（另一个）同步盘里的话保留最早那个
    setLocal((s) => ({ ...s, defaultLibraryPath: folder.libraryPath, libraryPathBeforeSync: syncedIn ? s.libraryPathBeforeSync : s.defaultLibraryPath }));
  };
  /** 再点一下打了勾的同步盘，或点「改回原来的目录」：回到放进去之前的目录。笔记文件一律不动，只是换个地方看 */
  const leaveSyncFolder = async () => {
    const home = await window.api.app.homeLibraryPath();
    const before = local.libraryPathBeforeSync;
    const target = libraryToReturnTo([{ path: before, exists: !!before && (await window.api.fs.exists(before)) }, home]);
    if (target) setLocal((s) => ({ ...s, defaultLibraryPath: target, libraryPathBeforeSync: '' }));
    else {
      // 原来的目录和默认目录都不在了：只能请用户自己选
      const result = await window.api.dialog.open({ properties: ['openDirectory'] });
      if (result && result.length > 0) setLocal((s) => ({ ...s, defaultLibraryPath: result[0], libraryPathBeforeSync: '' }));
    }
  };

  if (!isOpen) return null;

  const close = () => (isStandalone ? window.close() : onClose?.());

  const setAppearance = (mode: AppearanceMode) => {
    const next = { ...local, appearanceMode: mode };
    setLocal(next);
    applyAppearance(mode);
    window.api.app.previewSettings(next);
  };
  const setThemeId = (themeId: string) => {
    const next = { ...local, themeId };
    setLocal(next);
    setTheme(themeId);
    window.api.app.previewSettings(next);
  };
  // 排版改动实时预览；取消时 loadSettings 会从磁盘恢复
  const setPrefs = (patch: Partial<EditorPrefs>) => {
    const editorPrefs = normalizeEditorPrefs({ ...local.editorPrefs, ...patch });
    setLocal((s) => ({ ...s, editorPrefs }));
    applyEditorPrefs(editorPrefs);
  };
  const toggleRow = (key: 'imageCompression' | 'fetchLinkTitle' | 'linkPreview' | 'userCss' | 'vimMode' | 'spellcheck' | 'aiEnabled', icon: React.ReactNode, title: string, desc: string) => (
    <div className="settings-row">
      <div className="settings-row__label">
        {icon}
        <div>
          <div className="settings-row__title">{title}</div>
          <div className="settings-row__desc">{desc}</div>
        </div>
      </div>
      <label className={`toggle ${local[key] ? 'toggle--on' : ''}`}>
        <input type="checkbox" checked={local[key]} onChange={(e) => setLocal((s) => ({ ...s, [key]: e.target.checked }))} />
        <span className="toggle__track"><span className="toggle__thumb" /></span>
      </label>
    </div>
  );
  const handleSelectLibrary = async () => {
    const result = await window.api.dialog.open({ properties: ['openDirectory'] });
    if (result && result.length > 0) setLocal((s) => ({ ...s, defaultLibraryPath: result[0] }));
  };
  const handleClearSession = () => {
    if (window.confirm('重置界面状态？标签页、最近打开、收藏会清空，笔记和设置不受影响。')) {
      // 会话只存在于主窗口，这里通知主窗口清空并重载
      window.api.app.clearSession();
      close();
    }
  };
  const handleSave = async () => {
    await window.api.app.saveSettings({ ...local });
    if (!isStandalone) await loadSettings();
    close();
  };
  const handleCancel = () => {
    if (isStandalone) window.api.app.revertSettings(); // 通知主窗口从磁盘恢复
    else loadSettings(); // 浮层就在主窗口里，直接从磁盘恢复
    close();
  };

  return (
    <div className={isStandalone ? 'standalone' : 'modal-backdrop'} onClick={isStandalone ? undefined : handleCancel}>
      {isStandalone && <div className="standalone-drag" />}
      <div className={isStandalone ? 'standalone-card' : 'modal-card modal-card--wide modal-card--flush'} onClick={(e) => e.stopPropagation()}>
        <header className={`modal-head ${isStandalone ? 'modal-head--standalone' : ''}`}>
          <h2 className="modal-title">全局设置</h2>
          {(!isStandalone || !isMac) && <button onClick={handleCancel} className="icon-btn" title="关闭"><X size={20} /></button>}
        </header>
        <div className={isStandalone ? 'standalone-scroll standalone-scroll--headed' : 'modal-body modal-body--headed'}>

          <div className="col gap-24">
            <section>
              <h3 className="settings-section-title">外观界面</h3>
              <div className="settings-card settings-card--grid">
                {APPEARANCE_OPTIONS.map((item) => (
                  <button key={item.id} onClick={() => setAppearance(item.id)} className={`appearance-btn ${local.appearanceMode === item.id ? 'appearance-btn--active' : ''}`}>
                    <item.icon size={18} />
                    <span className="text-sm fw-500">{item.name}</span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3 className="settings-section-title"><Palette size={14} /> 品牌主题</h3>
              <div className="settings-card settings-card--grid2">
                {THEME_PRESETS.map((p) => {
                  const active = local.themeId === p.id;
                  return (
                    <button key={p.id} onClick={() => setThemeId(p.id)} className={`theme-btn ${active ? 'theme-btn--active' : ''}`}>
                      <div className="theme-btn__swatch" style={{ background: p.gradient, boxShadow: active ? `0 0 10px ${p.shadow}` : 'none' }} />
                      <span className={`text-sm ${active ? 'fw-600' : ''}`}>{p.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <h3 className="settings-section-title"><Type size={14} /> 正文排版</h3>
              <div className="settings-card">
                <div className="settings-row">
                  <div>
                    <div className="settings-row__title">正文字体</div>
                                      </div>
                  <select className="settings-select" value={local.editorPrefs.font} onChange={(e) => setPrefs({ font: e.target.value as EditorPrefs['font'] })}>
                    {(Object.keys(EDITOR_FONTS) as EditorPrefs['font'][]).map((id) => <option key={id} value={id}>{EDITOR_FONTS[id].label}</option>)}
                  </select>
                </div>
                <div className="settings-divider" />
                <div className="settings-row">
                  <div><div className="settings-row__title">字号</div></div>
                  <div className="settings-range">
                    <input type="range" min={13} max={22} step={1} value={local.editorPrefs.fontSize} onChange={(e) => setPrefs({ fontSize: Number(e.target.value) })} />
                    <span className="settings-range__value">{local.editorPrefs.fontSize}px</span>
                  </div>
                </div>
                <div className="settings-divider" />
                <div className="settings-row">
                  <div><div className="settings-row__title">行距</div></div>
                  <div className="settings-range">
                    <input type="range" min={1.3} max={2.4} step={0.1} value={local.editorPrefs.lineHeight} onChange={(e) => setPrefs({ lineHeight: Number(e.target.value) })} />
                    <span className="settings-range__value">{local.editorPrefs.lineHeight.toFixed(1)}</span>
                  </div>
                </div>
                <div className="settings-divider" />
                <div className="settings-row">
                  <div><div className="settings-row__title">页面宽度</div></div>
                  <div className="seg-switch">
                    {(Object.keys(PAGE_WIDTHS) as EditorPrefs['pageWidth'][]).map((id) => (
                      <button key={id} onClick={() => setPrefs({ pageWidth: id })} className={`seg-switch__btn ${local.editorPrefs.pageWidth === id ? 'seg-switch__btn--active' : ''}`}>{PAGE_WIDTHS[id].label}</button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h3 className="settings-section-title">粘贴与输入</h3>
              <div className="settings-card">
                {toggleRow('imageCompression', <ImageDown size={18} color="var(--text-muted)" />, '粘贴图片时压缩', '大图转成 WebP，通常小一半；动图和矢量图不动')}
                <div className="settings-divider" />
                {toggleRow('fetchLinkTitle', <Link2 size={18} color="var(--text-muted)" />, '粘贴网址时取网页标题', '单独粘贴一个网址时，取回标题变成 [标题](网址)')}
                <div className="settings-divider" />
                {toggleRow('userCss', <Paintbrush size={18} color="var(--text-muted)" />, '自定义样式', '笔记库里的 .iml/snippets.css，保存即生效')}
                {local.userCss && !isStandalone && (
                  <div className="quick-capture-row"><button className="btn btn-ghost btn-xs" onClick={() => void useAppStore.getState().revealUserCss()}>在{window.api.app.platform === 'darwin' ? '访达' : '资源管理器'}中显示片段文件</button><span className="quick-capture-row__status">没有就先建一个，里面有几条示例</span></div>
                )}
                <div className="settings-divider" />
                {toggleRow('linkPreview', <Link2 size={18} color="var(--text-muted)" />, '链接悬浮预览', '鼠标停在 [[链接]] 上半秒，弹出那篇的内容')}
                <div className="settings-divider" />
                {toggleRow('vimMode', <Keyboard size={18} color="var(--text-muted)" />, '源码模式用 Vim 键位', 'hjkl 移动、i 插入、:w 保存；只在源码模式生效')}
                <div className="settings-divider" />
                {toggleRow('spellcheck', <SpellCheck size={18} color="var(--text-muted)" />, '英文拼写检查', '用系统词典标红拼错的英文词')}
                <div className="settings-divider" />
                <QuickCaptureRow value={local.quickCapture} onChange={(quickCapture) => setLocal((s) => ({ ...s, quickCapture }))} />
              </div>
            </section>

            <section>
              <h3 className="settings-section-title"><ShieldCheck size={14} /> AI 与隐私</h3>
              <div className="settings-card">
                {toggleRow('aiEnabled', <ShieldCheck size={18} color="var(--text-muted)" />, '启用 AI 功能', '关掉后隐藏所有 AI 入口，也不再发任何请求')}
                <div className="hint">状态栏右侧一直显示 AI 请求发往哪里：本机还是云端</div>
              </div>
            </section>

            <section>
              <h3 className="settings-section-title">常规选项</h3>
              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-row__label">
                    <Power size={18} color="var(--text-muted)" />
                    <div>
                      <div className="settings-row__title">启动时打开</div>
                    </div>
                  </div>
                  <div className="seg-switch">
                    <button onClick={() => setLocal((s) => ({ ...s, startupBehavior: 'restore' }))} className={`seg-switch__btn ${local.startupBehavior === 'restore' ? 'seg-switch__btn--active' : ''}`}>上次打开的笔记</button>
                    <button onClick={() => setLocal((s) => ({ ...s, startupBehavior: 'dashboard' }))} className={`seg-switch__btn ${local.startupBehavior === 'dashboard' ? 'seg-switch__btn--active' : ''}`}>首页</button>
                  </div>
                </div>

                <div className="settings-divider" />

                <div className="settings-row">
                  <div className="settings-row__label">
                    <Save size={18} color="var(--text-muted)" />
                    <div>
                      <div className="settings-row__title">自动保存</div>
                      <div className="settings-row__desc">切走时自动存盘，未命名的存进笔记库</div>
                    </div>
                  </div>
                  <label className={`toggle ${local.autoSave ? 'toggle--on' : ''}`}>
                    <input type="checkbox" checked={local.autoSave} onChange={(e) => setLocal((s) => ({ ...s, autoSave: e.target.checked }))} />
                    <span className="toggle__track"><span className="toggle__thumb" /></span>
                  </label>
                </div>
              </div>
            </section>

            <section>
              <h3 className="settings-section-title">笔记库</h3>
              <div className="settings-card gap-10">
                <div className="settings-row">
                  <div>
                    <div className="settings-row__title">笔记库位置</div>
                    <div className="settings-row__desc">新建的笔记都放在这里</div>
                  </div>
                  <div className="row gap-10">
                    <button onClick={handleSelectLibrary} className="btn-link"><FolderOpen size={12} /> 更改目录</button>
                  </div>
                </div>
                <div className="path-box">{local.defaultLibraryPath || '未设置'}</div>
                {syncFolders.length > 0 && (
                  <div className="sync-folders">
                    <span className="sync-folders__label">放进同步盘，多台设备共用：</span>
                    {syncFolders.map((f) => {
                      const active = syncedIn?.id === f.id;
                      return (
                        <button key={f.id} onClick={() => void (active ? leaveSyncFolder() : moveLibraryInto(f))} title={active ? '再点一下改回原来的目录，笔记文件不会动' : f.libraryPath} className={`sync-folders__btn ${active ? 'sync-folders__btn--active' : ''}`}>
                          ☁︎ {f.name}{active ? ' ✓' : ''}
                        </button>
                      );
                    })}
                    {syncedIn && <button onClick={() => void leaveSyncFolder()} className="btn-link sync-folders__leave">改回原来的目录</button>}
                  </div>
                )}
                <div className="hint">
                  {syncedIn
                    ? `笔记库已经在「${syncedIn.name}」里，由它负责同步。${local.libraryPathBeforeSync ? `原来目录里的笔记还留在原处，没有自动搬过去；要合并的话，在访达里把它们拖进新目录即可。` : ''}`
                    : '笔记库就是个普通文件夹，放进同步盘的目录即可；换目录不会搬动已有笔记'}
                  外部改动会自动刷新，未保存的标签页会用橙点提示；覆盖之前版本历史会留底。
                </div>
                {!isStandalone && (
                  <>
                    <div className="settings-divider" />
                    <div className="settings-row">
                      <div>
                        <div className="settings-row__title">清理未引用的图片</div>
                        <div className="settings-row__desc">没有任何笔记用到的图片，确认后移入废纸篓</div>
                      </div>
                      <button onClick={() => { handleCancel(); openDialog('image-cleanup'); }} className="btn-link"><ImageOff size={12} /> 开始扫描</button>
                    </div>
                  </>
                )}
              </div>
            </section>

            <section>
              <h3 className="settings-section-title settings-section-title--danger"><AlertTriangle size={14} /> 重置</h3>
              <div className="settings-card settings-card--danger">
                <div>
                  <div className="settings-row__title settings-row__title--danger">重置界面状态</div>
                  <div className="settings-row__desc">关掉所有标签页，清空最近打开和收藏；笔记和设置不动</div>
                </div>
                <button onClick={handleClearSession} className="btn btn-danger"><Trash2 size={14} /> 重置</button>
              </div>
            </section>
          </div>
        </div>

        <div className={isStandalone ? 'standalone-footer' : 'modal-footer'}>
          <button onClick={handleSave} className="btn btn-primary btn-block">保存</button>
          <button onClick={handleCancel} className="btn btn-secondary btn-wide">取消</button>
        </div>
      </div>
    </div>
  );
};
