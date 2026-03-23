import React, { useState } from 'react';
import { useAppStore, FileNode, HeadingNode, THEME_PRESETS } from '../../stores/appStore';
import { Folder, Search, ChevronDown, ChevronRight, FolderOpen, FileText, FileCode, FolderClosed, List, RotateCw, Sparkles } from 'lucide-react';
import { AIWritingPanel } from '../AI/AIWritingPanel';

const FileTreeItem: React.FC<{ node: FileNode; level: number }> = ({ node, level }) => {
  const { openTab, updateFileNode, activeTabId, expandedPaths, setExpanded } = useAppStore();
  const isOpen = expandedPaths.includes(node.path);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
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
  
  return (
    <div>
      <div 
        className={`tree-item ${isActive && !node.isDirectory ? 'active' : ''}`} 
        style={{ paddingLeft: `${ level * 12 + 8 }px` }}
        onClick={handleToggle}
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
        <span style={{ 
          color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {node.name}
        </span>
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

const ThemeSwitcher: React.FC = () => {
  const { theme, setTheme } = useAppStore();
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className="sidebar-footer" style={{ 
      padding: '12px', 
      borderTop: '1px solid var(--border-subtle)',
      position: 'relative',
      userSelect: 'none',
      backgroundColor: 'var(--bg-page)'
    }}>
      <div 
        onClick={() => setShowPicker(!showPicker)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '8px 12px',
          borderRadius: '10px',
          cursor: 'pointer',
          backgroundColor: 'var(--bg-surface)',
          transition: 'all 0.2s',
          border: '1px solid var(--border-subtle)',
        }}
        className="hover-bg"
      >
        <div style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: theme.gradient,
          boxShadow: `0 0 8px ${theme.shadow}`
        }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', flex: 1 }}>{theme.name}</span>
      </div>

      {showPicker && (
        <>
          <div 
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 90 }} 
            onClick={() => setShowPicker(false)}
          />
          <div style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '12px',
            right: '12px',
            backgroundColor: 'var(--bg-elevated)',
            borderRadius: '16px',
            padding: '8px',
            boxShadow: '0 -10px 30px rgba(0,0,0,0.15), 0 10px 20px rgba(0,0,0,0.05)',
            border: '1px solid var(--border-subtle)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div style={{ padding: '6px 12px 8px 12px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>主题实验室</div>
            {THEME_PRESETS.map(p => (
              <div 
                key={p.id}
                onClick={() => { setTheme(p.id); setShowPicker(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  backgroundColor: theme.id === p.id ? 'var(--bg-surface)' : 'transparent',
                  transition: 'all 0.2s',
                  border: theme.id === p.id ? '1px solid var(--border-subtle)' : '1px solid transparent'
                }}
                className="hover-bg"
              >
                <div style={{ width: 14, height: 14, borderRadius: '50%', background: p.gradient }} />
                <span style={{ fontSize: 13, color: theme.id === p.id ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: theme.id === p.id ? 600 : 400 }}>{p.name}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export const Sidebar: React.FC = () => {
  const { fileTree, workspaceName, sidebarVisible, outline, sidebarTab, setSidebarTab, refreshWorkspace } = useAppStore();

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
      <ThemeSwitcher />
    </aside>
  );
};
