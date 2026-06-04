'use client';

import { useState, useEffect, useCallback } from 'react';
import { listBrains, createBrain, updateBrain, deleteBrain, testBrainConnection, listRoles } from '@/lib/api';
import ConfirmDialog from './ConfirmDialog';

interface BrainLibraryProps {
  onBack: () => void;
}

const PRESETS = [
  { label: 'DeepSeek',  vendor: 'DeepSeek',    endpoint: 'https://api.deepseek.com/v1',                                website: 'https://platform.deepseek.com' },
  { label: '智谱GLM',   vendor: '智谱GLM',     endpoint: 'https://open.bigmodel.cn/api/paas/v4',                       website: 'https://open.bigmodel.cn' },
  { label: '百炼',      vendor: '百炼',         endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',           website: 'https://bailian.console.aliyun.com' },
  { label: 'Kimi',      vendor: 'Kimi',         endpoint: 'https://api.moonshot.cn/v1',                                 website: 'https://platform.moonshot.cn' },
  { label: '硅基流动',  vendor: '硅基流动',     endpoint: 'https://api.siliconflow.cn/v1',                              website: 'https://cloud.siliconflow.cn' },
] as const;

export default function BrainLibrary({ onBack }: BrainLibraryProps) {
  const [brains, setBrains] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, 'idle' | 'testing' | 'success' | 'fail'>>({});
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Form fields
  const [brainName, setBrainName] = useState('');
  const [vendor, setVendor] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [website, setWebsite] = useState('');
  const [model, setModel] = useState('');
  const [brainTypes, setBrainTypes] = useState<string[]>(['chat']);

  useEffect(() => {
    Promise.all([listBrains(), listRoles()]).then(([b, r]) => {
      setBrains(b);
      setRoles(r);
    }).catch(() => {});
  }, []);

  const resetForm = useCallback(() => {
    setBrainName('');
    setVendor('');
    setEndpoint('');
    setApiKey('');
    setWebsite('');
    setModel('');
    setBrainTypes(['chat']);
    setEditingId(null);
  }, []);

  const startCreate = useCallback(() => {
    resetForm();
    setView('form');
  }, [resetForm]);

  const startEdit = useCallback((brain: any) => {
    setBrainName(brain.name);
    setVendor(brain.provider);
    setEndpoint(brain.baseUrl);
    setApiKey(brain.apiKey);
    setWebsite(brain.website ?? '');
    setModel(brain.modelName);
    setBrainTypes((brain.type || 'chat').split(',').filter(Boolean));
    setEditingId(brain.id);
    setView('form');
  }, []);

  const isValid = useCallback(() => {
    return brainName.trim() && vendor.trim() && endpoint.trim() && apiKey.trim() && model.trim() && brainTypes.length > 0;
  }, [brainName, vendor, endpoint, apiKey, model, brainTypes]);

  const handleSave = useCallback(async () => {
    if (!isValid()) return;
    setSaving(true);
    const payload = { name: brainName.trim(), vendor, endpoint, apiKey, website, model, type: brainTypes.join(',') };
    try {
      if (editingId) {
        await updateBrain(editingId, payload);
      } else {
        await createBrain(payload);
      }
      const data = await listBrains();
      setBrains(data);
      setView('list');
      resetForm();
    } catch (err) {
      console.error('Failed to save brain:', err);
    } finally {
      setSaving(false);
    }
  }, [brainName, vendor, endpoint, apiKey, website, model, brainTypes, editingId, resetForm, isValid]);

  const handleDelete = useCallback(async (id: string, name: string) => {
    setDeleteTarget({ id, name });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteBrain(deleteTarget.id);
      setBrains((prev) => prev.filter((b) => b.id !== deleteTarget.id));
    } catch (err) {
      console.error('Failed to delete brain:', err);
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget]);

  const handleTest = useCallback(async (id: string) => {
    setTestResults((prev) => ({ ...prev, [id]: 'testing' }));
    try {
      const res = await testBrainConnection(id);
      setTestResults((prev) => ({ ...prev, [id]: res.success ? 'success' : 'fail' }));
    } catch {
      setTestResults((prev) => ({ ...prev, [id]: 'fail' }));
    }
  }, []);

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
          <h1 className="font-hand text-2xl text-oxblood">大脑库</h1>
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
            <span className="relative text-white">+ 新建大脑</span>
          </button>
        )}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto thin-scroll px-10 pb-8">
        {view === 'list' ? (
          /* ════════════════════════════════
             List View
             ════════════════════════════════ */
          brains.length === 0 ? (
            <div className="flex flex-col items-center justify-center pt-24 gap-3">
              <p className="font-hand text-lg text-oxblood/40">还没有大脑</p>
              <button
                onClick={startCreate}
                className="relative px-5 py-2 font-hand text-sm cursor-pointer select-none"
                type="button"
              >
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 34" preserveAspectRatio="none" fill="none" aria-hidden="true">
                  <rect x="1" y="1" width="98" height="32" rx="7" stroke="#2C2C2C" strokeWidth="1.5" filter="url(#tremble)" />
                </svg>
                <span className="relative text-oxblood">创建第一个大脑</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {brains.map((b) => {
                const testState = testResults[b.id];
                return (
                  <div key={b.id} className="relative p-5" style={{ minHeight: '110px' }}>
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 400 130" preserveAspectRatio="none" fill="none" aria-hidden="true">
                      <rect x="2" y="2" width="396" height="126" rx="10" fill="none" stroke="#2C2C2C" strokeWidth="1" filter="url(#tremble)" opacity="0.4" />
                    </svg>
                    <div className="relative h-full flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-hand text-lg text-oxblood">{b.name}</h3>
                          <span className="font-mono text-[10px] text-oxblood/30 px-1.5 py-0.5 border border-oxblood/20 rounded">{b.type || 'chat'}</span>
                        </div>
                        <p className="font-mono text-xs text-oxblood/50">{b.provider} · {b.modelName}</p>
                      </div>
                      <div className="flex items-center gap-1.5 mt-3">
                        {testState === 'success' && <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />}
                        {testState === 'fail' && <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />}
                        <button onClick={() => handleTest(b.id)} disabled={testState === 'testing'} className="w-6 h-6 flex items-center justify-center cursor-pointer opacity-40 hover:opacity-100 transition-opacity disabled:opacity-20" aria-label="测试连接" type="button">
                          {testState === 'testing' ? (
                            <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" aria-hidden="true">
                              <circle cx="8" cy="8" r="6" stroke="#2C2C2C" strokeWidth="1.5" strokeDasharray="2 3" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" aria-hidden="true">
                              <polygon points="4,2 4,14 14,8" stroke="#2C2C2C" strokeWidth="1.5" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                        <button onClick={() => startEdit(b)} className="w-6 h-6 flex items-center justify-center cursor-pointer opacity-40 hover:opacity-100 transition-opacity" aria-label="编辑" type="button">
                          <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" aria-hidden="true">
                            <path d="M 2 12 L 2 15 L 5 15 L 15 5 L 12 2 Z" stroke="#2C2C2C" strokeWidth="1.5" strokeLinejoin="round" />
                            <line x1="12" y1="2" x2="15" y2="5" stroke="#2C2C2C" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </button>
                        <button onClick={() => handleDelete(b.id, b.name)} className="w-6 h-6 flex items-center justify-center cursor-pointer opacity-40 hover:opacity-100 transition-opacity" aria-label="删除" type="button">
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
          <div className="max-w-2xl mx-auto pt-4">
            {/* Presets */}
            <div className="flex items-center gap-3 pb-4">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => { setVendor(p.vendor); setEndpoint(p.endpoint); setWebsite(p.website); setBrainName(''); setApiKey(''); setModel(''); setBrainTypes(['chat']); }}
                  className="relative px-4 py-2 font-hand text-sm cursor-pointer select-none"
                  type="button"
                >
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 120 36" preserveAspectRatio="none" fill="none" aria-hidden="true">
                    <rect x="1" y="1" width="118" height="34" rx="7" stroke="#2C2C2C" strokeWidth="1.5" filter="url(#tremble)" />
                  </svg>
                  <span className="relative text-oxblood">{p.label}</span>
                </button>
              ))}
            </div>
            <div className="w-full h-px bg-oxblood/20 mb-6" />

            <div className="space-y-5">
              {/* Name */}
              <div className="group">
                <label className="block font-hand text-base text-oxblood mb-1">大脑名称 <span className="text-oxblood/50">*</span></label>
                <input type="text" value={brainName} onChange={(e) => setBrainName(e.target.value)} className="w-full bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-base text-oxblood placeholder-oxblood/30 caret-oxblood" placeholder="例如: My Brain" autoComplete="off" />
                <div className="shaky-line w-full mt-1" />
              </div>
              {/* Vendor */}
              <div className="group">
                <label className="block font-hand text-base text-oxblood mb-1">供应商名称 <span className="text-oxblood/50">*</span></label>
                <input type="text" value={vendor} onChange={(e) => setVendor(e.target.value)} className="w-full bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-base text-oxblood placeholder-oxblood/30 caret-oxblood" placeholder="例如: DeepSeek" autoComplete="off" />
                <div className="shaky-line w-full mt-1" />
              </div>
              {/* Endpoint */}
              <div className="group">
                <label className="block font-hand text-base text-oxblood mb-1">请求地址 <span className="text-oxblood/50">*</span></label>
                <input type="url" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className="w-full bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-base text-oxblood placeholder-oxblood/30 caret-oxblood" placeholder="https://api.example.com/v1" autoComplete="off" />
                <div className="shaky-line w-full mt-1" />
              </div>
              {/* API Key */}
              <div className="group">
                <label className="block font-hand text-base text-oxblood mb-1">API Key <span className="text-oxblood/50">*</span></label>
                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-base text-oxblood placeholder-oxblood/30 caret-oxblood" placeholder="sk-xxxxxxxxxxxxxxxx" autoComplete="new-password" />
                <div className="shaky-line w-full mt-1" />
              </div>
              {/* Website */}
              <div className="group">
                <label className="block font-hand text-base text-oxblood mb-1">官网链接</label>
                <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} className="w-full bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-base text-oxblood placeholder-oxblood/30 caret-oxblood" placeholder="https://example.com" autoComplete="off" />
                <div className="shaky-line w-full mt-1" />
              </div>
              {/* Model + Type */}
              <div className="group">
                <label className="block font-hand text-base text-oxblood mb-1">模型 <span className="text-oxblood/50">*</span> <span className="text-oxblood/40 text-sm">(手动输入)</span></label>
                <div className="flex items-center gap-2">
                  <input type="text" value={model} onChange={(e) => setModel(e.target.value)} className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-base text-oxblood placeholder-oxblood/30 caret-oxblood min-w-0" placeholder="例如: deepseek-chat" autoComplete="off" />
                  {['chat', 'image', 'vision'].map((t) => {
                    const active = brainTypes.includes(t);
                    return (
                      <button key={t} onClick={() => setBrainTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])} className="relative px-3 py-1 font-hand text-sm cursor-pointer select-none shrink-0" type="button">
                        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 60 28" preserveAspectRatio="none" fill="none" aria-hidden="true">
                          {active ? (
                            <>
                              <rect x="1" y="1" width="58" height="26" rx="6" fill="#2C2C2C" />
                              <rect x="1" y="1" width="58" height="26" rx="6" fill="none" stroke="#2C2C2C" strokeWidth="1.5" filter="url(#tremble)" />
                            </>
                          ) : (
                            <rect x="1" y="1" width="58" height="26" rx="6" fill="none" stroke="#2C2C2C" strokeWidth="1.5" filter="url(#tremble)" opacity="0.5" />
                          )}
                        </svg>
                        <span className={`relative ${active ? 'text-white' : 'text-oxblood/60'}`}>{t}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="shaky-line w-full mt-1" />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-4 pt-6">
                <button onClick={() => { setView('list'); resetForm(); }} className="relative px-6 py-2 font-hand text-base cursor-pointer select-none" style={{ minWidth: '88px' }} type="button">
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 42" preserveAspectRatio="none" fill="none" aria-hidden="true">
                    <rect x="2" y="2" width="96" height="38" rx="8" stroke="#2C2C2C" strokeWidth="1.5" filter="url(#tremble)" />
                  </svg>
                  <span className="relative text-oxblood">取消</span>
                </button>
                <button onClick={handleSave} disabled={saving || !isValid()} className="relative px-6 py-2 font-hand text-base cursor-pointer select-none disabled:opacity-40" style={{ minWidth: '88px' }} type="button">
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 42" preserveAspectRatio="none" fill="none" aria-hidden="true">
                    <rect x="2" y="2" width="96" height="38" rx="8" fill="#2C2C2C" />
                    <rect x="2" y="2" width="96" height="38" rx="8" fill="none" stroke="#2C2C2C" strokeWidth="1.5" filter="url(#tremble)" />
                  </svg>
                  <span className="relative text-white">{saving ? '保存中...' : '保存'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="删除大脑"
        message={`确认删除大脑「${deleteTarget?.name || ''}」？\n绑定该大脑的所有人物将无法正常使用。\n\n${roles.filter(r => r.brainId === deleteTarget?.id).map(r => `· ${r.name}`).join('\n') || '(无关联人物)'}`}
        confirmText="删除"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
