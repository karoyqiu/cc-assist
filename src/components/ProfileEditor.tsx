import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ProfileConfig } from '@/types';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { Avatar } from './Avatar';

interface Props {
  profile: ProfileConfig | null;
  official?: boolean;
  activeId: string;
  onSave: (profile: ProfileConfig) => void;
  onDelete: (id: string) => Promise<boolean>;
  onDuplicate: (profile: ProfileConfig) => void;
  onUse: (id: string) => void;
}

interface FieldProps {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  mono?: boolean;
  password?: boolean;
}

function Field({ label, value, onChange, disabled, placeholder, mono, password }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-muted-foreground text-xs uppercase">{label}</Label>
      <Input
        type={password ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={cn('w-full text-sm', mono && 'font-mono')}
      />
    </div>
  );
}

export function ProfileEditor({
  profile,
  official,
  activeId,
  onSave,
  onDelete,
  onDuplicate,
  onUse,
}: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ProfileConfig | null>(null);
  const [saved, setSaved] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteTargetId = useRef<string | null>(null);
  const prevProfileId = useRef<string | null>(null);

  useEffect(() => {
    if (profile?.id !== prevProfileId.current) {
      prevProfileId.current = profile?.id ?? null;
      setDraft(profile ? { ...profile, models: { ...profile.models } } : null);
      setSaved(true);
    }
  }, [profile]);

  if (!profile || !draft) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
        {t('profileEditor.noProfileSelected')}
      </div>
    );
  }

  function updateModel(field: keyof ProfileConfig['models'], value: string) {
    setDraft((d) => {
      if (!d) return d;
      return { ...d, models: { ...d.models, [field]: value || undefined } };
    });
    setSaved(false);
  }

  function update(field: keyof ProfileConfig, value: string) {
    setDraft((d) => {
      if (!d) return d;
      return { ...d, [field]: value };
    });
    setSaved(false);
  }

  async function handleSave() {
    if (!draft) return;
    onSave(draft);
    setSaved(true);
  }

  return (
    <div className="bg-app flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="border-subtle flex items-center gap-3 border-b px-5 py-2">
        <Avatar profile={profile} size={40} />
        <div className="flex-1">
          {official ? (
            <div className="text-primary font-semibold">{draft.name}</div>
          ) : (
            <Input
              value={draft.name}
              onChange={(e) => update('name', e.target.value)}
              className="text-primary w-full border-none bg-transparent font-semibold outline-none"
            />
          )}
        </div>

        {/* Action buttons */}
        {!official && (
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              onClick={() => onDuplicate(draft)}
              className="text-muted-foreground"
            >
              {t('profileEditor.duplicate')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteTargetId.current = draft.id;
                setShowDeleteConfirm(true);
                setDeleteError(null);
              }}
              className=""
            >
              {t('profileEditor.delete')}
            </Button>
          </div>
        )}
      </div>

      {/* Fields */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {/* API Key */}
        <Field
          label={t('profileEditor.apiKey')}
          value={draft.api_key}
          onChange={official ? undefined : (v) => update('api_key', v)}
          disabled={official}
          placeholder="sk-..."
          mono
          password
        />

        {/* Base URL */}
        <Field
          label={t('profileEditor.baseUrl')}
          value={draft.base_url}
          onChange={official ? undefined : (v) => update('base_url', v)}
          disabled={official}
          mono
        />

        {/* Proxy URL */}
        <Field
          label={t('profileEditor.proxyUrl')}
          value={draft.proxy_url ?? ''}
          onChange={(v) => update('proxy_url', v)}
          mono
          placeholder="http://proxy:8080"
        />

        {/* Models */}
        <div>
          <div className="text-muted-foreground mb-2 text-xs font-medium tracking-[0.08em] uppercase">
            {t('profileEditor.models')}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field
              label={t('profileEditor.modelMain')}
              value={draft.models.main ?? ''}
              onChange={official ? undefined : (v) => updateModel('main', v)}
              disabled={official}
              mono
              placeholder="claude-sonnet-4-6"
            />
            <Field
              label={t('profileEditor.modelHaiku')}
              value={draft.models.haiku ?? ''}
              onChange={official ? undefined : (v) => updateModel('haiku', v)}
              disabled={official}
              mono
              placeholder="claude-haiku-4-5"
            />
            <Field
              label={t('profileEditor.modelSonnet')}
              value={draft.models.sonnet ?? ''}
              onChange={official ? undefined : (v) => updateModel('sonnet', v)}
              disabled={official}
              mono
              placeholder="claude-sonnet-4-6"
            />
            <Field
              label={t('profileEditor.modelOpus')}
              value={draft.models.opus ?? ''}
              onChange={official ? undefined : (v) => updateModel('opus', v)}
              disabled={official}
              mono
              placeholder="claude-opus-4-6"
            />
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="border-subtle flex justify-end gap-2 border-t px-5 py-3">
        {/* Use / In Use button */}
        {profile.id === activeId ? (
          <Button variant="secondary" disabled>
            {t('profileEditor.inUse')}
          </Button>
        ) : (
          <Button variant="outline" onClick={() => onUse(profile.id)}>
            {t('profileEditor.useProfile')}
          </Button>
        )}
        <Button variant="outline" onClick={handleSave} disabled={saved}>
          {t('profileEditor.saveChanges')}
        </Button>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setShowDeleteConfirm(false);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent className="border-subtle bg-surface w-95">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-primary font-semibold">
              {t('profileEditor.deleteConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-sm leading-relaxed">
              {t('profileEditor.deleteConfirmMessage', { name: draft.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <div className="text-danger text-xs">{deleteError}</div>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t('profileEditor.deleteConfirmCancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="text-app"
              onClick={async () => {
                const targetId = deleteTargetId.current;
                if (!targetId) return;
                setDeleting(true);
                setDeleteError(null);
                const ok = await onDelete(targetId);
                setDeleting(false);
                if (ok) {
                  setShowDeleteConfirm(false);
                } else {
                  setDeleteError(t('profileEditor.deleteFailed'));
                }
              }}
              disabled={deleting}
            >
              {deleting ? t('profileEditor.deleting') : t('profileEditor.deleteConfirmDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
