import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { ProfileConfig } from '../types';

import { Avatar } from './Avatar';

interface Props {
  profile: ProfileConfig | null;
  official?: boolean;
  activeId: string;
  onSave: (profile: ProfileConfig) => void;
  onDelete: (id: string) => Promise<boolean>;
  onDuplicate: (profile: ProfileConfig) => void;
  onLaunch: () => void;
  onUse: (id: string) => void;
}

interface FieldProps {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  mono?: boolean;
  password?: boolean;
}

function Field({ label, value, onChange, readOnly, placeholder, mono, password }: FieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label
        style={{
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.08em',
          color: '#737373',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </label>
      <input
        type={password ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        readOnly={readOnly}
        placeholder={placeholder}
        style={{
          height: 30,
          padding: '0 8px',
          fontSize: 13,
          fontFamily: mono ? 'Noto Sans Mono, monospace' : 'Noto Sans, sans-serif',
          color: readOnly ? '#737373' : '#E5E5E5',
          backgroundColor: readOnly ? 'transparent' : '#1A1A1A',
          border: readOnly ? 'none' : '1px solid #2A2A2A',
          borderRadius: 4,
          outline: 'none',
          width: '100%',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

function DeleteConfirmDialog({
  profileName,
  deleting,
  deleteError,
  cancelBtnRef,
  onConfirm,
  onCancel,
}: {
  profileName: string;
  deleting: boolean;
  deleteError: string | null;
  cancelBtnRef: React.RefObject<HTMLButtonElement | null>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    },
    [onCancel],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    cancelBtnRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, cancelBtnRef]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !deleting) onCancel();
      }}
    >
      <div
        style={{
          width: 380,
          backgroundColor: '#1A1A1A',
          border: '1px solid #2A2A2A',
          borderRadius: 6,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: '#E5E5E5' }}>
          {t('profileEditor.deleteConfirmTitle')}
        </div>
        <div style={{ fontSize: 13, color: '#A3A3A3', lineHeight: 1.5 }}>
          {t('profileEditor.deleteConfirmMessage', { name: profileName })}
        </div>
        {deleteError && <div style={{ fontSize: 12, color: '#FF6B6B' }}>{deleteError}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            ref={cancelBtnRef}
            onClick={onCancel}
            disabled={deleting}
            style={{
              height: 30,
              padding: '0 14px',
              fontSize: 13,
              color: '#737373',
              backgroundColor: 'transparent',
              border: '1px solid #2A2A2A',
              borderRadius: 4,
              cursor: deleting ? 'not-allowed' : 'pointer',
              opacity: deleting ? 0.5 : 1,
            }}
          >
            {t('profileEditor.deleteConfirmCancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            style={{
              height: 30,
              padding: '0 14px',
              fontSize: 13,
              fontWeight: 500,
              color: '#0F0F0F',
              backgroundColor: deleting ? '#737373' : '#FF6B6B',
              border: 'none',
              borderRadius: 4,
              cursor: deleting ? 'not-allowed' : 'pointer',
            }}
          >
            {deleting ? t('profileEditor.deleting') : t('profileEditor.deleteConfirmDelete')}
          </button>
        </div>
      </div>
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
  onLaunch,
  onUse,
}: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ProfileConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const deleteTargetId = useRef<string | null>(null);

  useEffect(() => {
    setDraft(profile ? { ...profile, models: { ...profile.models } } : null);
    setSaved(false);
  }, [profile]);

  if (!profile || !draft) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#737373',
          fontSize: 13,
        }}
      >
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
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0F0F0F',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px 12px',
          borderBottom: '1px solid #2A2A2A',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Avatar profile={profile} size={40} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#E5E5E5' }}>{draft.name}</div>
        </div>

        {/* Action buttons */}
        {!official && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => onDuplicate(draft)}
              style={{
                height: 28,
                padding: '0 10px',
                fontSize: 12,
                color: '#737373',
                backgroundColor: 'transparent',
                border: '1px solid #2A2A2A',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {t('profileEditor.duplicate')}
            </button>
            <button
              onClick={() => {
                deleteTargetId.current = draft.id;
                setShowDeleteConfirm(true);
                setDeleteError(null);
              }}
              style={{
                height: 28,
                padding: '0 10px',
                fontSize: 12,
                color: '#FF6B6B',
                backgroundColor: 'transparent',
                border: '1px solid #2A2A2A',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {t('profileEditor.delete')}
            </button>
          </div>
        )}
      </div>

      {/* Fields */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* API Key */}
        <Field
          label={t('profileEditor.apiKey')}
          value={draft.api_key}
          onChange={official ? undefined : (v) => update('api_key', v)}
          readOnly={official}
          placeholder="sk-..."
          mono
          password
        />

        {/* Base URL */}
        <Field
          label={t('profileEditor.baseUrl')}
          value={draft.base_url}
          onChange={official ? undefined : (v) => update('base_url', v)}
          readOnly={official}
          mono
        />

        {/* Models */}
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '0.08em',
              color: '#737373',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            {t('profileEditor.models')}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
            }}
          >
            <Field
              label={t('profileEditor.modelMain')}
              value={draft.models.main ?? ''}
              onChange={official ? undefined : (v) => updateModel('main', v)}
              readOnly={official}
              mono
              placeholder="claude-3-5-sonnet"
            />
            <Field
              label={t('profileEditor.modelHaiku')}
              value={draft.models.haiku ?? ''}
              onChange={official ? undefined : (v) => updateModel('haiku', v)}
              readOnly={official}
              mono
              placeholder="claude-3-haiku"
            />
            <Field
              label={t('profileEditor.modelSonnet')}
              value={draft.models.sonnet ?? ''}
              onChange={official ? undefined : (v) => updateModel('sonnet', v)}
              readOnly={official}
              mono
              placeholder="claude-3-5-sonnet"
            />
            <Field
              label={t('profileEditor.modelOpus')}
              value={draft.models.opus ?? ''}
              onChange={official ? undefined : (v) => updateModel('opus', v)}
              readOnly={official}
              mono
              placeholder="claude-3-opus"
            />
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div
        style={{
          padding: '12px 20px',
          borderTop: '1px solid #2A2A2A',
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
        }}
      >
        <button
          onClick={onLaunch}
          style={{
            height: 30,
            padding: '0 14px',
            fontSize: 13,
            fontWeight: 500,
            color: '#0F0F0F',
            backgroundColor: profile.icon_color,
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          {t('profileEditor.launchClaude')}
        </button>
        {/* Use / In Use button */}
        {profile.id === activeId ? (
          <button
            disabled
            style={{
              height: 30,
              padding: '0 14px',
              fontSize: 13,
              fontWeight: 500,
              color: '#737373',
              backgroundColor: '#1A1A1A',
              border: '1px solid #2A2A2A',
              borderRadius: 4,
              cursor: 'default',
            }}
          >
            {t('profileEditor.inUse')}
          </button>
        ) : (
          <button
            onClick={() => onUse(profile.id)}
            style={{
              height: 30,
              padding: '0 14px',
              fontSize: 13,
              fontWeight: 500,
              color: '#E5E5E5',
              backgroundColor: '#1A1A1A',
              border: '1px solid #2A2A2A',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            {t('profileEditor.useProfile')}
          </button>
        )}
        {!official && (
          <button
            onClick={handleSave}
            style={{
              height: 30,
              padding: '0 14px',
              fontSize: 13,
              fontWeight: 500,
              color: saved ? '#737373' : '#E5E5E5',
              backgroundColor: '#1A1A1A',
              border: '1px solid #2A2A2A',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            {saved ? '✓' : t('profileEditor.saveChanges')}
          </button>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <DeleteConfirmDialog
          profileName={draft.name}
          deleting={deleting}
          deleteError={deleteError}
          cancelBtnRef={cancelBtnRef}
          onConfirm={async () => {
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
          onCancel={() => {
            if (!deleting) {
              setShowDeleteConfirm(false);
              setDeleteError(null);
            }
          }}
        />
      )}
    </div>
  );
}
