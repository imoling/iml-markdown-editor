import React from 'react';
import { useAppStore, FileNode, HeadingNode } from '../../stores/appStore';
import { Folder, ChevronDown, ChevronRight, FolderOpen, FileText, FileCode, FolderClosed, List, RotateCw, Sparkles, Star } from 'lucide-react';
import { AIWritingPanel } from '../AI/AIWritingPanel';

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
  const { fileTree, workspaceName, sidebarVisible, outline, sidebarTab, setSidebarTab, refreshWorkspace, starredFiles } = useAppStore();

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
      <div className="sidebar-tabs">
        <div 
          className={`sidebar-tab ${sidebarTab === 'ai' ? 'active' : ''}`}
          onClick={() => setSidebarTab('ai')}
          title="智能助手"
        >
          <Sparkles size={14} />
          <span>助手</span>
        </div>
        <div 
          className={`sidebar-tab ${sidebarTab === 'catalog' ? 'active' : ''}`}
          onClick={() => setSidebarTab('catalog')}
          title="文档目录"
        >
          <List size={14} />
          <span>目录</span>
        </div>
        <div 
          className={`sidebar-tab ${sidebarTab === 'files' ? 'active' : ''}`}
          onClick={() => setSidebarTab('files')}
          title="文件导航"
        >
          <Folder size={14} />
          <span>文件</span>
        </div>
      </div>
      
      <div className="sidebar-content" style={{ padding: '12px 0', overflowY: 'auto' }}>
        {sidebarTab === 'ai' ? (
          <AIWritingPanel />
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
