import { useEffect, useState, type FC } from 'react';

import type { ProfileConfig, RecentDirectories } from '../../types';

import { DirectoryCombobox } from '../DirectoryCombobox';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface SessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'new' | 'resume';
  sdkSessionId?: string;
  initialProfileId: string;
  initialDirectory: string;
  profiles: ProfileConfig[];
  recentDirectories: RecentDirectories;
  onConfirm: (profileId: string, directory: string, sdkSessionId?: string) => Promise<void>;
}

export const SessionDialog: FC<SessionDialogProps> = ({
  open,
  onOpenChange,
  mode,
  sdkSessionId,
  initialProfileId,
  initialDirectory,
  profiles,
  recentDirectories,
  onConfirm,
}) => {
  const [profileId, setProfileId] = useState(initialProfileId);
  const [directory, setDirectory] = useState(initialDirectory);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setProfileId(initialProfileId);
      setDirectory(initialDirectory);
    }
  }, [open, initialProfileId, initialDirectory]);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm(profileId, directory, mode === 'resume' ? sdkSessionId : undefined);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'resume' ? 'Resume Session' : 'New Session'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs">Profile</label>
            <Select
              value={profileId}
              onValueChange={(v) => {
                if (v) setProfileId(v);
              }}
            >
              <SelectTrigger data-testid="session-dialog-profile" className="w-full">
                <SelectValue placeholder="Select profile">
                  {profiles.find((p) => p.id === profileId)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs">Directory</label>
            <DirectoryCombobox
              directories={recentDirectories}
              value={directory}
              onChange={setDirectory}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            data-testid="session-dialog-cancel"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button data-testid="session-dialog-confirm" onClick={handleConfirm} disabled={loading}>
            {mode === 'resume' ? 'Resume' : 'Start'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
