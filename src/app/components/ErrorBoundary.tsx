'use client';

import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-6">
            <p className="font-hand text-lg text-[#2C2C2C]/40 mb-2">页面出错了</p>
            <p className="font-mono text-xs text-[#2C2C2C]/30 mb-4 max-w-md break-all">
              {this.state.error?.message}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="font-mono text-sm text-[#2C2C2C]/60 border border-[#2C2C2C]/20 hover:border-[#2C2C2C]/50 px-4 py-2 rounded-lg transition-colors cursor-pointer"
            >
              重试
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
