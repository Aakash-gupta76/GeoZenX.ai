import React, { useState } from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import ImageAnalysis from './components/ImageAnalysis';
import TransitionMatrix from './components/TransitionMatrix';
import ChangeQueryChat from './components/ChangeQueryChat';
import { Globe, Shield } from 'lucide-react';

export default function App() {
  const [isAnalyzed, setIsAnalyzed] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);
  const [analysisImages, setAnalysisImages] = useState(null);

  const handleAnalysisComplete = (result, images) => {
    setAnalysisData(result);
    setAnalysisImages(images);
    setIsAnalyzed(true);
  };

  return (
    <div id="top" className="app-shell min-h-screen flex flex-col justify-between font-sans text-slate-100">
      
      <div>
        {/* Top Header */}
        <Header />

        {/* Main Hero */}
        <Hero />

        {/* Main Workspace Container */}
        <main className="space-y-1 pb-16">
          {/* Section 1: Image Change Analysis */}
          <ImageAnalysis 
            onAnalysisComplete={handleAnalysisComplete}
            isAnalyzing={isAnalyzing}
            setIsAnalyzing={setIsAnalyzing}
          />

          {/* Section 2: Transition Matrix & Pseudo-Change Filter */}
          <TransitionMatrix 
            isAnalyzed={isAnalyzed}
            analysisData={analysisData}
            analysisImages={analysisImages}
          />

          {/* Section 3: Change Intelligence Natural Language Chat */}
          <ChangeQueryChat analysisData={analysisData} />
        </main>
      </div>

      {/* Footer */}
      <footer className="site-footer border-t py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <Globe className="w-4 h-4 text-cyan-500" />
            <span>GeoZenX.ai Remote Sensing Platform • Deep-Tech Change Intelligence</span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1">
              <Shield className="w-3.5 h-3.5 text-slate-400" />
              <span>TEST PLATFORM</span>
            </span>
            <span>COORDS: 24.7136° N, 46.6753° E</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
