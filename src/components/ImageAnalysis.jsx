import React, { useState, useRef } from 'react';
import { Upload, Image as ImageIcon, CheckCircle, RefreshCw, Layers, Crosshair, ArrowRight, Play, FileCheck } from 'lucide-react';
import { SAMPLE_PRESETS } from '../data/mockData';
import { analyzeImages } from '../api';

export default function ImageAnalysis({ onAnalysisComplete, isAnalyzing, setIsAnalyzing }) {
  const [t1Image, setT1Image] = useState(null);
  const [t2Image, setT2Image] = useState(null);
  const [t1FileName,  setT1FileName] = useState('');
  const [t2FileName, setT2FileName] = useState('');
  const [t1File, setT1File] = useState(null);
  const [t2File, setT2File] = useState(null);
  
  const t1InputRef = useRef(null);
  const t2InputRef = useRef(null);

  const handleFileUpload = (event, setImage, setFileName, setFile) => {
    const file = event.target.files?.[0];
    if (file) {
      setFile(file);
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImage(e.target?.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRunAnalysis = async () => {
    if (isAnalyzing) return;
    if (!t1Image || !t2Image) {
      window.alert('Please upload both images first.');
      return;
    }

    setIsAnalyzing(true);
    try {
      const result = await analyzeImages({ t1File, t2File, t1Image, t2Image });
      onAnalysisComplete(result, { t1File, t2File, t1Image, t2Image });
    } catch (error) {
      window.alert(`Image analysis failed: ${error.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePresetSelect = (preset) => {
    setT1File(null);
    setT2File(null);
    setT1Image(preset.t1Src);
    setT2Image(preset.t2Src);
    setT1FileName(`${preset.id}_T1.tif`);
    setT2FileName(`${preset.id}_T2.tif`);
  };

  return (
    <section id="analysis" className="max-w-6xl mx-auto mt-4 px-4 py-6">
      <div className="workspace-card relative p-5 sm:p-7">
        
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-space-800 pb-4">
          <div>
            <div className="flex items-center space-x-2">
              <Layers className="w-5 h-5 text-cyan-400" />
              <h2 className="text-xl font-bold tracking-tight text-white font-sans">
                Image change analysis
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Compare two moments in time to reveal meaningful change.
            </p>
          </div>

          {/* Quick Preset Selector */}
          <div className="flex items-center space-x-2">
            <span className="section-kicker hidden lg:inline">Demo dataset</span>
            <button
              onClick={() => handlePresetSelect(SAMPLE_PRESETS[0])}
              className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-[#8be0c1]/35 hover:text-[#8be0c1]"
            >
              Urban Growth
            </button>
          </div>
        </div>

        {/* Upload Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          
          {/* T1 Card */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-2 font-mono text-xs text-slate-300">
              <span className="flex items-center space-x-1.5 font-semibold text-[#8be0c1]">
                <Crosshair className="w-3.5 h-3.5" />
                <span>T1 • Temporal Image 01</span>
              </span>
              <span className="text-slate-400 text-[11px]">BASELINE PERIOD</span>
            </div>

            <div 
              onClick={() => !isAnalyzing && t1InputRef.current?.click()}
              className={`analysis-preview relative group flex min-h-[220px] cursor-pointer flex-col items-center justify-center overflow-hidden border transition-all duration-200 ${
                t1Image 
                  ? 'border-white/10 hover:border-[#8be0c1]/60'
                  : 'border-dashed border-white/15 bg-black/20 hover:border-[#8be0c1]/50 hover:bg-white/[0.025]'
              } ${isAnalyzing ? 'pointer-events-none opacity-80' : ''}`}
            >
              <input 
                type="file" 
                ref={t1InputRef} 
                className="hidden" 
                accept="image/*"
                onChange={(e) => handleFileUpload(e, setT1Image, setT1FileName, setT1File)}
              />

              {t1Image ? (
                <div className="relative w-full h-full min-h-[220px] group">
                  <img 
                    src={t1Image} 
                    alt="Temporal Image 01" 
                    className="w-full h-full object-cover min-h-[220px]"
                  />
                  {/* Overlay Info */}
                  <div className="absolute inset-0 bg-gradient-to-t from-space-950/90 via-transparent to-transparent opacity-90 p-3 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                      <span className="px-2 py-0.5 text-[10px] font-mono bg-space-900/90 text-cyan-300 border border-cyan-500/30 rounded">
                        T1 LOADED
                      </span>
                      <span className="text-[10px] font-mono text-slate-300 bg-space-900/80 px-2 py-0.5 rounded">
                        0.5m GSD
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                      <span className="truncate max-w-[200px]">{t1FileName}</span>
                      <span className="text-cyan-400 hover:underline flex items-center space-x-1">
                        <RefreshCw className="w-3 h-3" />
                        <span>Change</span>
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-space-850 border border-space-700 flex items-center justify-center mx-auto mb-3 text-cyan-400 group-hover:scale-110 transition">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-medium text-slate-200 mb-1">Upload satellite image</p>
                  <p className="text-xs text-slate-400 font-mono">PNG, JPG, TIFF, GeoTIFF up to 50MB</p>
                </div>
              )}
            </div>
          </div>

          {/* T2 Card */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-2 font-mono text-xs text-slate-300">
              <span className="flex items-center space-x-1.5 font-semibold text-[#8be0c1]">
                <Crosshair className="w-3.5 h-3.5" />
                <span>T2 • Temporal Image 02</span>
              </span>
              <span className="text-slate-400 text-[11px]">TARGET PERIOD</span>
            </div>

            <div 
              onClick={() => !isAnalyzing && t2InputRef.current?.click()}
              className={`analysis-preview relative group flex min-h-[220px] cursor-pointer flex-col items-center justify-center overflow-hidden border transition-all duration-200 ${
                t2Image 
                  ? 'border-white/10 hover:border-[#8be0c1]/60'
                  : 'border-dashed border-white/15 bg-black/20 hover:border-[#8be0c1]/50 hover:bg-white/[0.025]'
              } ${isAnalyzing ? 'pointer-events-none opacity-80' : ''}`}
            >
              <input 
                type="file" 
                ref={t2InputRef} 
                className="hidden" 
                accept="image/*"
                onChange={(e) => handleFileUpload(e, setT2Image, setT2FileName, setT2File)}
              />

              {t2Image ? (
                <div className="relative w-full h-full min-h-[220px] group">
                  <img 
                    src={t2Image} 
                    alt="Temporal Image 02" 
                    className="w-full h-full object-cover min-h-[220px]"
                  />
                  {/* Overlay Info */}
                  <div className="absolute inset-0 bg-gradient-to-t from-space-950/90 via-transparent to-transparent opacity-90 p-3 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                      <span className="px-2 py-0.5 text-[10px] font-mono bg-space-900/90 text-cyan-300 border border-cyan-500/30 rounded">
                        T2 LOADED
                      </span>
                      <span className="text-[10px] font-mono text-slate-300 bg-space-900/80 px-2 py-0.5 rounded">
                        0.5m GSD
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                      <span className="truncate max-w-[200px]">{t2FileName}</span>
                      <span className="text-cyan-400 hover:underline flex items-center space-x-1">
                        <RefreshCw className="w-3 h-3" />
                        <span>Change</span>
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-space-850 border border-space-700 flex items-center justify-center mx-auto mb-3 text-cyan-400 group-hover:scale-110 transition">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-medium text-slate-200 mb-1">Upload satellite image</p>
                  <p className="text-xs text-slate-400 font-mono">PNG, JPG, TIFF, GeoTIFF up to 50MB</p>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Action Button & Progress */}
        <div className="flex flex-col items-center">
          <button
            onClick={handleRunAnalysis}
            disabled={isAnalyzing}
            className={`main-action w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg ${
              isAnalyzing
                ? 'bg-space-800 text-slate-500 cursor-not-allowed border border-space-700'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-space-950 shadow-cyan-500/20 hover:shadow-cyan-500/40 active:scale-[0.99]'
            }`}
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-space-950" />
                <span>PROCESSING PIPELINE...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>ANALYZE CHANGES</span>
              </>
            )}
          </button>

          {/* Progress Modal / Status Overlay */}
          {isAnalyzing && (
            <div className="w-full mt-6 p-4 rounded-lg bg-space-950 border border-cyan-500/30 shadow-inner">
              <div className="flex justify-between items-center mb-2 font-mono text-xs">
                <span className="text-cyan-400 flex items-center space-x-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                  </span>
                  <span>STATUS: Analyzing images...</span>
                </span>
              </div>

              <div className="w-full bg-space-800 h-2 rounded-full overflow-hidden p-0.5 border border-space-700">
                <div className="analysis-progress-indeterminate h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-cyan-300 shadow-[0_0_10px_rgba(0,240,255,0.8)]" />
              </div>
            </div>
          )}

        </div>

      </div>
    </section>
  );
}
