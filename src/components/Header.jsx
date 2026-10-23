import React from 'react';
import { Satellite } from 'lucide-react';

export default function Header() {
  return (
    <header className="site-header sticky top-0 z-50 border-b backdrop-blur-xl">
      <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#top" className="group flex items-center gap-3.5" aria-label="GeoZenX home">
          {/* <div className="brand-mark relative flex h-11 w-11 items-center justify-center rounded-2xl border transition-all duration-300 ease-out group-hover:-translate-y-0.5 group-hover:scale-[1.03] group-hover:shadow-[0_12px_30px_rgba(139,224,193,0.18)]">
            <Satellite className="h-5 w-5 transition-transform duration-300 ease-out group-hover:rotate-12" />
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#0a1118] bg-[#8be0c1] shadow-[0_0_12px_rgba(139,224,193,0.7)]" />
          </div> */}

          <div className="leading-none">
            <div className="flex items-center gap-2">
              <span className="text-[1.4rem] font-extrabold tracking-[-0.06em] text-white transition-colors duration-200 ease-out group-hover:text-[#dffdf6]">
                GeoZenX<span className="text-[#8be0c1]">.ai</span>
              </span>
            </div>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500 transition-colors duration-200 ease-out group-hover:text-slate-300">
              Earth intelligence
            </p>
          </div>
        </a>

        <nav className="hidden items-center gap-8 text-sm font-semibold sm:flex" aria-label="Main navigation">
          <a className="header-link" href="#analysis">Workspace</a>
          <a className="header-link" href="#results">Insights</a>
          <a className="header-link" href="#assistant">AI assistant</a>
        </nav>
      </div>
    </header>
  );
}
