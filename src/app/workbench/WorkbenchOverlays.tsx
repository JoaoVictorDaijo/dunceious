/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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
import RecordDetailsModal from '@/src/app/components/RecordDetailsModal';
import FeatureEditorModal from '@/src/app/components/FeatureEditorModal';
import MoleculeTypeMismatchModal from '@/src/app/components/MoleculeTypeMismatchModal';
import GapRemovalNotice from '@/src/app/components/GapRemovalNotice';
import ProcessingOverlay from '@/src/app/components/ProcessingOverlay';
import AlignRemoteModal from '@/src/app/components/AlignRemoteModal';
import AlignmentJobPill from '@/src/app/components/AlignmentJobPill';
import type { Workbench } from './useWorkbench';

/** The details panel and the feature editor. */
function EditingDialogs({ w }: { w: Workbench }) {
  const { details, features, bio, view } = w;
  const { viewingRecordDetails, viewingFeatureDetails, viewingFeatureIndex } = details;
  const basesEditable = viewingFeatureDetails && viewingFeatureIndex >= 0;
  const editing = features.editing;
  return (
    <>
      {viewingRecordDetails && (
        <RecordDetailsModal
          record={viewingRecordDetails}
          feature={viewingFeatureDetails}
          onClose={details.closeDetails}
          onFocusFeature={w.nav.focusOn}
          onExportRecord={w.files.handleExportRecord}
          onCopyLog={w.addLog}
          onSetShowBases={basesEditable ? details.handleSetShowBases : undefined}
          onSetBasesMode={basesEditable ? details.handleSetShowBases : undefined}
          onRemoveSearchDetails={details.removeSearchDetails}
        />
      )}
      {editing && (
        <FeatureEditorModal
          key={editing.featureIndex === -1 ? 'new' : `${editing.recordId}:${editing.featureIndex}`}
          editing={editing}
          records={bio.records}
          featureColors={view.featureColors}
          onChange={features.setEditing}
          onSave={features.saveEditedFeature}
          onDiscard={() => features.setEditing(null)}
        />
      )}
    </>
  );
}

/** Import notices and the remote alignment dialog or its minimized pill. */
function NoticeDialogs({ w }: { w: Workbench }) {
  const { files, bio, remoteAlignment: remote } = w;
  const mismatch = files.sessionMismatch;
  return (
    <>
      {mismatch && (
        <MoleculeTypeMismatchModal
          incoming={mismatch.incoming}
          loaded={mismatch.loaded}
          fileName={mismatch.fileName}
          onClose={() => { files.closeMismatchModal(); bio.dismissSessionTypeNotice(); }}
        />
      )}
      {bio.gapNotices.length > 0 && <GapRemovalNotice notices={bio.gapNotices} onClose={bio.dismissGapNotices} />}
      {remote.presentation === 'dialog' && (
        <AlignRemoteModal
          state={remote.state}
          count={bio.records.length}
          bytes={remote.bytes}
          moleculeKind={remote.moleculeKind}
          hasAlignment={bio.records.some(record => !!record.alignedSequence)}
          engineId={remote.engineId}
          email={remote.email}
          verifiedEmail={remote.verifiedEmail}
          verdicts={remote.verdicts}
          onMinimize={remote.minimize}
          onEngineChange={remote.setEngineId}
          onEmailChange={remote.setEmail}
          onSubmit={() => { void remote.submit(); }}
          onCancel={remote.cancel}
          onRetry={remote.retry}
        />
      )}
      {remote.presentation === 'pill' && <AlignmentJobPill state={remote.state} onOpen={remote.open} />}
    </>
  );
}

/** Everything the workbench shows above its layout, in stacking order. */
export function WorkbenchOverlays({ w }: { w: Workbench }) {
  return (
    <>
      <ProcessingOverlay isProcessing={w.bio.isProcessing && !w.remoteAlignment.isAlignmentLocked} />
      <EditingDialogs w={w} />
      <NoticeDialogs w={w} />
    </>
  );
}
