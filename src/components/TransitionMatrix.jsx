import { useMemo, useRef, useState } from 'react';
import { Table, TrendingUp, TrendingDown, BarChart3, AlertTriangle, Gauge, ArrowLeft, FileDown } from 'lucide-react';
import { MOCK_TRANSITION_MATRIX } from '../data/mockData';

const safeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeCategoryData = (analysisData) => {
  const source = analysisData?.transitionMatrix?.length
    ? analysisData.transitionMatrix
    : analysisData?.landCover?.classes?.length
      ? analysisData.landCover.classes
      : MOCK_TRANSITION_MATRIX;

  return source
    .map((item) => ({
      category: item?.category || 'UNKNOWN',
      color: item?.color || '#8be0c1',
      t1Percent: safeNumber(item?.t1Percent ?? item?.t1 ?? 0),
      t2Percent: safeNumber(item?.t2Percent ?? item?.t2 ?? 0),
      changePercent: safeNumber(item?.changePercent ?? item?.delta ?? 0),
      description: item?.description || ''
    }))
    .filter((item) => item.category && Number.isFinite(item.t1Percent) && Number.isFinite(item.t2Percent));
};

function DonutChart({ title, items, tone = 'teal' }) {
  if (!items.length) {
    return (
      <div className="workspace-card p-5">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">{title}</h3>
        <div className="mt-5 rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-center text-xs text-slate-500">
          No valid category data available for this chart.
        </div>
      </div>
    );
  }

  const total = items.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="workspace-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">{title}</h3>
        <span className="font-mono text-xs text-slate-400">{total.toFixed(1)}%</span>
      </div>

      <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-center lg:justify-between">
        <svg viewBox="0 0 120 120" className="h-28 w-28 shrink-0">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(148, 163, 184, 0.18)" strokeWidth="14" />
          {items.map((item) => {
            const segmentLength = total > 0 ? (item.value / total) * circumference : 0;
            const circle = (
              <circle
                key={`${item.label}-${item.value}`}
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke={item.color}
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 60 60)"
              />
            );
            offset += segmentLength;
            return circle;
          })}
        </svg>

        <div className="w-full space-y-2">
          {items.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span>{item.label}</span>
              </div>
              <span className="font-mono text-slate-200">{item.value.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ComparisonChart({ items }) {
  if (!items.length) {
    return (
      <div className="workspace-card p-5">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">T1 vs T2</h3>
        <div className="mt-5 rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-center text-xs text-slate-500">
          Chart data is unavailable.
        </div>
      </div>
    );
  }

  const maxValue = Math.max(...items.flatMap((item) => [item.t1Percent, item.t2Percent]), 100);

  return (
    <div className="workspace-card p-5">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">T1 vs T2</h3>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={`${item.category}-comparison`}>
            <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
              <span>{item.category}</span>
              <span className="font-mono text-slate-200">{item.t1Percent.toFixed(1)}% → {item.t2Percent.toFixed(1)}%</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-cyan-400" style={{ width: `${(item.t1Percent / maxValue) * 100}%` }} />
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${(item.t2Percent / maxValue) * 100}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TransitionMatrix({ isAnalyzed, analysisData, analysisImages, isAnalyzing }) {
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportMessage, setReportMessage] = useState(null);
  const reportInProgress = useRef(false);
  const categories = useMemo(() => normalizeCategoryData(analysisData), [analysisData]);

  const quality = analysisData?.imageQuality || analysisData?.raw?.imageQuality || {};
  const reliability = analysisData?.analysisReliability || analysisData?.raw?.analysisReliability || {};
  const predictionUncertainty = analysisData?.predictionUncertainty || analysisData?.raw?.predictionUncertainty || {};
  const changeMask = analysisData?.raw?.changeMask || analysisData?.changeMask || {};
  const changedPercent = safeNumber(changeMask?.changedPixelPercent ?? analysisData?.summary?.netClassShiftPercent ?? analysisData?.raw?.summary?.netClassShiftPercent, 0);
  const unchangedPercent = 100 - changedPercent;

  const t1Items = categories.map((item) => ({
    label: item.category,
    color: item.color,
    value: item.t1Percent
  }));
  const t2Items = categories.map((item) => ({
    label: item.category,
    color: item.color,
    value: item.t2Percent
  }));
  const reliabilityFactors = reliability?.factors?.length ? reliability.factors : ['No specific reliability warnings were detected.'];
  const reliabilityRecommendations = reliability?.recommendations?.length ? reliability.recommendations : ['Review the image pair before making a final interpretation.'];
  const reliabilityStatusCopy = {
    high: 'Image quality checks passed. No material issues were detected in the comparison.',
    moderate: 'Image quality is usable, but some differences may affect local interpretation.',
    low: 'Image quality issues or alignment concerns may reduce confidence in the change mask.',
    insufficient_data: 'Reliability cannot be fully assessed from the available data alone.'
  }[reliability?.status || 'moderate'];
  const reportAvailable = Boolean(isAnalyzed && analysisData && analysisImages && !isAnalyzing);

  const handleDownloadReport = async () => {
    if (!reportAvailable || reportInProgress.current) return;

    reportInProgress.current = true;
    setIsGeneratingReport(true);
    setReportMessage(null);
    try {
      const { generateAnalysisReport } = await import('../utils/analysisReport');
      const result = await generateAnalysisReport({ analysis: analysisData, images: analysisImages });
      setReportMessage({
        type: 'success',
        text: result.imageWarnings
          ? 'Report downloaded. One or more image or mask visuals could not be embedded.'
          : 'PDF report downloaded successfully.'
      });
    } catch (error) {
      setReportMessage({
        type: 'error',
        text: `Could not generate the PDF report: ${error.message}`
      });
    } finally {
      reportInProgress.current = false;
      setIsGeneratingReport(false);
    }
  };

  if (!isAnalyzed) {
    return (
      <section id="results" className="max-w-6xl mx-auto px-4 py-4">
        <div className="workspace-card p-8 text-center text-slate-500 text-sm">
          <Table className="w-8 h-8 mx-auto mb-2 text-slate-600 opacity-60" />
          <p>TRANSITION MATRIX AWAITING SATELLITE IMAGE ANALYSIS</p>
          <p className="text-xs text-slate-600 mt-1">Upload T1 and T2 images and click "ANALYZE CHANGES" to generate land cover transition metrics.</p>
        </div>
      </section>
    );
  }

  return (
    <section id="results" className="max-w-6xl mx-auto px-4 py-6 animate-fadeIn">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-slate-300">
          <BarChart3 className="h-4 w-4 text-cyan-400" />
          <span className="text-sm font-semibold uppercase tracking-[0.18em]">Analysis results</span>
        </div>
        <button
          type="button"
          onClick={() => setShowAnalytics((value) => !value)}
          className="inline-flex items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200 transition hover:border-cyan-400/40 hover:bg-cyan-500/15"
        >
          {showAnalytics ? <><ArrowLeft className="mr-2 h-3.5 w-3.5" /> Return to results</> : 'View Analytics'}
        </button>
      </div>

      {!showAnalytics ? (
        <>
          <div className="mb-5 grid gap-4 lg:grid-cols-[1.6fr_0.9fr]">
            <div className="workspace-card p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                <Gauge className="h-4 w-4 text-cyan-400" />
                Reliability & image quality
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Status</div>
                  <div className="mt-2 text-xl font-extrabold text-white uppercase">{reliability?.status || 'moderate'}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Score</div>
                  <div className="mt-2 text-xl font-extrabold text-white">{reliability?.score ?? 80}/100</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Uncertainty</div>
                  <div className="mt-2 text-xl font-extrabold text-white">{predictionUncertainty?.uncertain_pixel_percentage ?? 0}%</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Alignment</div>
                  <div className="mt-2 text-xl font-extrabold text-white">{quality?.alignment?.status || 'Unknown'}</div>
                </div>
              </div>

              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <div>
                  <span className="text-slate-400">State:</span> {reliabilityStatusCopy}
                </div>
                <div>
                  <span className="text-slate-400">Quality note:</span> {quality?.alignment?.explanation || 'No alignment warning provided.'}
                </div>
                <div>
                  <span className="text-slate-400">Assessment:</span> {reliability?.limitations?.[0] || 'Reliability is heuristic and not calibrated model accuracy.'}
                </div>
              </div>
            </div>

            <div className="workspace-card p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                Factors & recommendations
              </div>
              <ul className="space-y-2 text-sm text-slate-300">
                {reliabilityFactors.slice(0, 4).map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-cyan-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 border-t border-slate-800 pt-3 text-xs text-slate-400">
                {reliabilityRecommendations[0]}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((item) => {
              const isPositive = item.changePercent > 0;
              return (
                <div key={item.category} className="workspace-card p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-bold uppercase tracking-wider text-slate-200">
                      {item.category}
                    </span>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  </div>
                  <div className="flex items-baseline gap-3 font-mono">
                    <span className="text-xs text-slate-400">T1</span>
                    <span className="text-2xl font-extrabold text-white">{item.t1Percent.toFixed(1)}%</span>
                    <span className="text-slate-500">→</span>
                    <span className="text-xs text-slate-400">T2</span>
                    <span className="text-2xl font-extrabold text-white">{item.t2Percent.toFixed(1)}%</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2 border-t border-space-800 pt-3">
                    {isPositive
                      ? <TrendingUp className="h-4 w-4 text-cyan-400" />
                      : <TrendingDown className="h-4 w-4 text-rose-400" />}
                    <span className={`font-mono text-sm font-bold ${isPositive ? 'text-cyan-300' : 'text-rose-300'}`}>
                      {isPositive ? '+' : ''}{item.changePercent.toFixed(1)} percentage points
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <DonutChart title="T1 composition" items={t1Items} />
            <DonutChart title="T2 composition" items={t2Items} />
            <div className="workspace-card p-5">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">Binary change summary</h3>
              <div className="space-y-4">
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                    <span>Changed</span>
                    <span className="font-mono text-cyan-300">{changedPercent.toFixed(1)}%</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.min(changedPercent, 100)}%` }} />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                    <span>Unchanged</span>
                    <span className="font-mono text-emerald-300">{unchangedPercent.toFixed(1)}%</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(unchangedPercent, 100)}%` }} />
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-3 text-xs leading-6 text-slate-300">
                  <span className="text-slate-400">Threshold:</span> 0.5 decision boundary for binary change detection. Proportion near the boundary indicates higher uncertainty.
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ComparisonChart items={categories} />
            <div className="workspace-card p-5">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">Land-cover transition</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs text-slate-300">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-2 pr-3 font-medium">Category</th>
                      <th className="pb-2 pr-3 font-medium">T1</th>
                      <th className="pb-2 pr-3 font-medium">T2</th>
                      <th className="pb-2 font-medium">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((item) => (
                      <tr key={`${item.category}-table`} className="border-b border-slate-800/80">
                        <td className="py-2 pr-3 font-medium text-slate-100">{item.category}</td>
                        <td className="py-2 pr-3 font-mono text-slate-200">{item.t1Percent.toFixed(1)}%</td>
                        <td className="py-2 pr-3 font-mono text-slate-200">{item.t2Percent.toFixed(1)}%</td>
                        <td className={`py-2 font-mono ${item.changePercent >= 0 ? 'text-cyan-300' : 'text-rose-300'}`}>
                          {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={handleDownloadReport}
          disabled={!reportAvailable || isGeneratingReport}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#8be0c1]/35 bg-[#8be0c1]/10 px-5 py-3 text-sm font-bold text-[#a5f3d0] transition hover:border-[#8be0c1]/60 hover:bg-[#8be0c1]/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8be0c1] disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800/50 disabled:text-slate-500"
        >
          <FileDown className="h-4 w-4" />
          {isGeneratingReport ? 'Generating PDF...' : 'Download PDF Report'}
        </button>
        {reportMessage && (
          <p
            role={reportMessage.type === 'error' ? 'alert' : 'status'}
            className={`text-center text-xs ${reportMessage.type === 'error' ? 'text-rose-300' : 'text-emerald-300'}`}
          >
            {reportMessage.text}
          </p>
        )}
      </div>
    </section>
  );
}
