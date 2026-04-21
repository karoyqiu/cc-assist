const permissionColors: Record<string, string> = {
  default: 'bg-gray-500/20 text-gray-400',
  accept_edits: 'bg-green-500/20 text-green-400',
  plan: 'bg-blue-500/20 text-blue-400',
};

const permissionLabels: Record<string, string> = {
  default: 'Default',
  accept_edits: 'Auto',
  plan: 'Plan',
};

interface PermissionBadgeProps {
  mode: string;
}

export function PermissionBadge({ mode }: PermissionBadgeProps) {
  const colorClass = permissionColors[mode] ?? permissionColors.default;
  const label = permissionLabels[mode] ?? 'Default';

  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${colorClass}`}>
      {label}
    </span>
  );
}