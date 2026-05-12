'use client';

import { useState, useEffect } from 'react';
import { listRoles } from '@/lib/api';
import { AvatarIcon } from './AvatarIcon';

interface AgentRolePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (role: any) => void;
}

export default function AgentRolePicker({ isOpen, onClose, onSelect }: AgentRolePickerProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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
      setLoading(true);
      listRoles().then((all) => {
        // Only show roles with chat-type brains
        setRoles(all.filter((r: any) => r.brainType === 'chat'));
      }).catch(() => setRoles([])).finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-200"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/10" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-[#F2F2EE] border border-[#2C2C2C] rounded-xl shadow-xl w-full max-w-sm max-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <span className="font-hand text-lg text-[#2C2C2C]">选择 Agent 角色</span>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center cursor-pointer focus:outline-none"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" aria-hidden="true">
              <path d="M 3 3 L 13 13 M 13 3 L 3 13" stroke="#2C2C2C" strokeWidth="1.5" strokeLinecap="round" filter="url(#tremble)" />
            </svg>
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto thin-scroll px-3 pb-4">
          {loading ? (
            <p className="font-hand text-sm text-[#2C2C2C]/30 text-center py-8">加载中...</p>
          ) : roles.length === 0 ? (
            <p className="font-hand text-sm text-[#2C2C2C]/40 text-center py-8">
              没有可用角色。请先在 /role 中配置角色并绑定对话大脑。
            </p>
          ) : (
            <div className="space-y-1">
              {roles.map((role) => (
                <button
                  key={role.id}
                  onClick={() => {
                    onSelect(role);
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg transition-colors hover:bg-[#2C2C2C]/5 cursor-pointer text-left"
                >
                  <AvatarIcon id={role.avatar} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="font-hand text-sm text-[#2C2C2C] truncate">{role.name}</p>
                    <p className="font-mono text-[10px] text-[#2C2C2C]/40 truncate">{role.brainName}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
