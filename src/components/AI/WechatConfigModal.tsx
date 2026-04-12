import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Edit2, X } from 'lucide-react';
import type { WechatAccount } from '../../types/window';

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6,
  display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 10,
  border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-main)',
  color: 'var(--text-primary)', fontSize: 13, outline: 'none',
  marginBottom: 16, boxSizing: 'border-box',
};

const THEME_OPTIONS = ['default', 'grace', 'simple', 'modern'];
const COLOR_OPTIONS = [
  { value: 'blue', label: '蓝色' },
  { value: 'green', label: '绿色' },
  { value: 'purple', label: '紫色' },
  { value: 'red', label: '红色' },
  { value: 'orange', label: '橙色' },
  { value: 'black', label: '黑色' },
];

function genId() {
  return `acct-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const emptyAccount = (): WechatAccount => ({
  id: genId(), name: '', appId: '', appSecret: '',
  author: '', defaultTheme: 'default', defaultColor: 'blue',
});

interface FormProps {
  initial: WechatAccount;
  onFormChange: (form: WechatAccount, isValid: boolean) => void;
}

const AccountForm: React.FC<FormProps> = ({ initial, onFormChange }) => {
  const [form, setForm] = useState<WechatAccount>({ ...initial });
  const [showSecret, setShowSecret] = useState(false);

  const update = (patch: Partial<WechatAccount>) => {
    const next = { ...form, ...patch };
    setForm(next);
    onFormChange(next, !!(next.name && next.appId && next.appSecret));
  };

  const field = (key: keyof WechatAccount, label: string, placeholder = '', type = 'text') => (
    <>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={key === 'appSecret' && !showSecret ? 'password' : type}
          value={(form[key] as string) || ''}
          onChange={e => update({ [key]: e.target.value })}
          placeholder={placeholder}
          style={inputStyle}
        />
        {key === 'appSecret' && (
          <button
            type="button"
            onClick={() => setShowSecret(!showSecret)}
            style={{
              position: 'absolute', right: 12, top: 10,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 11,
            }}
          >
            {showSecret ? '隐藏' : '显示'}
          </button>
        )}
      </div>
    </>
  );

  return (
    <div>
      {field('name', '账号名称 *', '例：AI 开发者周刊')}
      {field('appId', 'AppID *', 'wx...')}
      {field('appSecret', 'AppSecret *', '在公众号后台"开发→基本配置"获取')}
      {field('author', '默认作者', '可留空')}

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>默认主题</label>
          <select
            value={form.defaultTheme || 'default'}
            onChange={e => update({ defaultTheme: e.target.value })}
            style={{ ...inputStyle, marginBottom: 0 }}
          >
            {THEME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>默认颜色</label>
          <select
            value={form.defaultColor || 'blue'}
            onChange={e => update({ defaultColor: e.target.value })}
            style={{ ...inputStyle, marginBottom: 0 }}
          >
            {COLOR_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{
        borderRadius: 10, border: '1px solid rgba(99,102,241,0.2)',
        backgroundColor: 'rgba(99,102,241,0.04)',
        padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)',
        lineHeight: 1.6,
      }}>
        AppID 和 AppSecret 在{' '}
        <span
          style={{ color: 'var(--color-brand-indigo)', cursor: 'pointer' }}
          onClick={() => window.api.shell.openExternal('https://mp.weixin.qq.com')}
        >
          mp.weixin.qq.com
        </span>
        {' '}→ 开发 → 基本配置 中获取。
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

export const WechatConfigModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const isStandalone = new URLSearchParams(window.location.search).get('window') === 'wechat-config';
  const isMac = window.api.app.platform === 'darwin';

  const [accounts, setAccounts] = useState<WechatAccount[]>([]);
  const [editing, setEditing] = useState<WechatAccount | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingForm, setPendingForm] = useState<WechatAccount | null>(null);
  const [isFormValid, setIsFormValid] = useState(false);

  useEffect(() => {
    window.api.wechat.getConfig().then(cfg => setAccounts(cfg.accounts || []));
  }, []);

  const persist = async (list: WechatAccount[]) => {
    setSaving(true);
    await window.api.wechat.saveConfig({ accounts: list });
    setSaving(false);
    setAccounts(list);
  };

  const handleSaveAccount = (a: WechatAccount) => {
    const next = editing
      ? accounts.map(x => (x.id === a.id ? a : x))
      : [...accounts, a];
    persist(next);
    setEditing(null);
    setAdding(false);
  };

  const handleDelete = (id: string) => {
    persist(accounts.filter(a => a.id !== id));
  };

  const containerStyle: React.CSSProperties = isStandalone
    ? { height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', background: 'transparent', overflow: 'hidden' }
    : { position: 'fixed', inset: 0, zIndex: 2000, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center' };

  const cardStyle: React.CSSProperties = isStandalone
    ? { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
    : { backgroundColor: 'var(--bg-elevated)', borderRadius: 24, padding: 40, width: 480, boxShadow: '0 20px 50px rgba(0,0,0,0.3)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', position: 'relative', maxHeight: '90vh', overflowY: 'auto' };

  return (
    <div
      style={containerStyle}
      onClick={e => { if (!isStandalone && e.target === e.currentTarget) onClose(); }}
    >
      {isStandalone && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 40, WebkitAppRegion: 'drag', zIndex: 10 } as any} />
      )}
      <div style={cardStyle}>
        {/* 可滚动内容区 */}
        <div style={isStandalone ? { flex: 1, overflowY: 'auto', padding: '40px 32px 24px', position: 'relative' } : {}}>
        {(!isStandalone || !isMac) && (
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: 20, right: 20, background: 'none', border: 'none',
              color: 'var(--text-muted)', cursor: 'pointer', padding: 8, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <X size={20} />
          </button>
        )}

        <header style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>微信公众号配置</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>管理用于发布文章的公众号账号</p>
        </header>

        {(editing || adding) ? (
          <AccountForm
            initial={editing || emptyAccount()}
            onFormChange={(form, valid) => { setPendingForm(form); setIsFormValid(valid); }}
          />
        ) : (
          <>
            {accounts.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                暂无配置的公众号账号
                <br />
                <span style={{ fontSize: 11 }}>点击下方按钮添加第一个账号</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {accounts.map((a, i) => (
                  <div
                    key={a.id}
                    style={{
                      padding: '12px 14px', borderRadius: 12,
                      border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-main)',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: 10,
                      background: 'var(--brand-gradient)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 14, fontWeight: 700, flexShrink: 0,
                    }}>
                      {a.name.charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
                        {i === 0 && (
                          <span style={{
                            fontSize: 9, color: 'var(--color-brand-indigo)',
                            border: '1px solid var(--color-brand-indigo)', borderRadius: 4, padding: '1px 4px', flexShrink: 0,
                          }}>
                            默认
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {a.appId.slice(0, 6)}••••• · {a.defaultTheme} · {a.defaultColor}
                        {a.author && ` · ${a.author}`}
                      </div>
                    </div>
                    <button
                      onClick={() => setEditing(a)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, display: 'flex', alignItems: 'center', borderRadius: 6 }}
                      title="编辑"
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(a.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff4757', padding: 6, display: 'flex', alignItems: 'center', borderRadius: 6 }}
                      title="删除"
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,71,87,0.08)')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setAdding(true)}
              style={{
                width: '100%', padding: '11px', borderRadius: 12,
                border: '1px dashed var(--border-subtle)', background: 'none',
                color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-brand-indigo)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
            >
              <Plus size={14} /> 添加公众号账号
            </button>

            {accounts.length > 0 && (
              <div style={{ marginTop: 16, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                第一个账号为默认发布账号 · 发布时可手动选择
                {saving && <span style={{ marginLeft: 8, color: 'var(--color-brand-indigo)' }}>保存中...</span>}
              </div>
            )}
          </>
        )}
        </div>{/* end scrollable */}

        {/* 固定底部（仅 standalone）*/}
        {isStandalone && (
          <div style={{
            padding: '16px 32px', borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-elevated)', display: 'flex', gap: 12,
          }}>
            {(editing || adding) ? (
              <>
                <button
                  onClick={() => { if (pendingForm && isFormValid) { handleSaveAccount(pendingForm); setPendingForm(null); } }}
                  disabled={!isFormValid}
                  style={{
                    flex: 1, padding: '12px', fontSize: 14, fontWeight: 600, borderRadius: 12,
                    border: 'none', backgroundColor: 'var(--color-brand-indigo)', color: 'white',
                    cursor: isFormValid ? 'pointer' : 'default', opacity: isFormValid ? 1 : 0.5,
                    boxShadow: isFormValid ? '0 4px 12px var(--brand-glow)' : 'none',
                  }}
                >
                  保存
                </button>
                <button
                  onClick={() => { setEditing(null); setAdding(false); setPendingForm(null); }}
                  style={{
                    padding: '12px 24px', fontSize: 14, fontWeight: 500, borderRadius: 12,
                    border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)',
                    color: 'var(--text-secondary)', cursor: 'pointer',
                  }}
                >
                  取消
                </button>
              </>
            ) : (
              <button
                onClick={() => window.close()}
                style={{
                  flex: 1, padding: '12px', fontSize: 14, fontWeight: 600, borderRadius: 12,
                  border: 'none', backgroundColor: 'var(--color-brand-indigo)', color: 'white',
                  cursor: 'pointer', boxShadow: '0 4px 12px var(--brand-glow)',
                }}
              >
                完成
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
