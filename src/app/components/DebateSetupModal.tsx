'use client';

import { useState, useEffect, useCallback } from 'react';
import { listRoles } from '@/lib/api';

interface DebateSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (params: {
    proTopic: string;
    conTopic: string;
    background: string;
    pro1: string; pro2: string; pro3: string; pro4: string;
    con1: string; con2: string; con3: string; con4: string;
    judge: string;
  }) => void;
}

export default function DebateSetupModal({ isOpen, onClose, onStart }: DebateSetupModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [roles, setRoles] = useState<any[]>([]);
  const [proTopic, setProTopic] = useState('');
  const [conTopic, setConTopic] = useState('');
  const [background, setBackground] = useState('');
  const [pro1, setPro1] = useState('');
  const [pro2, setPro2] = useState('');
  const [pro3, setPro3] = useState('');
  const [pro4, setPro4] = useState('');
  const [con1, setCon1] = useState('');
  const [con2, setCon2] = useState('');
  const [con3, setCon3] = useState('');
  const [con4, setCon4] = useState('');
  const [judge, setJudge] = useState('');

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

  useEffect(() => {
    if (isOpen) {
      listRoles().then((all) => setRoles(all.filter((r: any) => (r.brainType || '').split(',').includes('chat')))).catch(() => setRoles([]));
    }
  }, [isOpen]);

  const allFilled = proTopic.trim() && conTopic.trim() && pro1 && pro2 && pro3 && pro4 && con1 && con2 && con3 && con4 && judge;

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  const handleStart = () => {
    if (!allFilled) return;
    onStart({ proTopic: proTopic.trim(), conTopic: conTopic.trim(), background, pro1, pro2, pro3, pro4, con1, con2, con3, con4, judge });
  };

  if (!mounted) return null;

  const renderRoleSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <div className="flex items-center gap-2">
      <span className="font-hand text-sm text-oxblood/60 w-12 shrink-0">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-sm text-oxblood appearance-none cursor-pointer"
      >
        <option value="">选择角色</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name} · {r.brainName || '未绑定'}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="辩论设置"
    >
      <div
        className={`relative transition-all duration-200 ${
          visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
        style={{
          width: '580px',
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

        {/* ── Content ── */}
        <div className="relative p-8 z-10">
          {/* ── Header ── */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-hand text-2xl text-oxblood">辩论设置</h2>
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center cursor-pointer opacity-40 hover:opacity-100 transition-opacity"
              aria-label="关闭"
            >
              <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" aria-hidden="true">
                <path d="M 3 3 L 13 13 M 13 3 L 3 13" stroke="#2C2C2C" strokeWidth="1.5" strokeLinecap="round" filter="url(#tremble)" />
              </svg>
            </button>
          </div>

          <div className="space-y-5">
            {/* ── Pro & Con topics ── */}
            <div className="grid grid-cols-2 gap-6">
              <div className="group">
                <p className="font-hand text-sm text-oxblood/60 mb-1">正方辩题</p>
                <input
                  value={proTopic}
                  onChange={(e) => setProTopic(e.target.value)}
                  placeholder="例如：人工智能对人类发展利大于弊"
                  className="w-full bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-base text-oxblood placeholder-oxblood/30 caret-oxblood"
                />
                <div className="shaky-line w-full mt-1" />
              </div>
              <div className="group">
                <p className="font-hand text-sm text-oxblood/60 mb-1">反方辩题</p>
                <input
                  value={conTopic}
                  onChange={(e) => setConTopic(e.target.value)}
                  placeholder="例如：人工智能对人类发展弊大于利"
                  className="w-full bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-base text-oxblood placeholder-oxblood/30 caret-oxblood"
                />
                <div className="shaky-line w-full mt-1" />
              </div>
            </div>

            {/* ── Background ── */}
            <div className="group">
              <p className="font-hand text-sm text-oxblood/60 mb-1">
                背景资料 <span className="text-oxblood/30">（可选）</span>
              </p>
              <textarea
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                placeholder="提供辩题相关的背景信息、统计数据或参考资料..."
                rows={3}
                className="w-full bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-sm text-oxblood placeholder-oxblood/30 caret-oxblood resize-none"
              />
              <div className="shaky-line w-full mt-1" />
            </div>

            {/* ── Pro & Con side by side ── */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="font-hand text-base text-oxblood mb-2">正方</p>
                <div className="space-y-2">
                  {renderRoleSelect(pro1, setPro1, '一辩')}
                  {renderRoleSelect(pro2, setPro2, '二辩')}
                  {renderRoleSelect(pro3, setPro3, '三辩')}
                  {renderRoleSelect(pro4, setPro4, '四辩')}
                </div>
              </div>
              <div>
                <p className="font-hand text-base text-oxblood mb-2">反方</p>
                <div className="space-y-2">
                  {renderRoleSelect(con1, setCon1, '一辩')}
                  {renderRoleSelect(con2, setCon2, '二辩')}
                  {renderRoleSelect(con3, setCon3, '三辩')}
                  {renderRoleSelect(con4, setCon4, '四辩')}
                </div>
              </div>
            </div>

            {/* ── Judge ── */}
            <div>
              <p className="font-hand text-base text-oxblood mb-2">裁判</p>
              <div className="pl-2">
                {renderRoleSelect(judge, setJudge, '裁判')}
              </div>
              <div className="shaky-line w-full mt-2" />
            </div>

            {/* ── Start button ── */}
            <div className="flex items-center justify-end pt-4">
              <button
                onClick={handleStart}
                disabled={!allFilled}
                className="relative px-8 py-2.5 font-hand text-lg cursor-pointer select-none disabled:opacity-40"
                type="button"
              >
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 140 50" preserveAspectRatio="none" fill="none" aria-hidden="true">
                  {allFilled ? (
                    <>
                      <rect x="2" y="2" width="136" height="46" rx="10" fill="#2C2C2C" />
                      <rect x="2" y="2" width="136" height="46" rx="10" fill="none" stroke="#2C2C2C" strokeWidth="2" filter="url(#tremble)" />
                    </>
                  ) : (
                    <rect x="2" y="2" width="136" height="46" rx="10" fill="none" stroke="#2C2C2C" strokeWidth="2" filter="url(#tremble)" opacity="0.3" />
                  )}
                </svg>
                <span className={`relative ${allFilled ? 'text-white' : 'text-oxblood/30'}`}>开始辩论</span>
              </button>
            </div>
          </div>
      </div>
    </div>
  </div>
  );
}
