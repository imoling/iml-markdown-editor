import React, { useState } from 'react';
import { useAppStore, FileNode, HeadingNode } from '../../stores/appStore';
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
    </aside>
  );
};
