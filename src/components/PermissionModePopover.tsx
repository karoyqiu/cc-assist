const MODE_LABELS: Record<string, string> = {
  default: 'Default mode',
  accept_edits: 'Auto-accept edits enabled',
  plan: 'Plan mode enabled',
};

interface PermissionModePopoverProps {
  mode: string;
}

export function PermissionModePopover({ mode }: PermissionModePopoverProps) {
  return (
    <div className="pointer-events-none fixed bottom-20 left-1/2 z-50 -translate-x-1/2">
      <div className="bg-surface border rounded px-3 py-2 text-sm shadow">
        {MODE_LABELS[mode] ?? mode}
      </div>
    </div>
  );
}
