/*
 * Dunceious
 *
 * This file is part of Dunceious.
 *
 * Dunceious is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Dunceious is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Dunceious.  If not, see <https://www.gnu.org/licenses/>.
 */

import React from 'react';

export interface MoleculeTypeMismatchModalProps {
  incoming: 'nucleotide' | 'protein';
  loaded: 'nucleotide' | 'protein';
  fileName: string;
  onClose: () => void;
}

const MoleculeTypeMismatchModal: React.FC<MoleculeTypeMismatchModalProps> = ({
  incoming,
  loaded,
  fileName,
  onClose,
}) => {
  const incomingLabel = incoming === 'protein' ? 'peptide' : 'nucleotide';
  const loadedLabel = loaded === 'protein' ? 'peptide' : 'nucleotide';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-rose-500/30">
        {/* Header */}
        <div className="bg-gradient-to-r from-rose-500/10 to-transparent px-8 py-6 border-b border-rose-500/20 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-400 flex-shrink-0">
            <i className="fas fa-triangle-exclamation text-lg"></i>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight text-white">Session Type Mismatch</h2>
            <p className="text-xs text-slate-400 font-medium mt-1">Cannot load incompatible sequence type</p>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-6 space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="text-rose-400 mt-1">
                <i className="fas fa-file text-sm"></i>
              </div>
              <div className="flex-1 text-sm">
                <p className="text-slate-300">
                  <span className="font-semibold text-slate-100">{fileName}</span>
                  <span className="text-slate-400"> is a </span>
                  <span className="font-semibold text-rose-300">{incomingLabel}</span>
                  <span className="text-slate-400"> file</span>
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="text-rose-400 mt-1">
                <i className="fas fa-database text-sm"></i>
              </div>
              <div className="flex-1 text-sm">
                <p className="text-slate-300">
                  <span className="text-slate-400">Workspace contains </span>
                  <span className="font-semibold text-rose-300">{loadedLabel}</span>
                  <span className="text-slate-400"> sequences</span>
                </p>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 rounded-lg px-4 py-3 border border-slate-700/50 text-xs text-slate-300">
            <p className="flex items-start gap-2">
              <i className="fas fa-lightbulb text-amber-400 mt-0.5 flex-shrink-0"></i>
              <span><span className="font-semibold">Solution:</span> Clear all records first to switch sequence types.</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-800/50 px-8 py-4 border-t border-slate-700/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-lg text-sm font-bold uppercase text-white bg-rose-500/20 border border-rose-500/50 hover:bg-rose-500/30 transition-all"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default MoleculeTypeMismatchModal;
