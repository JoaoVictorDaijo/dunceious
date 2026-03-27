import React from 'react';

/**
 * Footer status bar shown at the bottom of the app.
 */
const StatusBar: React.FC = () => (
  <div className="bg-slate-950 border-t border-slate-800 px-6 py-2 flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-slate-600">
    <div className="flex gap-4">
      <span>Dunceious v3.4</span>
      <span className="text-slate-800">|</span>
      <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noreferrer" className="hover:text-sky-500 transition-colors">
        <i className="fab fa-creative-commons mr-1"></i> CC BY-NC 4.0 (Non-Commercial)
      </a>
    </div>
    <div className="flex gap-4">
      <span>Built for Science</span>
      <span className="text-slate-800">|</span>
      <span>© 2026</span>
    </div>
  </div>
);

export default StatusBar;
