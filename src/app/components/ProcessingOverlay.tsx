import React from 'react';

interface ProcessingOverlayProps {
  isProcessing: boolean;
}

/**
 * Full-screen loading overlay shown while genomic data is being processed.
 */
const ProcessingOverlay: React.FC<ProcessingOverlayProps> = ({ isProcessing }) => {
  if (!isProcessing) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[200] flex flex-col items-center justify-center animate-in fade-in duration-300">
      <div className="relative">
        <div className="w-24 h-24 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin"></div>
        <i className="fas fa-helix absolute inset-0 flex items-center justify-center text-sky-500 text-2xl animate-pulse"></i>
      </div>
      <p className="mt-6 text-sm font-black uppercase tracking-[0.3em] text-sky-400 animate-pulse">Processing Genomic Data...</p>
      <p className="mt-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Dunceious is thinking hard</p>
    </div>
  );
};

export default ProcessingOverlay;
