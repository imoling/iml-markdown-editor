import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AboutModal from './components/About/AboutModal';
import ShortcutsModal from './components/Help/ShortcutsModal';
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
    ) : (
      <App />
    )}
  </React.StrictMode>
);
