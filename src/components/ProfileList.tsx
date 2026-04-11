import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ProfileConfig, ProviderConfig } from '../types';

import { Avatar } from './Avatar';

interface Props {
  profiles: ProfileConfig[];
  providers: ProviderConfig[];
  activeId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (provider: ProviderConfig | null) => void;
}

function findProviderByBaseUrl(
  baseUrl: string,
  providers: ProviderConfig[],
): ProviderConfig | undefined {
  return providers.find((p) => p.base_url === baseUrl);
}

export function ProfileList({ profiles, providers, activeId, selectedId, onSelect, onAdd }: Props) {
  const { t } = useTranslation();
  const [showPicker, setShowPicker] = useState(false);

  if (showPicker) {
    return (
      <div
        style={{
          width: 240,
          height: '100%',
          borderRight: '1px solid #2A2A2A',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0F0F0F',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 12px 12px',
            borderBottom: '1px solid #2A2A2A',
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.08em',
              color: '#737373',
              textTransform: 'uppercase',
            }}
          >
            {t('profileList.chooseProvider')}
          </span>
          <button
            onClick={() => setShowPicker(false)}
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              border: '1px solid #2A2A2A',
              backgroundColor: 'transparent',
              color: '#E5E5E5',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              lineHeight: 1,
              padding: 0,
            }}
            title={t('profileList.cancel')}
          >
            ×
          </button>
        </div>

        {/* Provider grid */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {providers.map((provider) => (
            <button
              key={provider.id}
              onClick={() => {
                setShowPicker(false);
                onAdd(provider);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                cursor: 'pointer',
                backgroundColor: 'transparent',
                border: '1px solid #2A2A2A',
                borderRadius: 6,
                width: '100%',
                textAlign: 'left',
                transition: 'background-color 0.1s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = '#1A1A1A';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
              }}
            >
              <Avatar
                profile={{
                  name: provider.name,
                  icon_color: provider.icon_color,
                  icon: provider.icon,
                  id: provider.id,
                  base_url: '',
                  api_key: '',
                  models: {},
                }}
                size={28}
              />
              <span
                style={{
                  fontSize: 13,
                  color: '#E5E5E5',
                  fontFamily: 'Noto Sans, sans-serif',
                }}
              >
                {provider.name}
              </span>
            </button>
          ))}

          {/* Divider */}
          <div style={{ height: 1, backgroundColor: '#2A2A2A', margin: '4px 0' }} />

          {/* Custom option */}
          <button
            onClick={() => {
              setShowPicker(false);
              onAdd(null);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              cursor: 'pointer',
              backgroundColor: 'transparent',
              border: '1px solid #2A2A2A',
              borderRadius: 6,
              width: '100%',
              textAlign: 'left',
              transition: 'background-color 0.1s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = '#1A1A1A';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                backgroundColor: '#2A2A2A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                color: '#737373',
                flexShrink: 0,
              }}
            >
              +
            </div>
            <span
              style={{
                fontSize: 13,
                color: '#737373',
                fontFamily: 'Noto Sans, sans-serif',
              }}
            >
              {t('profileList.customProvider')}
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: 240,
        height: '100%',
        borderRight: '1px solid #2A2A2A',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0F0F0F',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 12px 12px',
          borderBottom: '1px solid #2A2A2A',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.08em',
            color: '#737373',
            textTransform: 'uppercase',
          }}
        >
          {t('profileList.title')}
        </span>
        <button
          onClick={() => setShowPicker(true)}
          style={{
            width: 22,
            height: 22,
            borderRadius: 4,
            border: '1px solid #2A2A2A',
            backgroundColor: 'transparent',
            color: '#E5E5E5',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            lineHeight: 1,
            padding: 0,
          }}
          title={t('profileList.addProfile')}
        >
          +
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {profiles.length === 0 ? (
          <div
            style={{
              padding: '24px 12px',
              color: '#737373',
              fontSize: 13,
              textAlign: 'center',
            }}
          >
            {t('profileList.emptyState')}
          </div>
        ) : (
          profiles.map((profile) => {
            const isActive = profile.id === activeId;
            const isSelected = profile.id === selectedId;
            const matchedProvider = profile.base_url
              ? findProviderByBaseUrl(profile.base_url, providers)
              : undefined;
            return (
              <div
                key={profile.id}
                onClick={() => onSelect(profile.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? '#1A1A1A' : 'transparent',
                  transition: 'background-color 0.1s',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = '#1A1A1A';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected)
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                }}
              >
                <Avatar profile={profile} size={28} />
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    fontWeight: 400,
                    color: '#E5E5E5',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {profile.name}
                </span>
                {matchedProvider && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 500,
                      color: matchedProvider.icon_color,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      flexShrink: 0,
                      maxWidth: 80,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={matchedProvider.name}
                  >
                    {matchedProvider.name}
                  </span>
                )}
                {isActive && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    style={{ flexShrink: 0 }}
                  >
                    <path
                      d="M2 7L5.5 10.5L12 3.5"
                      stroke={profile.icon_color}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
