'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { listBrains, createBrain, updateBrain, deleteBrain, testBrainConnection } from '@/lib/api';

interface BrainModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BrainModal({ isOpen, onClose }: BrainModalProps) {
  const [mode, setMode] = useState<'empty' | 'form'>('empty');
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [brains, setBrains] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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

  // ── Load brains when opening ──
  const loadBrains = useCallback(async () => {
    setEditingId(null);
    setTestResults({});
    setLoading(true);
    try {
      const data = await listBrains();
      setBrains(data);
      setShowList(data.length > 0);
      setMode(data.length === 0 ? 'empty' : 'form');
    } catch {
      // silently fail — keep empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) loadBrains();
  }, [isOpen, loadBrains]);

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

  // ── Form state ──
  const [brainName, setBrainName] = useState('');
  const [vendor, setVendor] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [website, setWebsite] = useState('');
  const [model, setModel] = useState('');
  const [brainType, setBrainType] = useState<'chat' | 'image' | ''>('');
  const [saving, setSaving] = useState(false);
  const [showList, setShowList] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, 'idle' | 'testing' | 'success' | 'fail'>>({});

  const PRESETS = [
    { label: 'DeepSeek',  vendor: 'DeepSeek',    endpoint: 'https://api.deepseek.com/v1',                                website: 'https://platform.deepseek.com' },
    { label: '智谱GLM',   vendor: '智谱GLM',     endpoint: 'https://open.bigmodel.cn/api/paas/v4',                       website: 'https://open.bigmodel.cn' },
    { label: '百炼',      vendor: '百炼',         endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',           website: 'https://bailian.console.aliyun.com' },
    { label: 'Kimi',      vendor: 'Kimi',         endpoint: 'https://api.moonshot.cn/v1',                                 website: 'https://platform.moonshot.cn' },
    { label: '硅基流动',  vendor: '硅基流动',     endpoint: 'https://api.siliconflow.cn/v1',                              website: 'https://cloud.siliconflow.cn' },
  ] as const;

  const handlePreset = useCallback((preset: typeof PRESETS[number]) => {
    setVendor(preset.vendor);
    setEndpoint(preset.endpoint);
    setWebsite(preset.website);
    setBrainName('');
    setApiKey('');
    setModel('');
    setBrainType('');
  }, []);

  const isValid = useCallback(() => {
    return brainName.trim() && vendor.trim() && endpoint.trim() && apiKey.trim() && model.trim() && brainType !== '';
  }, [brainName, vendor, endpoint, apiKey, model, brainType]);

  const handleSave = useCallback(async () => {
    if (!isValid()) return;
    setSaving(true);
    const payload = { name: brainName.trim(), vendor, endpoint, apiKey, website, model, type: brainType as string };
    try {
      if (editingId) {
        await updateBrain(editingId, payload);
      } else {
        await createBrain(payload);
      }
      onClose();
    } catch (err) {
      console.error('Failed to save brain:', err);
    } finally {
      setSaving(false);
    }
  }, [brainName, vendor, endpoint, apiKey, website, model, brainType, editingId, onClose]);

  const handleEdit = useCallback((brain: any) => {
    setBrainName(brain.name);
    setVendor(brain.provider);
    setEndpoint(brain.baseUrl);
    setApiKey(brain.apiKey);
    setWebsite(brain.website ?? '');
    setModel(brain.modelName);
    setBrainType(brain.type || 'chat');
    setEditingId(brain.id);
    setMode('form');
    setShowList(false);
  }, []);

  const handleTest = useCallback(async (id: string) => {
    setTestResults((prev) => ({ ...prev, [id]: 'testing' }));
    try {
      const res = await testBrainConnection(id);
      setTestResults((prev) => ({ ...prev, [id]: res.success ? 'success' : 'fail' }));
    } catch {
      setTestResults((prev) => ({ ...prev, [id]: 'fail' }));
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteBrain(id);
      setBrains((prev) => prev.filter((b) => b.id !== id));
      if (brains.length <= 1) setMode('empty');
    } catch (err) {
      console.error('Failed to delete brain:', err);
    }
  }, [brains.length]);

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
      aria-label="大脑配置"
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
              {mode === 'form' && showList ? '大脑列表' : mode === 'form' ? (editingId ? '编辑大脑' : '新建大脑') : '大脑配置'}
            </h2>
            {mode === 'form' && !showList ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setShowList(true); setEditingId(null); }}
                  className="relative px-3 py-1.5 font-hand text-sm cursor-pointer select-none"
                  type="button"
                >
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 70 30" preserveAspectRatio="none" fill="none" aria-hidden="true">
                    <rect x="1" y="1" width="68" height="28" rx="6" stroke="#2C2C2C" strokeWidth="1.5" filter="url(#tremble)" />
                  </svg>
                  <span className="relative text-oxblood">取消</span>
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !isValid()}
                  className="relative px-3 py-1.5 font-hand text-sm cursor-pointer select-none disabled:opacity-40"
                  type="button"
                >
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 70 30" preserveAspectRatio="none" fill="none" aria-hidden="true">
                    <rect x="1" y="1" width="68" height="28" rx="6" fill="#2C2C2C" />
                    <rect x="1" y="1" width="68" height="28" rx="6" fill="none" stroke="#2C2C2C" strokeWidth="1.5" filter="url(#tremble)" />
                  </svg>
                  <span className="relative text-white">{saving ? '保存中...' : '保存'}</span>
                </button>
              </div>
            ) : (mode === 'empty' || showList) && (
              <button
                onClick={() => { setMode('form'); setShowList(false); setEditingId(null); setBrainName(''); setVendor(''); setEndpoint(''); setApiKey(''); setWebsite(''); setModel(''); setBrainType(''); }}
                className="group w-8 h-8 flex items-center justify-center cursor-pointer"
                aria-label="新建大脑"
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
               State A — Empty (no brains yet)
               ════════════════════════════════════════ */
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <p className="font-hand text-lg text-oxblood/60">尚未配置大脑</p>
              {loading && <p className="font-mono text-sm text-oxblood/30">加载中...</p>}
            </div>
          ) : showList ? (
            /* ════════════════════════════════════════
               State B2 — Brain list
               ════════════════════════════════════════ */
            <div className="space-y-3">
              {loading ? (
                <p className="font-mono text-sm text-oxblood/30 text-center py-8">加载中...</p>
              ) : brains.length === 0 ? (
                <p className="font-hand text-lg text-oxblood/60 text-center py-8">尚未配置大脑</p>
              ) : (
                brains.map((b) => {
                  const testState = testResults[b.id];
                  return (
                  <div key={b.id} className="relative p-4">
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 400 80" preserveAspectRatio="none" fill="none" aria-hidden="true">
                      <rect x="2" y="2" width="396" height="76" rx="8" fill="none" stroke="#2C2C2C" strokeWidth="1" filter="url(#tremble)" opacity="0.4" />
                    </svg>
                    <div className="relative flex items-center justify-between">
                      <div>
                        <p className="font-hand text-base text-oxblood">{b.name}</p>
                        <p className="font-mono text-xs text-oxblood/40 mt-0.5">{b.provider} · {b.modelName}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {/* Test result indicator */}
                        {testState === 'success' && (
                          <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
                        )}
                        {testState === 'fail' && (
                          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                        )}
                        {/* Test button */}
                        <button
                          onClick={() => handleTest(b.id)}
                          disabled={testState === 'testing'}
                          className="w-6 h-6 flex items-center justify-center cursor-pointer opacity-40 hover:opacity-100 transition-opacity disabled:opacity-20"
                          aria-label="测试连接"
                        >
                          {testState === 'testing' ? (
                            <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" aria-hidden="true">
                              <circle cx="8" cy="8" r="6" stroke="#2C2C2C" strokeWidth="1.5" strokeDasharray="2 3" filter="url(#tremble)" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" aria-hidden="true">
                              <polygon points="4,2 4,14 14,8" stroke="#2C2C2C" strokeWidth="1.5" strokeLinejoin="round" filter="url(#tremble)" />
                            </svg>
                          )}
                        </button>
                        {/* Edit button */}
                        <button
                          onClick={() => handleEdit(b)}
                          className="w-6 h-6 flex items-center justify-center cursor-pointer opacity-40 hover:opacity-100 transition-opacity"
                          aria-label="编辑"
                        >
                          <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" aria-hidden="true">
                            <path d="M 2 12 L 2 15 L 5 15 L 15 5 L 12 2 Z" stroke="#2C2C2C" strokeWidth="1.5" strokeLinejoin="round" filter="url(#tremble)" />
                            <line x1="12" y1="2" x2="15" y2="5" stroke="#2C2C2C" strokeWidth="1.5" strokeLinecap="round" filter="url(#tremble)" />
                          </svg>
                        </button>
                        {/* Delete button */}
                        <button
                          onClick={() => handleDelete(b.id)}
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
                )})
              )}
            </div>
          ) : (
            /* ════════════════════════════════════════
               State B — Configuration form
               ════════════════════════════════════════ */
            <div className="space-y-5">
              {/* ── Toggle to brain list ── */}
              {brains.length > 0 && (
                <button
                  onClick={() => { setShowList(true); setEditingId(null); }}
                  className="font-mono text-xs text-oxblood/30 hover:text-oxblood/60 transition-colors cursor-pointer mb-2 block"
                  type="button"
                >
                  ← 已有 {brains.length} 个大脑
                </button>
              )}

              {/* ── Preset Provider Buttons ── */}
              <div className="flex items-center gap-3 pb-1">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => handlePreset(p)}
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

              <div className="w-full h-px bg-oxblood/20" />

              {/* 1. 大脑名称 */}
              <div className="group">
                <label className="block font-hand text-base text-oxblood mb-1">大脑名称</label>
                <input
                  ref={firstInputRef}
                  type="text"
                  value={brainName}
                  onChange={(e) => setBrainName(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-base text-oxblood placeholder-oxblood/30 caret-oxblood"
                  placeholder="例如: My Brain"
                  autoComplete="off"
                />
                <div className="shaky-line w-full mt-1" />
              </div>

              {/* 2. 供应商名称 */}
              <div className="group">
                <label className="block font-hand text-base text-oxblood mb-1">供应商名称</label>
                <input
                  type="text"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-base text-oxblood placeholder-oxblood/30 caret-oxblood"
                  placeholder="例如: DeepSeek"
                  autoComplete="off"
                />
                <div className="shaky-line w-full mt-1" />
              </div>

              {/* 3. 请求地址 */}
              <div className="group">
                <label className="block font-hand text-base text-oxblood mb-1">请求地址</label>
                <input
                  type="url"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-base text-oxblood placeholder-oxblood/30 caret-oxblood"
                  placeholder="https://api.example.com/v1"
                  autoComplete="off"
                />
                <div className="shaky-line w-full mt-1" />
              </div>

              {/* 4. API Key */}
              <div className="group">
                <label className="block font-hand text-base text-oxblood mb-1">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-base text-oxblood placeholder-oxblood/30 caret-oxblood"
                  placeholder="sk-xxxxxxxxxxxxxxxx"
                  autoComplete="new-password"
                />
                <div className="shaky-line w-full mt-1" />
              </div>

              {/* 5. 官网链接 */}
              <div className="group">
                <label className="block font-hand text-base text-oxblood mb-1">官网链接</label>
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-base text-oxblood placeholder-oxblood/30 caret-oxblood"
                  placeholder="https://example.com"
                  autoComplete="off"
                />
                <div className="shaky-line w-full mt-1" />
              </div>

              {/* 6. 模型选择 + 类型切换 */}
              <div className="group">
                <label className="block font-hand text-base text-oxblood mb-1">模型选择 <span className="text-oxblood/40">(手动输入)</span></label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-base text-oxblood placeholder-oxblood/30 caret-oxblood min-w-0"
                    placeholder="例如: deepseek-chat"
                    autoComplete="off"
                  />
                  {/* Type toggle */}
                  <button
                    onClick={() => setBrainType('chat')}
                    className={`relative px-3 py-1 font-hand text-sm cursor-pointer select-none shrink-0 ${brainType === 'image' ? 'opacity-40 hover:opacity-70' : ''}`}
                    type="button"
                  >
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 60 28" preserveAspectRatio="none" fill="none" aria-hidden="true">
                      {brainType === 'chat' ? (
                        <>
                          <rect x="1" y="1" width="58" height="26" rx="6" fill="#2C2C2C" />
                          <rect x="1" y="1" width="58" height="26" rx="6" fill="none" stroke="#2C2C2C" strokeWidth="1.5" filter="url(#tremble)" />
                        </>
                      ) : (
                        <rect x="1" y="1" width="58" height="26" rx="6" fill="none" stroke="#2C2C2C" strokeWidth="1.5" filter="url(#tremble)" opacity="0.5" />
                      )}
                    </svg>
                    <span className={`relative ${brainType === 'chat' ? 'text-white' : 'text-oxblood/60'}`}>对话</span>
                  </button>
                  <button
                    onClick={() => setBrainType('image')}
                    className={`relative px-3 py-1 font-hand text-sm cursor-pointer select-none shrink-0 ${brainType === 'chat' ? 'opacity-40 hover:opacity-70' : ''}`}
                    type="button"
                  >
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 60 28" preserveAspectRatio="none" fill="none" aria-hidden="true">
                      {brainType === 'image' ? (
                        <>
                          <rect x="1" y="1" width="58" height="26" rx="6" fill="#2C2C2C" />
                          <rect x="1" y="1" width="58" height="26" rx="6" fill="none" stroke="#2C2C2C" strokeWidth="1.5" filter="url(#tremble)" />
                        </>
                      ) : (
                        <rect x="1" y="1" width="58" height="26" rx="6" fill="none" stroke="#2C2C2C" strokeWidth="1.5" filter="url(#tremble)" opacity="0.5" />
                      )}
                    </svg>
                    <span className={`relative ${brainType === 'image' ? 'text-white' : 'text-oxblood/60'}`}>文生图</span>
                  </button>
                </div>
                <div className="shaky-line w-full mt-1" />
              </div>{/* ── end form fields ── */}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
