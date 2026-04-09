import { useTranslation } from 'react-i18next';
import type { ProfileConfig } from '../types';
import { Avatar } from './Avatar';

interface Props {
  profiles: ProfileConfig[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
}

export function ProfileList({ profiles, activeId, onSelect, onAdd }: Props) {
  const { t } = useTranslation();

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
          onClick={onAdd}
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
            return (
              <div
                key={profile.id}
                onClick={() => profile.id !== activeId && onSelect(profile.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  cursor: profile.id === activeId ? 'default' : 'pointer',
                  backgroundColor: isActive ? '#1A1A1A' : 'transparent',
                  transition: 'background-color 0.1s',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = '#1A1A1A';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
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
