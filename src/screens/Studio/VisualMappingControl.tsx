import type { VisualMapping } from '../../materials/types';
import { movementSettings, movementMapping } from '../../materials/visual/movement';
import { SegmentedControl } from '../../ui/SegmentedControl';

export function VisualMappingControl({
  value,
  onChange,
  existingOnly = false,
}: {
  value?: VisualMapping;
  existingOnly?: boolean;
  onChange: (mapping: VisualMapping) => void;
}) {
  const mode = value === 'signature' ? 0 : value === 'ripples' ? 2 : 1;
  const { sampled, existing } = movementSettings(value);
  return (
    <>
      <SegmentedControl
        label="Visual mapping"
        options={['Signature', 'Movement', 'Ripples']}
        value={mode}
        onChange={(index) =>
          onChange(
            index === 0
              ? 'signature'
              : index === 2
                ? 'ripples'
                : mode === 1
                  ? (value ?? 'wake')
                  : 'displacement',
          )
        }
      />
      {mode === 1 && (
        <>
          <SegmentedControl
            label="Movement coverage"
            options={['Full', 'Sampled']}
            value={sampled ? 1 : 0}
            onChange={(index) => onChange(movementMapping(index === 1, existing))}
            description="Use the full moving area or a few continuous paths through it."
          />
          <SegmentedControl
            label="Material source"
            disabled={existingOnly}
            options={['Existing', 'Generated']}
            value={existing ? 0 : 1}
            onChange={(index) => onChange(movementMapping(sampled, index === 0))}
            description={
              existingOnly
                ? 'Grass is rooted in the scene and supports existing material only.'
                : 'Move material already in the scene, or generate material through movement.'
            }
          />
        </>
      )}
    </>
  );
}
