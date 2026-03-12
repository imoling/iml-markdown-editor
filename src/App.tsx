import React, { useEffect } from 'react';
import { TitleBar } from './components/TitleBar/TitleBar';
import { Sidebar } from './components/Sidebar/Sidebar';
import { EditorArea } from './components/Editor/EditorArea';
import { StatusBar } from './components/StatusBar/StatusBar';
import { useAppStore } from './stores/appStore';
import { extractHeadings } from './utils/outline';
import './styles/layout.css';

const App: React.FC = () => {
  const { 
    toggleMode, 
    activeTabId, 
    tabs,
    sidebarVisible,
    statusBarVisible,
    setOutline,
    toggleSidebar,
    toggleToolbar,
    toggleStatusBar,
    createNewFile,
    toggleFind,
    toggleReplace,
    openFile,
    openDirectory,
    saveActiveFile,
  } = useAppStore();

  const activeTab = tabs.find(t => t.id === activeTabId);

  // Update outline when active tab content changes
  useEffect(() => {
    if (activeTab) {
      const headings = extractHeadings(activeTab.content);
      setOutline(headings);
    } else {
      setOutline([]);
    }
  }, [activeTab?.content, setOutline]);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Cmd+E to toggle mode
      if (e.metaKey && e.key === 'e') {
        e.preventDefault();
        toggleMode();
      }

      // Cmd+B to toggle sidebar
      if (e.metaKey && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
      }

      // Cmd+N to create new file
      if (e.metaKey && e.key === 'n') {
        e.preventDefault();
        createNewFile();
      }

      // Cmd+F to toggle find
      if (e.metaKey && e.key === 'f') {
        e.preventDefault();
        toggleFind();
      }

      // Cmd+H to toggle replace
      if (e.metaKey && e.key === 'h') {
        e.preventDefault();
        toggleReplace();
      }
      
      // Cmd+Shift+O to open directory
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        openDirectory();
        return;
      }

      // Cmd+O to open file
      if (e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        openFile();
      }

      // Cmd+/ to open shortcuts
      if (e.metaKey && e.key === '/') {
        e.preventDefault();
        window.api.events.send('open-shortcuts');
      }
      
      // Cmd+S or Cmd+Shift+S to save file
      if (e.metaKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveActiveFile(e.shiftKey);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleMode, openFile, openDirectory, saveActiveFile, toggleSidebar, toggleToolbar, toggleStatusBar, createNewFile, toggleFind, toggleReplace]);

  return (
    <div className="app-layout" id="app">
      <TitleBar />
      
      <div className="main-content">
        {sidebarVisible && <Sidebar />}
        <EditorArea />
      </div>
      
      {statusBarVisible && <StatusBar />}
    </div>
  );
};

export default App;
