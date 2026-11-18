import { VISUAL_MAPPINGS, type VisualMapping } from '../../materials/types';
import { SegmentedControl } from '../../ui/SegmentedControl';

export function VisualMappingControl({
  value,
  onChange,
}: {
  value?: VisualMapping;
  onChange: (mapping: VisualMapping) => void;
}) {
  return (
    <SegmentedControl
      label="Visual mapping"
      options={['Wake', 'Displacement', 'Lines', 'Ripples', 'Warping']}
      value={Math.max(0, VISUAL_MAPPINGS.indexOf(value ?? 'wake'))}
      onChange={(index) => onChange(VISUAL_MAPPINGS[index] ?? 'wake')}
    />
  );
}
