'use client';

import { useState } from 'react';

interface TraceStep {
  step: number;
  type: 'thought' | 'tool_use' | 'tool_result';
  content?: string;
  name?: string;
  input?: any;
  output?: string;
}

interface ReActTraceProps {
  trace: TraceStep[];
  defaultOpen?: boolean;
}

function TraceStepRow({ step, type, content, name, input, output }: TraceStep & { step: number }) {
  const [expanded, setExpanded] = useState(false);

  if (type === 'thought') {
    return (
      <div className="flex gap-2 py-1">
        <span className="font-mono text-xs text-[#2C2C2C]/30 w-5 shrink-0 text-right">{step}</span>
        <span className="font-mono text-xs text-[#2C2C2C]/50 italic">🤔 {content}</span>
      </div>
    );
  }

  if (type === 'tool_use') {
    const inputStr = input ? JSON.stringify(input, null, 1) : '{}';
    const isLongInput = inputStr.length > 60;

    return (
      <div className="flex gap-2 py-1">
        <span className="font-mono text-xs text-[#2C2C2C]/30 w-5 shrink-0 text-right">{step}</span>
        <div className="flex-1 min-w-0">
          <span className="font-mono text-xs text-[#2C2C2C]/70">
            🛠 <span className="font-bold">{name}</span>
          </span>
          {isLongInput ? (
            <>
              <button
                onClick={() => setExpanded(!expanded)}
                className="block font-mono text-xs text-[#2C2C2C]/40 hover:text-[#2C2C2C]/70 mt-0.5 cursor-pointer"
              >
                {expanded ? '收起参数' : '展开参数'}
              </button>
              {expanded && (
                <pre className="font-mono text-[11px] text-[#2C2C2C]/50 mt-0.5 whitespace-pre-wrap overflow-x-auto max-h-32 overflow-y-auto thin-scroll">
                  {inputStr}
                </pre>
              )}
            </>
          ) : (
            <pre className="font-mono text-[11px] text-[#2C2C2C]/50 mt-0.5 whitespace-pre-wrap">{inputStr}</pre>
          )}
          {output && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="block font-mono text-xs text-[#2C2C2C]/40 hover:text-[#2C2C2C]/70 mt-0.5 cursor-pointer"
            >
              ← {output.length > 50 ? `${output.slice(0, 50)}...` : output}
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}

export default function ReActTrace({ trace, defaultOpen = false }: ReActTraceProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (trace.length === 0) return null;

  return (
    <div className="mt-3 border-t border-[#2C2C2C]/10 pt-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs font-mono text-[#2C2C2C]/40 hover:text-[#2C2C2C]/70 transition-colors cursor-pointer"
      >
        <span className={`transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}>&#9656;</span>
        {isOpen ? '隐藏思考过程' : `查看思考过程 (${trace.length} 步)`}
      </button>
      {isOpen && (
        <div className="mt-2 pl-2 border-l-2 border-[#2C2C2C]/10 ml-1">
          {trace.map((t, i) => (
            <TraceStepRow key={i} {...t} step={t.step || i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
