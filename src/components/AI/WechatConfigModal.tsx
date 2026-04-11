import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, ChevronDown } from 'lucide-react';
import type { WechatAccount } from '../../types/window';

// 复用 ModelConfigModal 的蒙层/弹窗样式
const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 2000,
  backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const CARD: React.CSSProperties = {
  width: 520, maxHeight: '85vh',
  backgroundColor: 'var(--bg-elevated)', borderRadius: 18,
  border: '1px solid var(--border-subtle)',
  boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
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
  onSave: (a: WechatAccount) => void;
  onCancel: () => void;
}

const AccountForm: React.FC<FormProps> = ({ initial, onSave, onCancel }) => {
  const [form, setForm] = useState<WechatAccount>({ ...initial });
  const [showSecret, setShowSecret] = useState(false);

  const field = (key: keyof WechatAccount, label: string, type = 'text', placeholder = '') => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={key === 'appSecret' && !showSecret ? 'password' : type}
          value={(form[key] as string) || ''}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          placeholder={placeholder}
          style={{
            width: '100%', padding: '8px 10px', borderRadius: 8,
            border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-main)',
            color: 'var(--text-primary)', fontSize: 13, outline: 'none',
          }}
        />
        {key === 'appSecret' && (
          <button
            type="button"
            onClick={() => setShowSecret(!showSecret)}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11 }}
          >
            {showSecret ? '隐藏' : '显示'}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ padding: '16px 20px' }}>
      {field('name', '账号名称 *', 'text', '例：AI 开发者周刊')}
      {field('appId', 'AppID *', 'text', 'wx...')}
      {field('appSecret', 'AppSecret *', 'text', '在公众号后台"开发→基本配置"获取')}
      {field('author', '默认作者', 'text', '可留空')}

      {/* 主题 & 颜色 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>默认主题</label>
          <select
            value={form.defaultTheme || 'default'}
            onChange={(e) => setForm({ ...form, defaultTheme: e.target.value })}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
          >
            {THEME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>默认颜色</label>
          <select
            value={form.defaultColor || 'blue'}
            onChange={(e) => setForm({ ...form, defaultColor: e.target.value })}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
          >
            {COLOR_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
        AppID 和 AppSecret 在微信公众号后台 →&nbsp;
        <span style={{ color: 'var(--color-brand-indigo)', cursor: 'pointer' }}
          onClick={() => window.api.shell.openExternal('https://mp.weixin.qq.com')}>
          mp.weixin.qq.com
        </span>
        &nbsp;→ 开发 → 基本配置 中获取。
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>取消</button>
        <button
          onClick={() => { if (form.name && form.appId && form.appSecret) onSave(form); }}
          disabled={!form.name || !form.appId || !form.appSecret}
          style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--brand-gradient)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (!form.name || !form.appId || !form.appSecret) ? 0.5 : 1 }}
        >
          保存
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

export const WechatConfigModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [accounts, setAccounts] = useState<WechatAccount[]>([]);
  const [editing, setEditing] = useState<WechatAccount | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.api.wechat.getConfig().then((cfg) => setAccounts(cfg.accounts || []));
  }, []);

  const persist = async (list: WechatAccount[]) => {
    setSaving(true);
    await window.api.wechat.saveConfig({ accounts: list });
    setSaving(false);
    setAccounts(list);
  };

  const handleSaveAccount = (a: WechatAccount) => {
    const next = editing
      ? accounts.map((x) => (x.id === a.id ? a : x))
      : [...accounts, a];
    persist(next);
    setEditing(null);
    setAdding(false);
  };

  const handleDelete = (id: string) => {
    persist(accounts.filter((a) => a.id !== id));
  };

  return (
    <div style={OVERLAY} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={CARD}>
        {/* 标题栏 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>微信公众号账号配置</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>管理用于发布文章的公众号账号</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
            <X size={16} />
          </button>
        </div>

        {/* 账号列表 / 编辑表单 */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {(editing || adding) ? (
            <AccountForm
              initial={editing || emptyAccount()}
              onSave={handleSaveAccount}
              onCancel={() => { setEditing(null); setAdding(false); }}
            />
          ) : (
            <div style={{ padding: '12px 20px' }}>
              {accounts.length === 0 ? (
                <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  暂无配置的公众号账号<br />
                  <span style={{ fontSize: 11 }}>点击下方按钮添加第一个账号</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {accounts.map((a, i) => (
                    <div key={a.id} style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: 'var(--brand-gradient)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0,
                      }}>
                        {a.name.charAt(0)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {a.name}
                          {i === 0 && <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--color-brand-indigo)', border: '1px solid var(--color-brand-indigo)', borderRadius: 4, padding: '1px 4px' }}>默认</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                          {a.appId.slice(0, 6)}••••• · 主题: {a.defaultTheme} · 颜色: {a.defaultColor}
                          {a.author && ` · 作者: ${a.author}`}
                        </div>
                      </div>
                      <button onClick={() => setEditing(a)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', alignItems: 'center' }} title="编辑">
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => handleDelete(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff4757', padding: 4, display: 'flex', alignItems: 'center' }} title="删除">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => setAdding(true)}
                style={{ width: '100%', padding: '10px', borderRadius: 10, border: '1px dashed var(--border-subtle)', background: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Plus size={14} /> 添加公众号账号
              </button>
            </div>
          )}
        </div>

        {/* 底部提示 */}
        {!editing && !adding && (
          <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-muted)' }}>
            第一个账号为默认发布账号 · 发布时可手动选择账号
            {saving && <span style={{ marginLeft: 8, color: 'var(--color-brand-indigo)' }}>保存中...</span>}
          </div>
        )}
      </div>
    </div>
  );
};
