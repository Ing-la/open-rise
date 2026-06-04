'use client';

import { useState, useEffect, useCallback } from 'react';
import { createRole, updateRole, deleteRole, listRoles, listBrains } from '@/lib/api';
import { AVATARS, AvatarIcon } from './AvatarIcon';
import ConfirmDialog from './ConfirmDialog';

interface RoleLibraryProps {
  onBack: () => void;
}

export default function RoleLibrary({ onBack }: RoleLibraryProps) {
  const [roles, setRoles] = useState<any[]>([]);
  const [brains, setBrains] = useState<any[]>([]);
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [brainId, setBrainId] = useState('');
  const [soul, setSoul] = useState('');
  const [rule, setRule] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    Promise.all([listRoles(), listBrains()]).then(([r, b]) => {
      setRoles(r);
      setBrains(b);
    }).catch(() => {});
  }, []);

  const resetForm = useCallback(() => {
    setName('');
    setBrainId('');
    setSoul('');
    setRule('');
    setSelectedAvatar(null);
    setEditingId(null);
  }, []);

  const startCreate = useCallback(() => {
    resetForm();
    setView('form');
  }, [resetForm]);

  const startEdit = useCallback((role: any) => {
    setName(role.name);
    setBrainId(role.brainId);
    setSoul(role.soul ?? '');
    setRule(role.rule ?? '');
    setSelectedAvatar(role.avatar ?? null);
    setEditingId(role.id);
    setView('form');
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
      const data = await listRoles();
      setRoles(data);
      setView('list');
      resetForm();
    } catch (err) {
      console.error('Failed to save role:', err);
    } finally {
      setSaving(false);
    }
  }, [name, brainId, soul, rule, selectedAvatar, editingId, resetForm]);

  const handleDelete = useCallback(async (role: any) => {
    setDeleteTarget({ id: role.id, name: role.name });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteRole(deleteTarget.id);
      setRoles((prev) => prev.filter((x) => x.id !== deleteTarget.id));
    } catch (err) {
      console.error('Failed to delete role:', err);
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-10 pt-4 pb-2 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={view === 'form' ? () => { setView('list'); resetForm(); } : onBack}
            className="relative w-9 h-9 flex items-center justify-center cursor-pointer select-none shrink-0"
            type="button"
            aria-label="返回"
          >
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 36 36" preserveAspectRatio="none" fill="none" aria-hidden="true">
              <rect x="2" y="2" width="32" height="32" rx="8" stroke="#2C2C2C" strokeWidth="1.5" filter="url(#tremble)" />
            </svg>
            <svg viewBox="0 0 16 16" className="w-4 h-4 relative" fill="none" aria-hidden="true">
              <path d="M 10 3 L 5 8 L 10 13" stroke="#2C2C2C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" filter="url(#tremble)" />
            </svg>
          </button>
          <h1 className="font-hand text-2xl text-oxblood">人才库</h1>
        </div>
        {view === 'list' && (
          <button
            onClick={startCreate}
            className="relative px-5 py-2 font-hand text-sm cursor-pointer select-none"
            type="button"
          >
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 34" preserveAspectRatio="none" fill="none" aria-hidden="true">
              <rect x="1" y="1" width="98" height="32" rx="7" fill="#2C2C2C" />
              <rect x="1" y="1" width="98" height="32" rx="7" fill="none" stroke="#2C2C2C" strokeWidth="1.5" filter="url(#tremble)" />
            </svg>
            <span className="relative text-white">+ 新建人物</span>
          </button>
        )}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto thin-scroll px-10 pb-8">
        {view === 'list' ? (
          /* ════════════════════════════════
             List View
             ════════════════════════════════ */
          roles.length === 0 ? (
            <div className="flex flex-col items-center justify-center pt-24 gap-3">
              <p className="font-hand text-lg text-oxblood/40">还没有人物</p>
              <button
                onClick={startCreate}
                className="relative px-5 py-2 font-hand text-sm cursor-pointer select-none"
                type="button"
              >
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 34" preserveAspectRatio="none" fill="none" aria-hidden="true">
                  <rect x="1" y="1" width="98" height="32" rx="7" stroke="#2C2C2C" strokeWidth="1.5" filter="url(#tremble)" />
                </svg>
                <span className="relative text-oxblood">创建第一个人物</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {roles.map((role) => {
                const avatar = AVATARS.find((a) => a.id === role.avatar);
                const brain = brains.find((b) => b.id === role.brainId);
                return (
                  <div key={role.id} className="relative p-5" style={{ minHeight: '100px' }}>
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 400 120" preserveAspectRatio="none" fill="none" aria-hidden="true">
                      <rect x="2" y="2" width="396" height="116" rx="10" fill="none" stroke="#2C2C2C" strokeWidth="1" filter="url(#tremble)" opacity="0.4" />
                    </svg>
                    <div className="relative h-full flex items-center gap-4">
                      {role.avatar && <AvatarIcon id={role.avatar} size={44} />}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-hand text-lg text-oxblood truncate">{role.name}</h3>
                        <p className="font-mono text-xs text-oxblood/50 mt-0.5 truncate">
                          {brain ? brain.name : <span className="text-red-400/60">大脑已删除</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => startEdit(role)} className="w-6 h-6 flex items-center justify-center cursor-pointer opacity-40 hover:opacity-100 transition-opacity" aria-label="编辑" type="button">
                          <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" aria-hidden="true">
                            <path d="M 2 12 L 2 15 L 5 15 L 15 5 L 12 2 Z" stroke="#2C2C2C" strokeWidth="1.5" strokeLinejoin="round" />
                            <line x1="12" y1="2" x2="15" y2="5" stroke="#2C2C2C" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </button>
                        <button onClick={() => handleDelete(role)} className="w-6 h-6 flex items-center justify-center cursor-pointer opacity-40 hover:opacity-100 transition-opacity" aria-label="删除" type="button">
                          <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" aria-hidden="true">
                            <path d="M 3 3 L 13 13 M 13 3 L 3 13" stroke="#2C2C2C" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* ════════════════════════════════
             Form View
             ════════════════════════════════ */
          <div className="max-w-2xl mx-auto pt-4 space-y-5">
            {/* Avatar */}
            <div className="flex justify-center mb-2">
              <button onClick={() => setShowPicker(true)} className="group w-16 h-16 flex items-center justify-center cursor-pointer" aria-label="选择头像" type="button">
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

            {/* Avatar picker */}
            {showPicker && (
              <div className="bg-white rounded-xl border border-oxblood/20 p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-hand text-lg text-oxblood">选择头像</span>
                  <button onClick={() => setShowPicker(false)} className="w-6 h-6 flex items-center justify-center cursor-pointer" aria-label="关闭" type="button">
                    <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" aria-hidden="true">
                      <path d="M 3 3 L 13 13 M 13 3 L 3 13" stroke="#2C2C2C" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-5 justify-items-center">
                  {AVATARS.map((a) => (
                    <button key={a.id} onClick={() => { setSelectedAvatar(a.id); setShowPicker(false); }} className={`p-1.5 rounded-full transition-all cursor-pointer ${selectedAvatar === a.id ? 'bg-oxblood/10' : 'hover:bg-oxblood/5'}`} type="button">
                      <AvatarIcon id={a.id} size={48} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Name */}
            <div className="group">
              <label className="block font-hand text-base text-oxblood mb-1">名字 <span className="text-oxblood/50">*</span></label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-base text-oxblood placeholder-oxblood/30 caret-oxblood" placeholder="给人物起个名字" autoComplete="off" />
              <div className="shaky-line w-full mt-1" />
            </div>

            {/* Brain select */}
            <div className="group">
              <label className="block font-hand text-base text-oxblood mb-1">选择大脑 <span className="text-oxblood/50">*</span></label>
              <div className="relative">
                <select value={brainId} onChange={(e) => setBrainId(e.target.value)} className="w-full bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-base text-oxblood appearance-none cursor-pointer">
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

            {/* Soul */}
            <div className="group">
              <label className="block font-hand text-base text-oxblood mb-1">Soul <span className="text-oxblood/40">(可选)</span></label>
              <textarea value={soul} onChange={(e) => setSoul(e.target.value)} rows={3} className="w-full bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-sm text-oxblood placeholder-oxblood/30 caret-oxblood resize-none" placeholder="人物的灵魂描述..." autoComplete="off" />
              <div className="shaky-line w-full mt-1" />
            </div>

            {/* Rule */}
            <div className="group">
              <label className="block font-hand text-base text-oxblood mb-1">Rule <span className="text-oxblood/40">(可选)</span></label>
              <textarea value={rule} onChange={(e) => setRule(e.target.value)} rows={3} className="w-full bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-sm text-oxblood placeholder-oxblood/30 caret-oxblood resize-none" placeholder="人物的行为准则..." autoComplete="off" />
              <div className="shaky-line w-full mt-1" />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-4 pt-4">
              <button onClick={() => { setView('list'); resetForm(); }} className="relative px-6 py-2 font-hand text-base cursor-pointer select-none" style={{ minWidth: '88px' }} type="button">
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 42" preserveAspectRatio="none" fill="none" aria-hidden="true">
                  <rect x="2" y="2" width="96" height="38" rx="8" stroke="#2C2C2C" strokeWidth="1.5" filter="url(#tremble)" />
                </svg>
                <span className="relative text-oxblood">取消</span>
              </button>
              <button onClick={handleSave} disabled={saving || !name.trim() || !brainId || !selectedAvatar} className="relative px-6 py-2 font-hand text-base cursor-pointer select-none disabled:opacity-40" style={{ minWidth: '88px' }} type="button">
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 42" preserveAspectRatio="none" fill="none" aria-hidden="true">
                  <rect x="2" y="2" width="96" height="38" rx="8" fill="#2C2C2C" />
                  <rect x="2" y="2" width="96" height="38" rx="8" fill="none" stroke="#2C2C2C" strokeWidth="1.5" filter="url(#tremble)" />
                </svg>
                <span className="relative text-white">{saving ? '保存中...' : '保存'}</span>
              </button>
            </div>
          </div>
        )}

        <ConfirmDialog
          open={!!deleteTarget}
          title="删除人物"
          message={`确认删除「${deleteTarget?.name || ''}」？\n该人物的聊天记录和 Agent 会话将被一并清除。`}
          confirmText="删除"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      </div>
    </div>
  );
}
