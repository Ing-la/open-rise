'use client';

import { useState, useEffect, useCallback } from 'react';
import { listBrains, loadAgentCapabilities, saveAgentCapabilities } from '@/lib/api';

interface AgentCapabilitiesModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentRoleId: string | null;
  agentRoleName: string;
}

const CAPABILITY_TYPES = [
  { key: 'image', label: 'image' },
  { key: 'vision', label: 'vision' },
];

interface CapsConfig {
  [roleId: string]: {
    [capType: string]: { brainId: string } | undefined;
  } | undefined;
}

export default function AgentCapabilitiesModal({ isOpen, onClose, agentRoleId, agentRoleName }: AgentCapabilitiesModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [brains, setBrains] = useState<any[]>([]);
  // Per-role config format: { [roleId]: { image: { brainId }, vision: { brainId } } }
  const [fullConfig, setFullConfig] = useState<CapsConfig>({});
  const [saving, setSaving] = useState(false);

  // ── Animation ──
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

  // ── Load data ──
  useEffect(() => {
    if (!isOpen) return;
    Promise.all([listBrains(), loadAgentCapabilities()]).then(([brainsData, caps]) => {
      setBrains(brainsData);
      setFullConfig(caps || {});
    });
  }, [isOpen]);

  // ── Escape ──
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // ── Overlay click ──
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  const getRoleValue = useCallback(
    (type: string): string => {
      if (!agentRoleId) return '';
      const roleCaps = fullConfig[agentRoleId];
      return roleCaps?.[type]?.brainId || '';
    },
    [fullConfig, agentRoleId]
  );

  const handleChange = useCallback(
    (type: string, brainId: string) => {
      if (!agentRoleId) return;
      setFullConfig((prev) => {
        const roleCaps = prev[agentRoleId] || {};
        if (brainId === '') {
          // Disable: remove this capability for the role
          const { [type]: _, ...rest } = roleCaps;
          const updated = Object.keys(rest).length > 0 ? rest : undefined;
          return { ...prev, [agentRoleId]: updated };
        } else {
          return { ...prev, [agentRoleId]: { ...roleCaps, [type]: { brainId } } };
        }
      });
    },
    [agentRoleId]
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await saveAgentCapabilities(fullConfig);
      onClose();
    } catch (err) {
      console.error('Failed to save capabilities:', err);
    } finally {
      setSaving(false);
    }
  }, [fullConfig, onClose]);

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
      aria-label="多模态能力配置"
    >
      <div
        className={`relative transition-all duration-200 ${
          visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
        style={{
          width: '420px',
          maxWidth: 'calc(100vw - 48px)',
        }}
      >
        {/* ── Border SVG ── */}
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

        <div className="relative p-8 z-10">
          {/* ── Title ── */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-hand text-2xl text-oxblood">🔧 小帮手</h2>
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center cursor-pointer opacity-40 hover:opacity-100 transition-opacity"
              aria-label="关闭"
              type="button"
            >
              <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" aria-hidden="true">
                <path d="M 3 3 L 13 13 M 13 3 L 3 13" stroke="#2C2C2C" strokeWidth="1.5" strokeLinecap="round" filter="url(#tremble)" />
              </svg>
            </button>
          </div>

          {agentRoleId ? (
            <>
              <p className="font-mono text-xs text-oxblood/40 mb-6">
                <span className="text-oxblood/70">{agentRoleName}</span> 的额外能力配置
              </p>

              {/* ── Capability rows ── */}
              <div className="space-y-4 mb-8">
                {CAPABILITY_TYPES.map(({ key, label }) => {
                  const matchingBrains = brains.filter((b) => {
                    const types = (b.type || '').split(',').map((t: string) => t.trim());
                    return types.includes(key);
                  });
                  const selectedBrainId = getRoleValue(key);

                  // Don't show row if no brains support this capability
                  if (matchingBrains.length === 0) return null;

                  return (
                    <div key={key}>
                      <label className="block font-hand text-base text-oxblood mb-1">{label}</label>
                      <div className="relative">
                        <select
                          value={selectedBrainId}
                          onChange={(e) => handleChange(key, e.target.value)}
                          className="w-full bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-base text-oxblood appearance-none cursor-pointer"
                        >
                          <option value="">不启用</option>
                          {matchingBrains.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name} · {b.modelName}
                            </option>
                          ))}
                        </select>
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none">
                          <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true">
                            <path d="M 1 1 L 6 7 L 11 1" stroke="#2C2C2C" strokeWidth="1.5" strokeLinecap="round" filter="url(#tremble)" />
                          </svg>
                        </div>
                      </div>
                      <div className="shaky-line w-full mt-1" />
                    </div>
                  );
                })}

                {CAPABILITY_TYPES.every(({ key }) => {
                  const types = brains.flatMap((b) => (b.type || '').split(',').map((t: string) => t.trim()));
                  return !types.includes(key);
                }) && (
                  <p className="font-mono text-sm text-oxblood/40 text-center py-4">
                    暂无可用的多模态大脑。请先在「大脑配置」中添加多模态大脑。
                  </p>
                )}
              </div>

              {/* ── Buttons ── */}
              <div className="flex items-center justify-end gap-4">
                <button
                  onClick={onClose}
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
                  disabled={saving}
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
            </>
          ) : (
            <p className="font-mono text-sm text-oxblood/40 text-center py-8">
              请先选择一个角色再配置能力。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
