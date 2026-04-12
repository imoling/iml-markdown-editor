import React from 'react';
import { useAppStore, FileNode, HeadingNode } from '../../stores/appStore';
import { Folder, ChevronDown, ChevronRight, FolderOpen, FileText, FileCode, FolderClosed, List, RotateCw, Sparkles, Star, BookOpen, Settings } from 'lucide-react';
import { AIWritingPanel } from '../AI/AIWritingPanel';

export const ActivityBar: React.FC = () => {
  const { sidebarTab, setSidebarTab, sidebarVisible } = useAppStore();

  const tabs = [
    { id: 'notes' as const, icon: <BookOpen size={16} />, label: '笔记', title: '我的笔记库' },
    { id: 'catalog' as const, icon: <List size={16} />, label: '目录', title: '文档目录' },
    { id: 'files' as const, icon: <Folder size={16} />, label: '文件', title: '工作区文件' },
  ];

  return (
    <div className="activity-bar">
      {tabs.map((t) => (
        <button
          key={t.id}
          className={`activity-bar-btn ${sidebarTab === t.id && sidebarVisible ? 'active' : ''}`}
          onClick={() => setSidebarTab(t.id)}
          title={t.title}
        >
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
};

export const RightPanel: React.FC = () => {
  const { aiPanelWidth, setAIPanelWidth } = useAppStore();
  const dragRef = React.useRef<{ startX: number; startWidth: number } | null>(null);
  const handleRef = React.useRef<HTMLDivElement>(null);

  const onPointerDown = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: aiPanelWidth };
    (e.target as HTMLDivElement).setPointerCapture(e.pointerId);
    handleRef.current?.classList.add('dragging');
  }, [aiPanelWidth]);

  const onPointerMove = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    // 右侧 panel 拖拽：向左拖 = 宽度增大
    const newW = Math.min(600, Math.max(240, dragRef.current.startWidth - (e.clientX - dragRef.current.startX)));
    setAIPanelWidth(newW);
  }, [setAIPanelWidth]);

  const onPointerUp = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    (e.target as HTMLDivElement).releasePointerCapture(e.pointerId);
    handleRef.current?.classList.remove('dragging');
  }, []);

  return (
    <aside className="right-panel" style={{ width: aiPanelWidth }}>
      <div
        ref={handleRef}
        className="right-panel-resize-handle"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      <AIWritingPanel />
    </aside>
  );
};

const FileTreeItem: React.FC<{ node: FileNode; level: number }> = ({ node, level }) => {
  const { openTab, updateFileNode, activeTabId, expandedPaths, setExpanded, starredFiles, toggleStar, selectedNodePath, setSelectedNodePath, renamingPath, setRenamingPath, renameFile, setContextMenu } = useAppStore();
  const isOpen = expandedPaths.includes(node.path);
  const [editName, setEditName] = React.useState(node.name.replace(/\.md$/i, ''));

  React.useEffect(() => {
    if (renamingPath === node.path) {
      setEditName(node.name.replace(/\.md$/i, ''));
    }
  }, [renamingPath, node.name, node.path]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNodePath(node.path);
    if (node.isDirectory) {
      if (!isOpen && (!node.children || node.children.length === 0)) {
         const result = await window.api.fs.readDir(node.path);
         if (result.success && result.files) {
            updateFileNode(node.path, { children: result.files });
         }
      }
      setExpanded(node.path, !isOpen);
    } else {
      const result = await window.api.fs.readFile(node.path);
      if (result.success && result.content !== undefined) {
         openTab({
           id: node.path,
           title: node.name,
           content: result.content,
           isDirty: false,
           mode: 'word'
         });
      } else {
        console.warn('读取文件失败:', node.path, result.error);
        alert(`文件不存在或无法读取：\n${node.name}\n\n该文件可能已被移动或删除，请刷新工作区。`);
      }
    }
  };

  const isMarkdown = node.name.toLowerCase().endsWith('.md');
  const isActive = activeTabId === node.path;
  const isSelected = selectedNodePath === node.path;
  const isRenaming = renamingPath === node.path;

  const handleRenameSubmit = async () => {
    if (editName.trim() && editName !== node.name.replace(/\.md$/i, '')) {
      const newName = node.isDirectory ? editName.trim() : `${editName.trim()}.md`;
      await renameFile(node.path, newName);
    }
    setRenamingPath(null);
  };
  
  return (
    <div>
      <div 
        className={`tree-item ${isActive && !node.isDirectory ? 'active' : ''}`} 
        style={{ 
          paddingLeft: `${ level * 12 + 8 }px`,
          backgroundColor: isSelected && !isActive ? 'rgba(255, 255, 255, 0.05)' : undefined 
        }}
        onClick={handleToggle}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setSelectedNodePath(node.path);
          setContextMenu({ visible: true, x: e.clientX, y: e.clientY, node });
        }}
      >
        {node.isDirectory ? (
          <>
            {isOpen ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />}
            {isOpen ? <FolderOpen size={14} color="var(--color-brand-indigo)" /> : <FolderClosed size={14} color="var(--color-brand-indigo)" />}
          </>
        ) : (
          <>
            <span style={{width: 14, display: 'inline-block'}}></span> 
            {isMarkdown ? (
              <FileCode size={14} color={isActive ? "var(--text-primary)" : "var(--color-accent-green)"} />
            ) : (
              <FileText size={14} color="var(--text-secondary)" />
            )}
          </>
        )}
        {isRenaming ? (
          <input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleRenameSubmit();
              } else if (e.key === 'Escape') {
                setRenamingPath(null);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1,
              background: 'var(--bg-modifier-active)',
              color: 'var(--text-primary)',
              border: '1px solid var(--color-brand-indigo)',
              borderRadius: 3,
              padding: '2px 4px',
              fontSize: 12,
              outline: 'none'
            }}
          />
        ) : (
          <span style={{ 
            color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flex: 1
          }}>
            {node.name}
          </span>
        )}
        {!node.isDirectory && !isRenaming && (
          <div 
            className={`tree-item-star ${starredFiles.includes(node.path) ? 'starred' : ''}`}
            onClick={(e) => { e.stopPropagation(); toggleStar(node.path); }}
            title={starredFiles.includes(node.path) ? "取消收藏" : "加入收藏"}
          >
            <Star size={13} strokeWidth={starredFiles.includes(node.path) ? 0 : 1.5} fill={starredFiles.includes(node.path) ? "currentColor" : "none"} />
          </div>
        )}
      </div>
      
      {node.isDirectory && isOpen && node.children && (
        <div className="tree-children">
          {node.children.map(child => (
            <FileTreeItem key={child.path} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

const StarredItem: React.FC<{ path: string }> = ({ path }) => {
  const { openTab, activeTabId, toggleStar } = useAppStore();
  const name = path.split(/[/\\]/).pop() || 'Unknown';
  const isActive = activeTabId === path;

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const result = await window.api.fs.readFile(path);
    if (result.success && result.content !== undefined) {
       openTab({
         id: path,
         title: name,
         content: result.content,
         isDirty: false,
         mode: 'word'
       });
    }
  };

  const isMarkdown = name.toLowerCase().endsWith('.md');

  return (
    <div 
      className={`tree-item ${isActive ? 'active' : ''}`} 
      style={{ paddingLeft: '8px' }}
      onClick={handleClick}
    >
      <span style={{width: 14, display: 'inline-block'}}></span> 
      {isMarkdown ? (
        <FileCode size={14} color={isActive ? "var(--text-primary)" : "var(--color-accent-green)"} />
      ) : (
        <FileText size={14} color="var(--text-secondary)" />
      )}
      <span style={{ 
        flex: 1,
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}>
        {name}
      </span>
      <div 
        className="tree-item-star starred"
        onClick={(e) => { e.stopPropagation(); toggleStar(path); }}
        title="取消收藏"
      >
        <Star size={13} strokeWidth={0} fill="currentColor" />
      </div>
    </div>
  );
};

const OutlineItem: React.FC<{ node: HeadingNode }> = ({ node }) => {
  const { scrollToHeading } = useAppStore();
  
  return (
    <div 
      className="tree-item" 
      style={{ paddingLeft: `${(node.level - 1) * 16 + 12}px`, cursor: 'pointer' }}
      onClick={() => scrollToHeading(node)}
    >
      <span style={{ 
        color: node.level === 1 ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: node.level === 1 ? '13px' : '12px',
        fontWeight: node.level === 1 ? 600 : 400
      }}>
        {node.text}
      </span>
    </div>
  );
};

const NotesPanel: React.FC = () => {
  const { defaultLibraryPath, openTab, activeTabId, renameFile, deleteFile, duplicateFile } = useAppStore();
  const [files, setFiles] = React.useState<{ name: string; path: string }[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [notesMenu, setNotesMenu] = React.useState<{ visible: boolean; x: number; y: number; file: { name: string; path: string } | null }>({ visible: false, x: 0, y: 0, file: null });
  const [renamingPath, setRenamingPath] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState('');
  const [selectedNotePath, setSelectedNotePath] = React.useState<string | null>(null);
  const renameInputRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    if (!defaultLibraryPath) return;
    setLoading(true);
    const result = await window.api.fs.readDir(defaultLibraryPath);
    if (result.success && result.files) {
      setFiles(
        result.files
          .filter((f: FileNode) => !f.isDirectory && f.name.toLowerCase().endsWith('.md'))
          .sort((a: FileNode, b: FileNode) => b.name.localeCompare(a.name))
      );
    }
    setLoading(false);
  }, [defaultLibraryPath]);

  React.useEffect(() => { load(); }, [load]);

  // 点击菜单外关闭
  React.useEffect(() => {
    if (!notesMenu.visible) return;
    const close = () => setNotesMenu(m => ({ ...m, visible: false }));
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [notesMenu.visible]);

  // 重命名输入框自动聚焦
  React.useEffect(() => {
    if (renamingPath) renameInputRef.current?.select();
  }, [renamingPath]);

  // 键盘快捷键（与文件面板保持一致）
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA') return;
      if (activeEl?.getAttribute('contenteditable') === 'true') return;
      if (!selectedNotePath || renamingPath) return;
      const file = files.find(f => f.path === selectedNotePath);
      if (!file) return;
      if (e.key === 'F2' || e.key === 'Enter') {
        e.preventDefault();
        startRename(file);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        handleDelete(file);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        handleDuplicate(file);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNotePath, renamingPath, files]);

  const openNoteMenu = (e: React.MouseEvent, file: { name: string; path: string }) => {
    e.preventDefault();
    e.stopPropagation();
    setNotesMenu({ visible: true, x: e.clientX, y: e.clientY, file });
  };

  const startRename = (file: { name: string; path: string }) => {
    setEditName(file.name.replace(/\.md$/i, ''));
    setRenamingPath(file.path);
    setNotesMenu(m => ({ ...m, visible: false }));
  };

  const submitRename = async () => {
    if (!renamingPath || !editName.trim()) { setRenamingPath(null); return; }
    const currentFile = files.find(f => f.path === renamingPath);
    if (currentFile && editName.trim() !== currentFile.name.replace(/\.md$/i, '')) {
      await renameFile(renamingPath, `${editName.trim()}.md`);
    }
    setRenamingPath(null);
    await load();
  };

  const handleDelete = async (file: { name: string; path: string }) => {
    setNotesMenu(m => ({ ...m, visible: false }));
    await deleteFile(file.path);
    await load();
  };

  const handleDuplicate = async (file: { name: string; path: string }) => {
    setNotesMenu(m => ({ ...m, visible: false }));
    await duplicateFile(file.path);
    await load();
  };

  const handleOpen = async (file: { name: string; path: string }) => {
    const existing = useAppStore.getState().tabs.find(t => t.id === file.path);
    if (existing) {
      useAppStore.getState().setActiveTab(file.path);
      return;
    }
    const result = await window.api.fs.readFile(file.path);
    if (result.success && result.content !== undefined) {
      openTab({ id: file.path, title: file.name.replace(/\.md$/i, ''), content: result.content, isDirty: false, mode: 'word' });
    } else {
      alert(`文件不存在或无法读取：\n${file.name}\n\n该文件可能已被移动或删除。`);
      load();
    }
  };

  if (!defaultLibraryPath) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center' }}>
        <BookOpen size={28} color="var(--text-muted)" style={{ marginBottom: 10, opacity: 0.5 }} />
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, lineHeight: 1.6 }}>
          笔记库未配置
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
          设置一个目录作为笔记存放位置，<br />新建文档将自动存入该目录
        </div>
        <button
          onClick={() => window.api.app.openSettings()}
          style={{
            fontSize: 11, padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border-subtle)',
            background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          <Settings size={11} /> 前往设置
        </button>
      </div>
    );
  }

  const folderName = defaultLibraryPath.split(/[/\\]/).filter(Boolean).pop() || '笔记库';
  const menuItemStyle = { padding: '6px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 4, display: 'flex', justifyContent: 'space-between', color: 'var(--text-primary)', marginBottom: 2 };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', padding: '2px 8px 6px', gap: 4 }}>
        <BookOpen size={13} color="var(--color-brand-indigo)" />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folderName}</span>
        <div
          onClick={load}
          style={{ cursor: 'pointer', padding: '2px 4px', borderRadius: 4, display: 'flex', alignItems: 'center' }}
          className="hover-bg"
          title="刷新"
        >
          <RotateCw size={11} color="var(--text-muted)" />
        </div>
      </div>
      {loading ? (
        <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>加载中…</div>
      ) : files.length === 0 ? (
        <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>暂无笔记</div>
      ) : (
        files.map((f) => {
          const isActive = activeTabId === f.path;
          const isRenaming = renamingPath === f.path;
          const isSelected = selectedNotePath === f.path;
          const title = f.name.replace(/\.md$/i, '');
          return (
            <div
              key={f.path}
              className={`tree-item ${isActive ? 'active' : ''}`}
              style={{ paddingLeft: 12, backgroundColor: isSelected && !isActive ? 'rgba(255,255,255,0.05)' : undefined }}
              onClick={() => { setSelectedNotePath(f.path); if (!isRenaming) handleOpen(f); }}
              title={f.name}
              onContextMenu={(e) => { setSelectedNotePath(f.path); openNoteMenu(e, f); }}
            >
              <FileCode size={13} color={isActive ? 'var(--text-primary)' : 'var(--color-accent-green)'} style={{ flexShrink: 0 }} />
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onBlur={submitRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); submitRename(); }
                    if (e.key === 'Escape') { setRenamingPath(null); }
                  }}
                  onClick={e => e.stopPropagation()}
                  style={{ flex: 1, fontSize: 12, background: 'var(--bg-surface)', border: '1px solid var(--color-brand-indigo)', borderRadius: 3, padding: '1px 4px', color: 'var(--text-primary)', outline: 'none', minWidth: 0 }}
                />
              ) : (
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
              )}
            </div>
          );
        })
      )}

      {/* 笔记面板独立右键菜单 */}
      {notesMenu.visible && notesMenu.file && (
        <div
          style={{
            position: 'fixed', left: notesMenu.x, top: notesMenu.y, zIndex: 9999,
            background: 'var(--glass-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--glass-border)', borderRadius: 8, padding: '4px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)', minWidth: 160
          }}
          onClick={e => e.stopPropagation()}
          onContextMenu={e => e.preventDefault()}
        >
          <div
            style={menuItemStyle}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => startRename(notesMenu.file!)}
          >
            重命名 <span style={{ opacity: 0.5, fontSize: 11 }}>F2</span>
          </div>
          <div
            style={menuItemStyle}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => handleDuplicate(notesMenu.file!)}
          >
            创建副本 <span style={{ opacity: 0.5, fontSize: 11 }}>Cmd+D</span>
          </div>
          <div
            style={{ ...menuItemStyle, color: '#ef4444' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => handleDelete(notesMenu.file!)}
          >
            推入废纸篓 <span style={{ opacity: 0.5, fontSize: 11 }}>Backspace</span>
          </div>
        </div>
      )}
    </div>
  );
};

const ContextMenuComponent = () => {
  const { contextMenu, setContextMenu, setRenamingPath, duplicateFile, deleteFile } = useAppStore();
  
  React.useEffect(() => {
    const handleClickOutside = () => setContextMenu({ visible: false });
    if (contextMenu.visible) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu.visible, setContextMenu]);

  if (!contextMenu.visible || !contextMenu.node) return null;

  const node = contextMenu.node;

  const itemStyle = {
    padding: '6px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 4, 
    display: 'flex', justifyContent: 'space-between', color: 'var(--text-primary)',
    marginBottom: 2
  };

  return (
    <div 
      style={{
        position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 9999,
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid var(--glass-border)',
        borderRadius: 8, padding: '4px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.5)', minWidth: 160
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div 
        style={itemStyle} 
        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        onClick={() => { setRenamingPath(node.path); setContextMenu({ visible: false }); }}
      >
        重命名 <span style={{opacity: 0.5, fontSize: 11}}>F2/Enter</span>
      </div>
      {!node.isDirectory && (
        <div 
          style={itemStyle}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          onClick={() => { duplicateFile(node.path); setContextMenu({ visible: false }); }}
        >
          创建副本 <span style={{opacity: 0.5, fontSize: 11}}>Cmd+D</span>
        </div>
      )}
      <div 
        style={{ ...itemStyle, color: '#ef4444' }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        onClick={() => { deleteFile(node.path); setContextMenu({ visible: false }); }}
      >
        推入废纸篓 <span style={{opacity: 0.5, fontSize: 11}}>Backspace</span>
      </div>
    </div>
  );
};

export const Sidebar: React.FC = () => {
  const { fileTree, workspaceName, sidebarVisible, outline, sidebarTab, refreshWorkspace, starredFiles } = useAppStore();

  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl) {
        if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') return;
        if (activeEl.getAttribute('contenteditable') === 'true') return;
      }
      
      const { selectedNodePath, renamingPath, setRenamingPath, duplicateFile, deleteFile } = useAppStore.getState();
      if (!selectedNodePath || renamingPath) return;

      if (e.key === 'F2' || e.key === 'Enter') {
        e.preventDefault();
        setRenamingPath(selectedNodePath);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        deleteFile(selectedNodePath);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateFile(selectedNodePath);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  if (!sidebarVisible) return null;

  return (
    <aside className="sidebar">
      <div className="sidebar-content" style={{ padding: '12px 0', overflowY: 'auto' }}>
        {sidebarTab === 'notes' ? (
          <NotesPanel />
        ) : sidebarTab === 'catalog' ? (
          <div className="catalog-view">
            {outline.length === 0 ? (
              <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
                暂无目录层级
              </div>
            ) : (
              outline.map((item) => (
                <OutlineItem key={item.id} node={item} />
              ))
            )}
          </div>
        ) : !workspaceName ? (
           <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
             按 Cmd+Shift+O 打开目录
           </div>
        ) : (
          <>
            {starredFiles.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', paddingLeft: 12, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4, opacity: 0.7 }}>
                  <span>⭐ 收藏夹</span>
                </div>
                <div>
                  {starredFiles.map(path => (
                    <StarredItem key={`star-${path}`} path={path} />
                  ))}
                </div>
              </div>
            )}
            
            <div className="tree-item" style={{ fontWeight: 600, color: 'var(--text-primary)', paddingLeft: 8, display: 'flex', alignItems: 'center' }}>
              <ChevronDown size={14} color="var(--text-muted)" />
              <FolderOpen size={14} color="var(--color-brand-indigo)" />
              <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{workspaceName}</span>
              <div 
                onClick={(e) => { e.stopPropagation(); refreshWorkspace(); }}
                style={{ cursor: 'pointer', padding: '2px 4px', borderRadius: 4, display: 'flex', alignItems: 'center' }}
                className="hover-bg"
                title="刷新文件树"
              >
                <RotateCw size={12} color="var(--text-muted)" />
              </div>
            </div>
            
            <div className="workspace-tree">
              {fileTree.length === 0 ? (
                <div style={{ padding: '12px 28px', color: 'var(--text-muted)', fontSize: 12 }}>空文件夹</div>
              ) : (
                fileTree.map(node => (
                  <FileTreeItem key={node.path} node={node} level={1} />
                ))
              )}
            </div>
          </>
        )}
      </div>
      <ContextMenuComponent />
    </aside>
  );
};
