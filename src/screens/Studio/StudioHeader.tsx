import { useMemo, useState } from 'react';
import { useStudioStore } from '../../state/studioStore';
import { navigate } from '../../app/router';
import { compositionsDiffer } from '../../studio/edits';
import { ActionMenu } from '../../ui/ActionMenu';
import { Button } from '../../ui/Button';
import { InlineRename } from '../../ui/InlineRename';
import styles from './Studio.module.css';

/** Studio workspace toolbar: composition identity, save state and composition actions. */
export function StudioHeader() {
  const composition = useStudioStore((s) => s.composition);
  const baseline = useStudioStore((s) => s.baseline);
  const signature = useStudioStore((s) => s.signature);
  const isNew = useStudioStore((s) => s.isNew);
  const saving = useStudioStore((s) => s.saving);
  const canUndo = useStudioStore((s) => s.canUndo);
  const canRedo = useStudioStore((s) => s.canRedo);
  const [renaming, setRenaming] = useState(false);
  const changed = useMemo(
    () => (composition && baseline ? compositionsDiffer(composition, baseline) : false),
    [composition, baseline],
  );
  if (!composition || !signature) return null;
  const store = useStudioStore.getState;
  const saveState = saving
    ? 'Saving…'
    : isNew
      ? 'Not saved yet'
      : changed
        ? 'Unsaved changes'
        : 'Saved';

  return (
    <header className={styles.header}>
      <div className={styles.compositionIdentity}>
        <span>Composition</span>
        {renaming ? (
          <InlineRename
            value={composition.name}
            label={`New name for ${composition.name}`}
            className={styles.renameField}
            onCommit={(name) => {
              store().rename(name);
              setRenaming(false);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <button
            type="button"
            className={styles.nameButton}
            onClick={() => setRenaming(true)}
            title="Rename composition"
            aria-label={`${composition.name}. Rename`}
          >
            {composition.name}
          </button>
        )}
      </div>
      <p className={styles.saveState} role="status" data-testid="save-state">
        <i aria-hidden="true" />
        {saveState}
      </p>
      <div className={styles.historyActions} role="group" aria-label="Edit history">
        <button
          type="button"
          onClick={() => store().undo()}
          disabled={!canUndo}
          title="Undo (Command or Ctrl+Z)"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => store().redo()}
          disabled={!canRedo}
          title="Redo (Shift+Command or Ctrl+Z)"
        >
          Redo
        </button>
      </div>
      <div className={styles.headerActions}>
        <Button
          variant="primary"
          className={styles.headerSave}
          onClick={() => void store().save()}
          disabled={saving}
          title="Save (S)"
        >
          Save
        </Button>
        <Button
          onClick={() => store().setRenderOpen(true)}
          title="Render MP4 (R)"
        >
          Export
        </Button>
        <Button
          onClick={() => store().setPresentation(true)}
          title="Show only the wake, full screen (F). Esc comes back."
        >
          Present
        </Button>
        <ActionMenu
          label="More composition actions"
          items={[
            ...(composition.performance.generatedVideoAssetId
              ? [
                  {
                    label: 'Play captured performance',
                    onSelect: () =>
                      navigate(
                        `/performance/asset/${encodeURIComponent(composition.performance.generatedVideoAssetId as string)}`,
                      ),
                  },
                ]
              : []),
            ...(composition.performance.sourceVideoAssetId
              ? [
                  {
                    label: 'View immutable camera reference',
                    onSelect: () =>
                      navigate(
                        `/performance/asset/${encodeURIComponent(composition.performance.sourceVideoAssetId as string)}`,
                      ),
                  },
                ]
              : []),
            {
              label: 'Save as new',
              onSelect: () => void store().saveAsNew(),
              disabled: saving || isNew,
            },
          ]}
        />
      </div>
    </header>
  );
}
