import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProfileConfig } from '../types';

interface Props {
  profile: ProfileConfig | null;
  onSave: (profile: ProfileConfig) => void;
  onDelete: (id: string) => void;
  onDuplicate: (profile: ProfileConfig) => void;
  onLaunch: () => void;
}

function Avatar({ profile, size = 40 }: { profile: ProfileConfig; size?: number }) {
  const initial = profile.name.charAt(0).toUpperCase();
  const sizePx = `${size}px`;
  return (
    <div
      style={{
        width: sizePx,
        height: sizePx,
        borderRadius: '50%',
        backgroundColor: profile.icon_color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: `${size * 0.4}px`,
        fontWeight: 600,
        color: '#0F0F0F',
        flexShrink: 0,
        fontFamily: 'Noto Sans, sans-serif',
      }}
    >
      {initial}
    </div>
  );
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
          border: '1px solid #2A2A2A',
          borderRadius: 4,
          outline: 'none',
          width: '100%',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

export function ProfileEditor({ profile, onSave, onDelete, onDuplicate, onLaunch }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ProfileConfig | null>(null);
  const [saved, setSaved] = useState(false);

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

  const isBuiltIn = profile.is_built_in;

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
          <div style={{ fontSize: 15, fontWeight: 600, color: '#E5E5E5' }}>
            {draft.name}
          </div>
          {isBuiltIn && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: '0.06em',
                color: '#737373',
                textTransform: 'uppercase',
                backgroundColor: '#1A1A1A',
                padding: '1px 6px',
                borderRadius: 3,
                marginTop: 2,
                display: 'inline-block',
              }}
            >
              {t('profileEditor.builtIn')}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 6 }}>
          {!isBuiltIn && (
            <>
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
                onClick={() => onDelete(draft.id)}
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
            </>
          )}
        </div>
      </div>

      {/* Fields */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* API Key */}
        <Field
          label={t('profileEditor.apiKey')}
          value={draft.api_key}
          onChange={(v) => update('api_key', v)}
          placeholder="sk-..."
          mono
          password
        />

        {/* Base URL */}
        <Field
          label={t('profileEditor.baseUrl')}
          value={draft.base_url}
          readOnly={isBuiltIn}
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
              onChange={(v) => updateModel('main', v)}
              mono
              placeholder="claude-3-5-sonnet"
            />
            <Field
              label={t('profileEditor.modelHaiku')}
              value={draft.models.haiku ?? ''}
              onChange={(v) => updateModel('haiku', v)}
              mono
              placeholder="claude-3-haiku"
            />
            <Field
              label={t('profileEditor.modelSonnet')}
              value={draft.models.sonnet ?? ''}
              onChange={(v) => updateModel('sonnet', v)}
              mono
              placeholder="claude-3-5-sonnet"
            />
            <Field
              label={t('profileEditor.modelOpus')}
              value={draft.models.opus ?? ''}
              onChange={(v) => updateModel('opus', v)}
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
      </div>
    </div>
  );
}
