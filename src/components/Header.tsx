import React from 'react';
import { Upload } from 'lucide-react';

export type AppView = 'studio' | 'directory' | 'guide';

interface HeaderProps {
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  onTriggerUpload: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeView,
  onSelectView,
  onTriggerUpload,
}) => {
  const navItems: { id: AppView; label: string; href: string }[] = [
    { id: 'studio', label: 'Photo Studio', href: '/' },
    { id: 'directory', label: 'Country Specs', href: '/country-specs' },
    { id: 'guide', label: 'Print Guide', href: '/print-guide' },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-2 px-3 sm:gap-8 sm:px-6">
        {/* Zone 1: Single-element brand wordmark */}
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onSelectView('studio');
          }}
          className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 rounded"
        >
          PassFrame
        </a>

        {/* Zone 2: Concise single-line navigation links */}
        <nav aria-label="Primary navigation" className="flex items-center gap-3 sm:gap-8">
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            const mobileShort =
              item.id === 'studio' ? 'Studio' : item.id === 'directory' ? 'Specs' : 'Guide';
            return (
              <a
                key={item.id}
                href={item.href}
                onClick={(e) => {
                  e.preventDefault();
                  onSelectView(item.id);
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`relative py-1 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 rounded ${
                  isActive
                    ? 'text-slate-900'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="sm:hidden">{mobileShort}</span>
                <span className="hidden sm:inline">{item.label}</span>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[17px] h-0.5 bg-blue-700"
                  />
                )}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: Single primary action */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={onTriggerUpload}
            className="inline-flex items-center gap-1.5 sm:gap-2 rounded-lg bg-blue-700 px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm font-semibold text-white transition-colors hover:bg-blue-800 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            <Upload className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" aria-hidden="true" />
            <span className="sm:hidden">Upload</span>
            <span className="hidden sm:inline">Upload Photo</span>
          </button>
        </div>
      </div>
    </header>
  );
};
