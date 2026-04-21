import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { DirectoryCombobox } from '../components/DirectoryCombobox';
import { Button } from '../components/ui/button';
import type { ProfilesStore } from '@/types';

interface NewSessionDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (sessionId: string) => void;
}

export function NewSessionDialog({ open, onClose, onCreated }: NewSessionDialogProps) {
  const { t } = useTranslation();
  const [profileId, setProfileId] = useState('');
  const [directory, setDirectory] = useState('');
  const [profiles, setProfiles] = useState<ProfilesStore['profiles']>([]);
  const [recentDirs, setRecentDirs] = useState<ProfilesStore['recent_directories']>([]);

  // Load profiles and recent directories on mount
  useEffect(() => {
    invoke<ProfilesStore>('get_config').then((store) => {
      setProfiles(store.profiles);
      setRecentDirs(store.recent_directories);
    }).catch(console.error);
  }, []);

  async function handleCreate() {
    if (!profileId || !directory) return;
    try {
      const result = await invoke<{ session_id: string }>('chat_create_session', {
        profileId,
        directory,
      });
      onCreated(result.session_id);
    } catch (e) {
      console.error('Failed to create session:', e);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('chat.newSession.title', 'New Session')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs">Profile</label>
            <Select value={profileId} onValueChange={(v) => setProfileId(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select profile" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs">Directory</label>
            <DirectoryCombobox
              directories={recentDirs}
              value={directory}
              onChange={setDirectory}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!profileId || !directory}>Start</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
