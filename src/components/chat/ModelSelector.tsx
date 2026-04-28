import { type FC } from 'react';

export interface ModelOption {
  key: string;
  label: string;
}

interface ModelSelectorProps {
  options: ModelOption[];
  value: string;
  onChange: (key: string) => void;
}

export const ModelSelector: FC<ModelSelectorProps> = ({ options, value, onChange }) => {
  return (
    <select
      data-testid="model-selector"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-foreground hover:bg-muted flex h-8 cursor-pointer appearance-none items-center gap-1 rounded-md bg-transparent px-2 pr-6 text-sm transition focus:outline-none active:scale-[0.985]"
      aria-label="Select model"
      style={{ backgroundImage: 'none' }}
    >
      {options.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  );
};
