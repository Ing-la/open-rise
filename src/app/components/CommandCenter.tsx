'use client';

import { useState } from 'react';
import BrainModal from './BrainModal';
import RoleModal from './RoleModal';

interface CommandCenterProps {
  onChatStart?: () => void;
  onAgentStart?: () => void;
}

export default function CommandCenter({ onChatStart, onAgentStart }: CommandCenterProps) {
  const [inputValue, setInputValue] = useState('');
  const [brainOpen, setBrainOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const trimmed = inputValue.trim();
      if (trimmed === '/brain') {
        setBrainOpen(true);
        setInputValue('');
      } else if (trimmed === '/role') {
        setRoleOpen(true);
        setInputValue('');
      } else if (trimmed === '/chat') {
        setInputValue('');
        onChatStart?.();
      } else if (trimmed === '/agent') {
        setInputValue('');
        onAgentStart?.();
      }
    }
  };

  return (
    <>
      <div className="w-full max-w-lg group">
        <div className="flex items-center gap-3 pb-2">
          <span className="font-mono text-2xl text-[#2C2C2C]/70 select-none">&gt;</span>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入 / 开始你的进化..."
            className="w-full bg-transparent border-none focus:outline-none focus:ring-0 font-mono text-lg text-[#2C2C2C] placeholder-[#2C2C2C]/30 caret-[#2C2C2C]"
          />
        </div>
        <div className="shaky-line w-full" />
      </div>
      <BrainModal isOpen={brainOpen} onClose={() => setBrainOpen(false)} />
      <RoleModal isOpen={roleOpen} onClose={() => setRoleOpen(false)} />
    </>
  );
}
