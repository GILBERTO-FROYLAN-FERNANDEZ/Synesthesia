import { useEffect, useRef, useState } from 'react';
import { useStudioStore } from '../../state/studioStore';
import { RenderDialog } from './render/RenderDialog';
import styles from './Studio.module.css';
import { StudioHeader } from './StudioHeader';
import { StudioNotices } from './StudioNotices';
import { StudioPanel } from './StudioPanel';
import { StudioStage } from './StudioStage';
import { StudioTransport } from './StudioTransport';
import { hasVisitClip, MovementSourcePanel, useStoredSourceBlob, type StudioView } from './StudioSource';
import { usePresentationMode } from './usePresentationMode';
import { useStudioKeyboard } from './useStudioKeyboard';

/**
 * The Studio's layout (SPEC 13.3): a header with the breadcrumb and Save / Render; the
 * wake, which dominates; the controls on the right; the transport along the bottom. In
 * presentation mode only the wake remains.
 */
export function StudioWorkspace() {
  const presentation = useStudioStore((s) => s.presentation);
  const renderOpen = useStudioStore((s) => s.renderOpen);
  const composition = useStudioStore((s) => s.composition);
  const signature = useStudioStore((s) => s.signature);
  const stageRef = useRef<HTMLDivElement>(null);
  const [sourceCollapsed, setSourceCollapsed] = useState(false);
  const [view, setView] = useState<StudioView>('result');
  const sourceBlob = useStoredSourceBlob(composition?.performance.sourceVideoAssetId);
  const clipAvailable = hasVisitClip(signature) || sourceBlob !== null;
  useStudioKeyboard();
  usePresentationMode(stageRef);

  useEffect(() => {
    if (!clipAvailable && view !== 'result') setView('result');
  }, [clipAvailable, view]);

  useEffect(() => {
    if (presentation && view !== 'result') setView('result');
  }, [presentation, view]);

  return (
    <div className={`${styles.studio} ${presentation ? styles.presenting : ''}`}>
      <div className={`${styles.grid} ${sourceCollapsed ? styles.sourceIsCollapsed : ''}`}>
        {presentation ? null : <StudioHeader />}
        {presentation ? null : (
          <MovementSourcePanel
            collapsed={sourceCollapsed}
            onCollapse={() => setSourceCollapsed((value) => !value)}
            sourceBlob={sourceBlob}
          />
        )}
        <StudioStage
          ref={stageRef}
          view={view}
          onViewChange={setView}
          clipAvailable={clipAvailable}
          sourceBlob={sourceBlob}
        />
        {presentation ? null : <StudioNotices />}
        {presentation ? null : <StudioPanel />}
        {presentation ? null : <StudioTransport />}
      </div>
      {renderOpen && composition && signature ? (
        <RenderDialog
          composition={composition}
          signature={signature}
          onClose={(fileName) => useStudioStore.getState().renderClosed(fileName)}
        />
      ) : null}
    </div>
  );
}
