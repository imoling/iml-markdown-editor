import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, BookOpenCheck, ChevronDown, ChevronRight, Download, FileText, RefreshCw, RotateCw, Search, Sparkles, TerminalSquare } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { PanelIntro } from './PanelIntro';
import { formatDate } from '../../utils/date';
import type { ContextFile, ContextHit, ContextScan, MemoryCandidate, MemoryState, SyncPlan, ToolContext } from '../../types/window';

const NOTE_RE = /\.(md|markdown)$/i;
const NO_PROJECT = '其他';
const baseName = (name: string) => (name.split(/[\\/]/).pop() || name).replace(NOTE_RE, '');

/** 一行：缩进、可选的折叠箭头、名字、右侧的小字或角标 */
const Row: React.FC<{ depth?: number; open?: boolean | null; onClick?: () => void; title?: string; icon?: React.ReactNode; name: string; meta?: React.ReactNode; className?: string }> = ({ depth = 0, open = null, onClick, title, icon, name, meta, className = '' }) => (
  <div className={`tree-item ctx-row ${className}`} style={{ paddingLeft: 8 + depth * 14 }} onClick={onClick} title={title}>
    {open === null ? <span className="tree-item__spacer" /> : open ? <ChevronDown size={12} className="ctx-row__chev" /> : <ChevronRight size={12} className="ctx-row__chev" />}
    {icon}
    <span className="tree-item__name">{name}</span>
    {meta && <span className="ctx-row__meta">{meta}</span>}
  </div>
);

const FileRow: React.FC<{ file: ContextFile; depth: number; label?: string; onOpen: (path: string) => void; chip?: string }> = ({ file, depth, label, onOpen, chip }) => (
  <Row depth={depth} name={label ?? baseName(file.name)} title={file.path} icon={<FileText size={13} className="ctx-row__icon" />} onClick={() => onOpen(file.path)}
    meta={<>{chip && <span className="ctx-chip">{chip}</span>}{file.modifiedAt > 0 && formatDate(new Date(file.modifiedAt))}</>} />
);

/** 一个工具：规则文件、按项目分的记忆、技能数 */
const ToolNode: React.FC<{ tool: ToolContext; onOpen: (path: string) => void; synced?: boolean | null }> = ({ tool, onOpen, synced = null }) => {
  const [open, setOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [openProjects, setOpenProjects] = useState<Set<string>>(new Set());
  const projects = useMemo(() => {
    const groups = new Map<string, ContextFile[]>();
    for (const f of tool.memory) groups.set(f.project || NO_PROJECT, [...(groups.get(f.project || NO_PROJECT) ?? []), f]);
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [tool.memory]);
  const toggleProject = (p: string) => setOpenProjects((prev) => { const next = new Set(prev); if (next.has(p)) next.delete(p); else next.add(p); return next; });
  const status = synced === true ? '已同步' : synced === false ? '未同步' : tool.identity.length === 0 ? '没有规则文件' : !tool.knowsUser ? '没写你是谁' : tool.updatedAt ? formatDate(new Date(tool.updatedAt)) : '';
  const warn = synced === false || (synced === null && (tool.identity.length === 0 || !tool.knowsUser));
  const projectCount = projects.filter(([p]) => p !== NO_PROJECT).length;
  return (
    <>
      <Row open={open} onClick={() => setOpen((v) => !v)} icon={<Bot size={13} className="ctx-row__icon ctx-row__icon--tool" />} name={tool.name}
        meta={<span className={warn ? 'ctx-badge ctx-badge--warn' : synced ? 'ctx-badge ctx-badge--ok' : ''}>{status}</span>} className="ctx-row--tool" />
      {open && (
        <>
          {tool.identity.map((f) => <FileRow key={f.path} file={f} depth={1} label={f.name} chip="规则" onOpen={onOpen} />)}
          {tool.memory.length > 0 && (
            <Row depth={1} open={memoryOpen} onClick={() => setMemoryOpen((v) => !v)} name="记忆" meta={`${tool.memory.length} 条${projectCount > 1 ? ` · ${projectCount} 个项目` : ''}`} />
          )}
          {memoryOpen && projects.map(([project, files]) => (
            projects.length === 1 ? files.map((f) => <FileRow key={f.path} file={f} depth={2} onOpen={onOpen} />) : (
              <React.Fragment key={project}>
                <Row depth={2} open={openProjects.has(project)} onClick={() => toggleProject(project)} name={project} meta={files.length} />
                {openProjects.has(project) && files.map((f) => <FileRow key={f.path} file={f} depth={3} onOpen={onOpen} />)}
              </React.Fragment>
            )
          ))}
          {tool.skills > 0 && <Row depth={1} name="技能" meta={`${tool.skills} 个`} className="ctx-row--muted" />}
        </>
      )}
    </>
  );
};

/** AI 上下文：上半是你的记忆库，下半是各工具自己记的；点一下就地打开，改的就是那个文件本身 */
export const AiContextPanel: React.FC = () => {
  const openFileByPath = useAppStore((s) => s.openFileByPath);
  const openDialog = useAppStore((s) => s.openDialog);
  const notify = useAppStore((s) => s.notify);
  const libraryVersion = useAppStore((s) => s.libraryVersion);
  const workspacePath = useAppStore((s) => s.workspacePath);
  const [scan, setScan] = useState<ContextScan | null>(null);
  const [memory, setMemory] = useState<MemoryState | null>(null);
  const [candidates, setCandidates] = useState<MemoryCandidate[]>([]);
  const [cli, setCli] = useState<{ installed: boolean; path: string } | null>(null);
  const [sync, setSync] = useState<SyncPlan | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ContextHit[] | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    void window.api.aiContext.scan().then(async (s) => {
      if (!alive) return;
      setScan(s);
      // 记忆库和采集都要等扫描完：采集看的是扫出来的文件
      const [m, h, c, p] = await Promise.all([window.api.aiContext.memoryState(), window.api.aiContext.harvest(), window.api.aiContext.cliState(), window.api.aiContext.syncPlan()]);
      if (!alive) return;
      setMemory(m); setCandidates(h.candidates); setCli(c); setSync(p);
    }).catch(() => { if (alive) setScan({ tools: [], cloud: [] }); });
    return () => { alive = false; };
  }, [libraryVersion, workspacePath, tick]);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setHits(null); return; }
    let alive = true;
    const timer = setTimeout(() => { void window.api.aiContext.search(q).then((r) => { if (alive) setHits(r); }); }, 200);
    return () => { alive = false; clearTimeout(timer); };
  }, [query, tick]);

  const open = useCallback((p: string) => { void openFileByPath(p); }, [openFileByPath]);
  const pendingByDomain = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of candidates) m.set(c.domain, (m.get(c.domain) ?? 0) + 1);
    return m;
  }, [candidates]);
  const createMemory = async () => {
    const state = await window.api.aiContext.createMemory();
    if (!state) { notify('先打开一个笔记库'); return; }
    setMemory(state);
    notify('记忆库建在笔记库的「记忆」里');
  };
  const installCli = async () => {
    const state = await window.api.aiContext.installCli();
    setCli(state);
    notify(`已安装到 ${state.path}`);
  };

  if (!scan) return <div className="ctx-panel"><div className="ctx-empty">正在扫描…</div></div>;

  const nothing = scan.tools.length === 0 && scan.cloud.length === 0 && !memory?.exists;
  if (nothing) {
    return (
      <div className="ctx-panel">
        <PanelIntro icon={<Bot size={20} />} title="AI 上下文" lead="各 AI 工具记住的你，和你自己维护的记忆库"
          points={[
            { icon: <FileText size={12} />, text: 'Claude Code、Codex、Hermes 的身份和记忆文件在这里能看能改' },
            { icon: <BookOpenCheck size={12} />, text: '记忆库放在笔记库的「记忆」里，换工具让它先读这个' },
          ]}>
          <div className="panel-intro__action">
            <button className="btn btn-primary panel-intro__cta" onClick={() => void createMemory()} disabled={!workspacePath}><BookOpenCheck size={14} /> 建立记忆库</button>
            {!workspacePath && <div className="panel-intro__note">先打开一个笔记库</div>}
          </div>
        </PanelIntro>
      </div>
    );
  }

  const pendingTotal = candidates.length;
  return (
    <div className="ctx-panel">
      <div className="ctx-panel__head">
        <Bot size={14} className="ctx-row__icon--tool" />
        <span className="ctx-panel__title">AI 上下文</span>
        <button className="icon-btn icon-btn--sm hover-bg" onClick={() => setTick((n) => n + 1)} title="重新扫描"><RotateCw size={12} /></button>
      </div>
      <div className="search-panel__input-wrap">
        <Search size={13} color="var(--text-muted)" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜身份和记忆" className="search-panel__input" />
      </div>

      <div className="ctx-panel__body">
        {hits ? (
          hits.length === 0 ? <div className="ctx-empty">没有找到</div> : hits.map((hit) => (
            <button key={hit.file.path} className="ctx-hit" onClick={() => open(hit.file.path)} title={hit.file.path}>
              <span className="ctx-hit__where truncate">{hit.tool} · {hit.file.name}</span>
              <span className="ctx-hit__snippet">{hit.snippet}</span>
            </button>
          ))
        ) : (
          <>
            <div className="sidebar-section-title">记忆库{memory?.exists ? ' · 笔记库/记忆' : ''}</div>
            {!memory && <div className="ctx-empty">先打开一个笔记库</div>}
            {memory && !memory.exists && (
              <div className="ctx-build">
                <div className="ctx-build__text">各工具记的东西提炼进来，换工具时让它先读这里</div>
                <button className="btn btn-primary btn-xs" onClick={() => void createMemory()}><BookOpenCheck size={12} /> 建立记忆库</button>
              </div>
            )}
            {memory?.files.map((f) => (
              <Row key={f.path} depth={1} name={f.name} title={f.path} icon={<FileText size={13} className="ctx-row__icon" />} onClick={() => open(f.path)}
                meta={<>{f.localOnly && <span className="ctx-chip">仅本机</span>}{(pendingByDomain.get(f.name) ?? 0) > 0 && <span className="ctx-badge">待加入 {pendingByDomain.get(f.name)}</span>}</>} />
            ))}

            <div className="sidebar-section-title ctx-section">来源</div>
            {scan.tools.map((tool) => {
              const row = sync?.ready ? sync.rows.find((r) => r.id === tool.id && r.status !== 'not-installed') : undefined;
              return <ToolNode key={tool.id} tool={tool} onOpen={open} synced={row ? row.status === 'current' : null} />;
            })}
            {scan.tools.length === 0 && <div className="ctx-empty">本机没有找到 AI 工具</div>}
            {scan.cloud.length > 0 && <div className="ctx-empty">{scan.cloud.join('、')}：装了，内容在云端</div>}
          </>
        )}
      </div>

      <div className="ctx-panel__foot">
        <button className={`btn btn-xs ctx-panel__action ${pendingTotal ? 'btn-primary' : 'btn-ghost'}`} disabled={pendingTotal === 0 || !workspacePath} onClick={() => openDialog('memory-harvest')}>
          <Sparkles size={12} /> {pendingTotal ? `提炼 ${pendingTotal} 条新记忆` : '都提炼过了'}
        </button>
        <button className="btn btn-ghost btn-xs ctx-panel__action" disabled={!sync?.ready} onClick={() => openDialog('memory-sync')}>
          <RefreshCw size={12} /> 同步到各工具{sync?.ready && sync.rows.some((r) => r.status !== 'current' && r.status !== 'not-installed') ? ` · ${sync.rows.filter((r) => r.status !== 'current' && r.status !== 'not-installed').length}` : ''}
        </button>
        <button className="btn btn-ghost btn-xs ctx-panel__action" disabled={!memory?.exists} onClick={() => openDialog('memory-export')}><Download size={12} /> 导出一份给别的 AI</button>
        {cli && (
          <div className="ctx-panel__cli" title={cli.path}>
            <TerminalSquare size={12} />
            <span className="truncate">{cli.installed ? '命令行工具已安装' : '命令行工具'}</span>
            {!cli.installed && <button className="btn btn-ghost btn-xs" onClick={() => void installCli()}>安装</button>}
          </div>
        )}
      </div>
    </div>
  );
};
