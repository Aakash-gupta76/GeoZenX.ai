import React from 'react';
import {
  ArrowDownRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Leaf,
  Mountain,
  Satellite,
  Sparkles,
} from 'lucide-react';

export default function Hero() {
  return (
    <section className="hero-section">
      <div className="hero-content mx-auto grid items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-12 lg:px-8">
        <div className="hero-copy">
          {/* <div className="hero-kicker mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Satellite intelligence, made clear</span>
          </div> */}

          <h1 className="hero-title mb-5 font-extrabold text-white">
            See what’s changing on <span>Satellite images</span>
          </h1>

          <p className="mb-3 text-base font-semibold tracking-[-0.02em] text-slate-200 sm:text-lg">
            Compare. Detect. Understand.
          </p>

          <p className="hero-description mb-7">
            Turn satellite imagery into a clearer picture of our changing planet. Explore land
            cover shifts, measure impact, and ask questions in plain language.
          </p>

          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <a href="#analysis" className="hero-cta inline-flex whitespace-nowrap items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold">
              Explore the workspace
              <ArrowDownRight className="h-4 w-4" />
            </a>
            <p className="hero-note flex items-center gap-2 text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-[#8be0c1]" />
              Built for a more informed view of change
            </p>
          </div>
        </div>

        <div className="hero-visual" aria-label="Illustrative satellite-image comparison and detected changes">
          <div className="hero-satellite">
            <Satellite className="hero-satellite-icon" strokeWidth={1.15} />
            <span>EARTH OBSERVATION · CHANGE DETECTION</span>
          </div>

          <div className="hero-comparison">
            <div className="hero-image-card hero-image-before">
              <div className="hero-image-label">
                <strong>Before</strong>
                <span>Jan 2023</span>
              </div>
              <svg className="hero-terrain hero-terrain-before" viewBox="0 0 520 360" role="img" aria-label="Illustrative forest and water satellite image">
                <defs>
                  <linearGradient id="forestBaseBefore" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0" stopColor="#0d3c32" />
                    <stop offset=".52" stopColor="#16452d" />
                    <stop offset="1" stopColor="#303e28" />
                  </linearGradient>
                  <pattern id="forestTextureBefore" width="50" height="42" patternUnits="userSpaceOnUse">
                    <circle cx="9" cy="11" r="9" fill="#28613a" />
                    <circle cx="32" cy="7" r="12" fill="#17492e" />
                    <circle cx="39" cy="31" r="13" fill="#35643a" />
                    <circle cx="15" cy="34" r="12" fill="#1d522f" />
                    <path d="M0 22L50 15M23 0L17 42" stroke="#8b8954" strokeOpacity=".18" strokeWidth="2" />
                  </pattern>
                </defs>
                <rect width="520" height="360" fill="url(#forestBaseBefore)" />
                <rect width="520" height="360" fill="url(#forestTextureBefore)" opacity=".94" />
                <path d="M-20 182C66 150 83 224 157 198S266 102 338 137s107 89 202 37v65c-82 62-142-1-208-19s-111 60-187 60S52 218-20 255Z" fill="#092d3a" />
                <path d="M-10 190C66 158 86 232 157 206s108-96 179-61 107 89 204 37" fill="none" stroke="#5f9078" strokeOpacity=".5" strokeWidth="5" />
                <path d="M65 0l30 110 70 64-24 102 56 84M340 0l-27 84 53 69-48 78 26 129" fill="none" stroke="#d5bb89" strokeOpacity=".46" strokeWidth="5" />
                <path d="M0 70L142 92 205 41 306 67 408 21 520 46M0 310l127-28 88 36 109-42 90 23 106-43" fill="none" stroke="#b6a47b" strokeOpacity=".32" strokeWidth="3" />
                <path d="M28 28l61 15M371 298l90-19M244 118l34-17" stroke="#e0d2ac" strokeOpacity=".55" strokeWidth="2" />
              </svg>
            </div>

            <div className="hero-image-card hero-image-after">
              <div className="hero-image-label">
                <strong>After</strong>
                <span>Jan 2025</span>
              </div>
              <svg className="hero-terrain hero-terrain-after" viewBox="0 0 520 360" role="img" aria-label="Illustrative changed satellite image with roads and buildings">
                <defs>
                  <linearGradient id="urbanBaseAfter" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0" stopColor="#183c2d" />
                    <stop offset=".45" stopColor="#35452d" />
                    <stop offset="1" stopColor="#584a37" />
                  </linearGradient>
                  <pattern id="urbanTextureAfter" width="48" height="44" patternUnits="userSpaceOnUse">
                    <circle cx="9" cy="11" r="10" fill="#285536" />
                    <circle cx="33" cy="8" r="11" fill="#1b482f" />
                    <circle cx="38" cy="32" r="12" fill="#46613a" />
                    <path d="M0 24L48 18M20 0L15 44" stroke="#a29a64" strokeOpacity=".21" strokeWidth="2" />
                  </pattern>
                </defs>
                <rect width="520" height="360" fill="url(#urbanBaseAfter)" />
                <rect width="520" height="360" fill="url(#urbanTextureAfter)" opacity=".72" />
                <path d="M-20 182C66 150 83 224 157 198S266 102 338 137s107 89 202 37v65c-82 62-142-1-208-19s-111 60-187 60S52 218-20 255Z" fill="#0c3440" />
                <path d="M-10 190C66 158 86 232 157 206s108-96 179-61 107 89 204 37" fill="none" stroke="#64947b" strokeOpacity=".48" strokeWidth="5" />
                <path d="M-10 101L520 100M-10 251L520 249M92 -5L94 365M281 -5L281 365M430 -5L431 365" fill="none" stroke="#d8d0b8" strokeOpacity=".82" strokeWidth="11" />
                <path d="M-10 101L520 100M-10 251L520 249M92 -5L94 365M281 -5L281 365M430 -5L431 365" fill="none" stroke="#545650" strokeOpacity=".85" strokeWidth="5" />
                <g fill="#a99e88" stroke="#e4d9c3" strokeOpacity=".48" strokeWidth="2">
                  <path d="M111 22h48v40h-48zM172 24h74v38h-74zM303 18h58v49h-58zM364 18h51v49h-51z" />
                  <path d="M111 119h48v70h-48zM171 119h91v69h-91zM303 117h53v72h-53zM366 118h49v70h-49z" />
                  <path d="M112 268h54v70h-54zM180 267h78v71h-78zM303 266h58v72h-58zM370 265h44v74h-44z" />
                </g>
                <g fill="#60744b" opacity=".9">
                  <circle cx="48" cy="56" r="22" /><circle cx="481" cy="183" r="24" />
                  <circle cx="48" cy="305" r="22" /><circle cx="477" cy="57" r="19" />
                </g>
              </svg>
            </div>

            <div className="hero-compare-divider" aria-hidden="true">
              <span><ChevronLeft /><ChevronRight /></span>
            </div>
            <div className="hero-preview-tag">ILLUSTRATIVE PREVIEW</div>
          </div>

          <aside className="hero-changes-card">
            <div className="hero-changes-title">
              <span>Detected changes</span>
              <span className="hero-live-dot" />
            </div>
            <div className="hero-change-row">
              <span className="hero-change-icon vegetation"><Leaf /></span>
              <div className="hero-change-detail">
                <div><span>Vegetation</span><strong className="negative">↓ 18.4%</strong></div>
                <i><b className="negative-bar" /></i>
              </div>
            </div>
            <div className="hero-change-row">
              <span className="hero-change-icon water"><Droplets /></span>
              <div className="hero-change-detail">
                <div><span>Water</span><strong className="negative">↓ 12.7%</strong></div>
                <i><b className="water-bar" /></i>
              </div>
            </div>
            <div className="hero-change-row">
              <span className="hero-change-icon land"><Mountain /></span>
              <div className="hero-change-detail">
                <div><span>Land / bare area</span><strong className="positive">↑ 16.2%</strong></div>
                <i><b className="positive-bar" /></i>
              </div>
            </div>
            <div className="hero-change-row">
              <span className="hero-change-icon buildings"><Building2 /></span>
              <div className="hero-change-detail">
                <div><span>Buildings</span><strong className="positive">↑ 22.6%</strong></div>
                <i><b className="building-bar" /></i>
              </div>
            </div>
            <p className="hero-changes-footnote">Example visual only · analyze your images for actual results</p>
          </aside>
        </div>
      </div>
    </section>
  );
}
