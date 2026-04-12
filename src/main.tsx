import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AboutModal from './components/About/AboutModal';
import ShortcutsModal from './components/Help/ShortcutsModal';
import ModelConfigModal from './components/AI/ModelConfigModal';
import SearchConfigModal from './components/AI/SearchConfigModal';
import { WechatConfigModal } from './components/AI/WechatConfigModal';
import { ImageConfigModal } from './components/AI/ImageConfigModal';
import { SettingsModal } from './components/Settings/SettingsModal';
import './styles/index.css';

const urlParams = new URLSearchParams(window.location.search);
const windowParam = urlParams.get('window');

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {windowParam === 'about' ? (
      <div style={{ height: '100vh', width: '100vw', display: 'flex', overflow: 'hidden' }}>
        <AboutModal isOpen={true} onClose={() => window.close()} />
      </div>
    ) : windowParam === 'shortcuts' ? (
      <div style={{ height: '100vh', width: '100vw', display: 'flex', overflow: 'hidden' }}>
        <ShortcutsModal isOpen={true} onClose={() => window.close()} />
      </div>
    ) : windowParam === 'ai-config' ? (
      <div style={{ height: '100vh', width: '100vw', display: 'flex', overflow: 'hidden' }}>
        <ModelConfigModal isOpen={true} onClose={() => window.close()} />
      </div>
    ) : windowParam === 'search-config' ? (
      <div style={{ height: '100vh', width: '100vw', display: 'flex', overflow: 'hidden' }}>
        <SearchConfigModal isOpen={true} onClose={() => window.close()} />
      </div>
    ) : windowParam === 'wechat-config' ? (
      <div style={{ height: '100vh', width: '100vw', display: 'flex', overflow: 'hidden' }}>
        <WechatConfigModal onClose={() => window.close()} />
      </div>
    ) : windowParam === 'image-config' ? (
      <div style={{ height: '100vh', width: '100vw', display: 'flex', overflow: 'hidden' }}>
        <ImageConfigModal onClose={() => window.close()} />
      </div>
    ) : windowParam === 'settings' ? (
      <div style={{ height: '100vh', width: '100vw', display: 'flex', overflow: 'hidden' }}>
        <SettingsModal />
      </div>
    ) : (
      <App />
    )}
  </React.StrictMode>
);
