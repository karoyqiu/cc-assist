import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  recentDirectories: string[];
  accentColor: string;
  onLaunch: (directory: string) => void;
  onCancel: () => void;
}

export function DirectoryPicker({ recentDirectories, accentColor, onLaunch, onCancel }: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);

  async function handleBrowse() {
    try {
      const dir = await invoke<string | null>('pick_directory');
      if (dir) {
        setSelected(dir);
      }
    } catch (e: unknown) {
      console.error('pick_directory failed:', e);
    }
  }

  async function handleLaunch() {
    if (!selected || launching) return;
    setLaunching(true);
    try {
      await onLaunch(selected);
    } finally {
      setLaunching(false);
    }
  }

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
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          width: 500,
          backgroundColor: '#1A1A1A',
          border: '1px solid #2A2A2A',
          borderRadius: 6,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '80vh',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 16px 12px',
            borderBottom: '1px solid #2A2A2A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 600, color: '#E5E5E5' }}>
            {t('directoryPicker.title')}
          </span>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              color: '#737373',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {/* Recent directories */}
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: '0.08em',
                color: '#737373',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              {t('directoryPicker.recentDirectories')}
            </div>
            {recentDirectories.length === 0 ? (
              <div style={{ color: '#737373', fontSize: 13, padding: '8px 0' }}>
                {t('directoryPicker.noRecentDirectories')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {recentDirectories.map((dir) => (
                  <div
                    key={dir}
                    onClick={() => setSelected(dir)}
                    style={{
                      padding: '6px 8px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 12,
                      fontFamily: 'Noto Sans Mono, monospace',
                      color: selected === dir ? '#E5E5E5' : '#737373',
                      backgroundColor: selected === dir ? '#2A2A2A' : 'transparent',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => {
                      if (selected !== dir)
                        (e.currentTarget as HTMLElement).style.backgroundColor = '#252525';
                    }}
                    onMouseLeave={(e) => {
                      if (selected !== dir)
                        (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                    }}
                  >
                    {dir}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Selected path display */}
          {selected && (
            <div
              style={{
                padding: '8px',
                backgroundColor: '#0F0F0F',
                border: '1px solid #2A2A2A',
                borderRadius: 4,
                fontSize: 12,
                fontFamily: 'Noto Sans Mono, monospace',
                color: '#E5E5E5',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {selected}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid #2A2A2A',
            display: 'flex',
            gap: 8,
            justifyContent: 'space-between',
          }}
        >
          <button
            onClick={handleBrowse}
            style={{
              height: 30,
              padding: '0 14px',
              fontSize: 13,
              color: '#E5E5E5',
              backgroundColor: 'transparent',
              border: '1px solid #2A2A2A',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            {t('directoryPicker.browse')}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onCancel}
              style={{
                height: 30,
                padding: '0 14px',
                fontSize: 13,
                color: '#737373',
                backgroundColor: 'transparent',
                border: '1px solid #2A2A2A',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {t('directoryPicker.cancel')}
            </button>
            <button
              onClick={handleLaunch}
              disabled={!selected || launching}
              style={{
                height: 30,
                padding: '0 14px',
                fontSize: 13,
                fontWeight: 500,
                color: selected ? '#0F0F0F' : '#737373',
                backgroundColor: selected ? accentColor : '#1A1A1A',
                border: 'none',
                borderRadius: 4,
                cursor: selected ? 'pointer' : 'not-allowed',
              }}
            >
              {t('directoryPicker.launch')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
