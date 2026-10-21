import React from 'react';
import { Satellite, Radio, Activity } from 'lucide-react';

export default function Header() {
  return (
    <header className="site-header sticky top-0 z-50 border-b backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#top" className="flex items-center gap-3.5" aria-label="GeoZenX home">
          <div className="brand-mark relative flex h-10 w-10 items-center justify-center rounded-xl border">
            <Satellite className="h-5 w-5" />
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#0a1118] bg-[#8be0c1]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-extrabold tracking-[-0.055em] text-white">
                GeoZenX<span className="text-[#8be0c1]">.ai</span>
              </span>
            </div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Earth intelligence
            </p>
          </div>
        </a>

        <nav className="hidden items-center gap-8 text-xs font-semibold sm:flex" aria-label="Main navigation">
          <a className="header-link" href="#analysis">Workspace</a>
          <a className="header-link" href="#results">Insights</a>
          <a className="header-link" href="#assistant">AI assistant</a>
        </nav>

        <div className="flex items-center gap-3 sm:gap-5">
          <div className="hidden items-center gap-2 border-r border-white/10 pr-5 text-[11px] text-slate-400 lg:flex">
            <Radio className="h-3.5 w-3.5 text-[#8be0c1]" />
            <span>Sentinel-2B <span className="text-slate-600">·</span> Global coverage</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-3 py-1.5 text-[10px] font-semibold tracking-wide text-emerald-300">
            <Activity className="h-3.5 w-3.5" />
            <span>All systems normal</span>
          </div>
        </div>
      </div>
    </header>
  );
}
