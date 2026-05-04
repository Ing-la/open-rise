'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createRole, updateRole, deleteRole, listRoles, listBrains } from '@/lib/api';
import { AVATARS, AvatarIcon } from './AvatarIcon';

interface RoleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RoleModal({ isOpen, onClose }: RoleModalProps) {
  const [mode, setMode] = useState<'empty' | 'form'>('empty');
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // ── Animation lifecycle ──
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // ── State declarations (before useEffects that reference them) ──
  const [name, setName] = useState('');
  const [brainId, setBrainId] = useState('');
  const [soul, setSoul] = useState('');
  const [rule, setRule] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [brains, setBrains] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [showList, setShowList] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setEditingId(null);
    setLoading(true);
    try {
      const [roleData, brainData] = await Promise.all([
        listRoles(),
        listBrains(),
      ]);
      setRoles(roleData);
      setBrains(brainData);
      setShowList(roleData.length > 0);
      if (roleData.length === 0) setMode('empty');
      else setMode('form');
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load data each time modal opens ──
  useEffect(() => {
    if (isOpen) {
      setSelectedAvatar(null);
      loadData();
    }
  }, [isOpen, loadData]);

  // ── Escape key ──
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // ── Focus first input when form mode activates ──
  const firstInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (mode === 'form') {
      setTimeout(() => firstInputRef.current?.focus(), 50);
    }
  }, [mode]);

  // ── Overlay click ──
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  const handleEdit = useCallback((role: any) => {
    setName(role.name);
    setBrainId(role.brainId);
    setSoul(role.soul ?? '');
    setRule(role.rule ?? '');
    setSelectedAvatar(role.avatar ?? null);
    setEditingId(role.id);
    setMode('form');
    setShowList(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!name.trim() || !brainId) return;
    setSaving(true);
    const payload = { name: name.trim(), brainId, soul, rule, avatar: selectedAvatar };
    try {
      if (editingId) {
        await updateRole(editingId, payload);
      } else {
        await createRole(payload);
      }
      onClose();
    } catch (err) {
      console.error('Failed to save role:', err);
    } finally {
      setSaving(false);
    }
  }, [name, brainId, soul, rule, selectedAvatar, editingId, onClose]);

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="人物配置"
    >
      <div
        ref={dialogRef}
        className={`relative transition-all duration-200 ${
          visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
        style={{
          width: '480px',
          maxWidth: 'calc(100vw - 48px)',
          minHeight: '300px',
        }}
      >
        {/* ── Hand-drawn border SVG ── */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 500 500"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden="true"
          style={{ zIndex: 0 }}
        >
          <rect x="6" y="6" width="488" height="488" rx="20" fill="#FFFFFF" />
          <rect x="6" y="6" width="488" height="488" rx="20" fill="none" stroke="#2C2C2C" strokeWidth="2.5" filter="url(#tremble)" />
        </svg>

        {/* ── Content wrapper ── */}
        <div className="relative p-8 z-10">
          {/* ── Title row ── */}
          <div className="flex items-center justify-between mb-8">
            <h2 className="font-hand text-2xl text-oxblood">
              {mode === 'empty' ? '人物配置' : showList ? '人物列表' : (editingId ? '编辑人物' : '新人物')}
            </h2>
            {(mode === 'empty' || showList) && (
              <button
                onClick={() => { setMode('form'); setShowList(false); setEditingId(null); setName(''); setBrainId(''); setSoul(''); setRule(''); setSelectedAvatar(null); }}
                className="group w-8 h-8 flex items-center justify-center cursor-pointer"
                aria-label="新人物"
              >
                <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="#2C2C2C" strokeWidth="1.5" filter="url(#tremble)" />
                  <path d="M 12 7 L 12 17 M 7 12 L 17 12" stroke="#2C2C2C" strokeWidth="1.5" strokeLinecap="round" filter="url(#tremble)" />
                </svg>
              </button>
            )}
          </div>

          {mode === 'empty' ? (
            /* ════════════════════════════════════════
               State A — Empty
               ════════════════════════════════════════ */
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <p className="font-hand text-lg text-oxblood/60">尚未配置人物</p>
              {loading && <p className="font-mono text-sm text-oxblood/30">加载中...</p>}
            </div>
          ) : showList ? (
            /* ════════════════════════════════════════
               State B — Role list
               ════════════════════════════════════════ */
            <div className="space-y-3">
              {loading ? (
                <p className="font-mono text-sm text-oxblood/30 text-center py-8">加载中...</p>
              ) : roles.length === 0 ? (
                <p className="font-hand text-lg text-oxblood/60 text-center py-8">尚未配置人物</p>
              ) : (
                roles.map((role) => {
                  const avatar = AVATARS.find((a) => a.id === role.avatar);
                  return (
                    <div key={role.id} className="relative p-4">
                      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 400 80" preserveAspectRatio="none" fill="none" aria-hidden="true">
                        <rect x="2" y="2" width="396" height="76" rx="8" fill="none" stroke="#2C2C2C" strokeWidth="1" filter="url(#tremble)" opacity="0.4" />
                      </svg>
                      <div className="relative flex items-center gap-3">
                        {role.avatar && <AvatarIcon id={role.avatar} size={36} />}
                        <div className="flex-1">
                          <p className="font-hand text-base text-oxblood">{role.name}</p>
                          <p className="font-mono text-xs text-oxblood/40 mt-0.5">{role.brainName}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {/* Edit button */}
                          <button
                            onClick={() => handleEdit(role)}
                            className="w-6 h-6 flex items-center justify-center cursor-pointer opacity-40 hover:opacity-100 transition-opacity"
                            aria-label="编辑"
                          >
                            <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" aria-hidden="true">
                              <path d="M 2 12 L 2 15 L 5 15 L 15 5 L 12 2 Z" stroke="#2C2C2C" strokeWidth="1.5" strokeLinejoin="round" filter="url(#tremble)" />
                              <line x1="12" y1="2" x2="15" y2="5" stroke="#2C2C2C" strokeWidth="1.5" strokeLinecap="round" filter="url(#tremble)" />
                            </svg>
                          </button>
                          <button
                            onClick={() => deleteRole(role.id).then(() => {
                              setRoles((prev) => prev.filter((x) => x.id !== role.id));
                              if (roles.length <= 1) { setMode('empty'); setShowList(false); }
                            })}
                            className="w-6 h-6 flex items-center justify-center cursor-pointer opacity-40 hover:opacity-100 transition-opacity"
                            aria-label="删除"
                          >
                            <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" aria-hidden="true">
                              <path d="M 3 3 L 13 13 M 13 3 L 3 13" stroke="#2C2C2C" strokeWidth="1.5" strokeLinecap="round" filter="url(#tremble)" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* ════════════════════════════════════════
               State C — Configuration form
               ════════════════════════════════════════ */
            <div className="relative space-y-5">
              {/* ── Avatar selector ── */}
              <div className="flex justify-center mb-2">
                <button
                  onClick={() => setShowPicker(true)}
                  className="group w-16 h-16 flex items-center justify-center cursor-pointer"
                  aria-label="选择头像"
                  type="button"
                >
                  {selectedAvatar ? (
                    <AvatarIcon id={selectedAvatar} size={60} />
                  ) : (
                    <svg viewBox="0 0 60 60" className="w-full h-full" fill="none" aria-hidden="true">
                      <circle cx="30" cy="30" r="27" stroke="#2C2C2C" strokeWidth="1.5" strokeDasharray="4 3" filter="url(#tremble)" />
                      <path d="M 22 22 A 8 8 0 1 1 38 22" stroke="#2C2C2C" strokeWidth="1.5" fill="none" filter="url(#tremble)" />
                      <path d="M 12 46 C 12 36, 48 36, 48 46" stroke="#2C2C2C" strokeWidth="1.5" fill="none" filter="url(#tremble)" />
                      <path d="M 28 30 L 32 30 M 30 28 L 30 32" stroke="#2C2C2C" strokeWidth="1.5" strokeLinecap="round" filter="url(#tremble)" />
                    </svg>
                  )}
                </button>
              </div>

              {/* ── Avatar picker overlay ── */}
              {showPicker && (
                <div className="absolute inset-0 z-20 bg-white rounded-xl">
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 400 500" preserveAspectRatio="none" fill="none" aria-hidden="true">
                    <rect x="2" y="2" width="396" height="496" rx="12" stroke="#2C2C2C" strokeWidth="1.5" filter="url(#tremble)" opacity="0.3" />
                  </svg>
                  <div className="relative p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-hand text-lg text-oxblood">选择头像</span>
                      <button onClick={() => setShowPicker(false)} className="w-6 h-6 flex items-center justify-center cursor-pointer" aria-label="关闭" type="button">
                        <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" aria-hidden="true">
                          <path d="M 3 3 L 13 13 M 13 3 L 3 13" stroke="#2C2C2C" strokeWidth="1.5" strokeLinecap="round" filter="url(#tremble)" />
                        </svg>
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-5 justify-items-center">
                      {AVATARS.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => { setSelectedAvatar(a.id); setShowPicker(false); }}
                          className={`p-1.5 rounded-full transition-all cursor-pointer ${selectedAvatar === a.id ? 'bg-oxblood/10' : 'hover:bg-oxblood/5'}`}
                          type="button"
                        >
                          <AvatarIcon id={a.id} size={48} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 1. 名字 (required) */}
              <div className="group">
                <label className="block font-hand text-base text-oxblood mb-1">
                  名字 <span className="text-oxblood/50">*</span>
                </label>
                <input
                  ref={firstInputRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-base text-oxblood placeholder-oxblood/30 caret-oxblood"
                  placeholder="给人物起个名字"
                  autoComplete="off"
                />
                <div className="shaky-line w-full mt-1" />
              </div>

              {/* 2. 选择大脑 */}
              <div className="group">
                <label className="block font-hand text-base text-oxblood mb-1">选择大脑</label>
                <div className="relative">
                  <select
                    value={brainId}
                    onChange={(e) => setBrainId(e.target.value)}
                    className="w-full bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-base text-oxblood appearance-none cursor-pointer"
                  >
                    {brains.length === 0 ? (
                      <option value="" disabled>当前没有大脑，请先配置</option>
                    ) : (
                      <>
                        <option value="" disabled>选择大脑...</option>
                        {brains.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </>
                    )}
                  </select>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true">
                      <path d="M 1 1 L 6 7 L 11 1" stroke="#2C2C2C" strokeWidth="1.5" strokeLinecap="round" filter="url(#tremble)" />
                    </svg>
                  </div>
                </div>
                <div className="shaky-line w-full mt-1" />
              </div>

              {/* 3. Soul (optional) */}
              <div className="group">
                <label className="block font-hand text-base text-oxblood mb-1">
                  Soul <span className="text-oxblood/40">(可选)</span>
                </label>
                <textarea
                  value={soul}
                  onChange={(e) => setSoul(e.target.value)}
                  rows={3}
                  className="w-full bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-sm text-oxblood placeholder-oxblood/30 caret-oxblood resize-none"
                  placeholder="人物的灵魂描述..."
                  autoComplete="off"
                />
                <div className="shaky-line w-full mt-1" />
              </div>

              {/* 4. Rule (optional) */}
              <div className="group">
                <label className="block font-hand text-base text-oxblood mb-1">
                  Rule <span className="text-oxblood/40">(可选)</span>
                </label>
                <textarea
                  value={rule}
                  onChange={(e) => setRule(e.target.value)}
                  rows={3}
                  className="w-full bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-sm text-oxblood placeholder-oxblood/30 caret-oxblood resize-none"
                  placeholder="人物的行为准则..."
                  autoComplete="off"
                />
                <div className="shaky-line w-full mt-1" />
              </div>

              {/* ── Action buttons ── */}
              <div className="flex items-center justify-end gap-4 pt-4">
                <button
                  onClick={() => { setShowList(true); setEditingId(null); }}
                  className="relative px-6 py-2 font-hand text-base cursor-pointer select-none"
                  style={{ minWidth: '88px' }}
                  type="button"
                >
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 42" preserveAspectRatio="none" fill="none" aria-hidden="true">
                    <rect x="2" y="2" width="96" height="38" rx="8" stroke="#2C2C2C" strokeWidth="1.5" filter="url(#tremble)" />
                  </svg>
                  <span className="relative text-oxblood">取消</span>
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !name.trim() || !brainId || !selectedAvatar}
                  className="relative px-6 py-2 font-hand text-base cursor-pointer select-none disabled:opacity-40"
                  style={{ minWidth: '88px' }}
                  type="button"
                >
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 42" preserveAspectRatio="none" fill="none" aria-hidden="true">
                    <rect x="2" y="2" width="96" height="38" rx="8" fill="#2C2C2C" />
                    <rect x="2" y="2" width="96" height="38" rx="8" fill="none" stroke="#2C2C2C" strokeWidth="1.5" filter="url(#tremble)" />
                  </svg>
                  <span className="relative text-white">{saving ? '保存中...' : '保存'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
