import { Table, TrendingUp, TrendingDown } from 'lucide-react';
import { MOCK_TRANSITION_MATRIX } from '../data/mockData';

export default function TransitionMatrix({ isAnalyzed, analysisData }) {
  const transitionMatrix = analysisData?.transitionMatrix?.length
    ? analysisData.transitionMatrix
    : MOCK_TRANSITION_MATRIX;

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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {transitionMatrix.map((item) => {
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
                <span className="text-2xl font-extrabold text-white">{item.t1Percent}%</span>
                <span className="text-slate-500">→</span>
                <span className="text-xs text-slate-400">T2</span>
                <span className="text-2xl font-extrabold text-white">{item.t2Percent}%</span>
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-space-800 pt-3">
                {isPositive
                  ? <TrendingUp className="h-4 w-4 text-cyan-400" />
                  : <TrendingDown className="h-4 w-4 text-rose-400" />}
                <span className={`font-mono text-sm font-bold ${isPositive ? 'text-cyan-300' : 'text-rose-300'}`}>
                  {isPositive ? '+' : ''}{item.changePercent} percentage points
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
