import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import type { ProfileConfig, ProviderConfig } from '../types';

import { cn } from '../lib/utils';
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
      <div className="border-subtle bg-app flex h-full w-60 flex-col border-r">
        {/* Header */}
        <div className="border-subtle flex items-center justify-between border-b px-3 pt-4 pb-3">
          <span className="text-muted text-xs font-medium tracking-wider uppercase">
            {t('profileList.chooseProvider')}
          </span>
          <Button
            variant="outline"
            onClick={() => setShowPicker(false)}
            size="icon"
            title={t('profileList.cancel')}
          >
            {'\u00d7'}
          </Button>
        </div>

        {/* Provider grid */}
        <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-2">
          {providers.map((provider) => (
            <Button
              key={provider.id}
              variant="outline"
              onClick={() => {
                setShowPicker(false);
                onAdd(provider);
              }}
              className="flex w-full cursor-pointer items-center justify-start gap-2.5 px-2.5 py-5 text-left"
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
              <span className="text-primary text-sm">{provider.name}</span>
            </Button>
          ))}

          {/* Divider */}
          <div className="bg-subtle my-1 h-px" />

          {/* Custom option */}
          <Button
            variant="outline"
            onClick={() => {
              setShowPicker(false);
              onAdd(null);
            }}
            className="flex w-full cursor-pointer items-center justify-start gap-2.5 px-2.5 py-6 text-left"
          >
            <div className="bg-subtle text-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm">
              +
            </div>
            <span className="text-muted text-sm">{t('profileList.customProvider')}</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-subtle bg-app flex h-full w-60 flex-col border-r">
      {/* Header */}
      <div className="border-subtle flex items-center justify-between border-b px-3 pt-4 pb-3">
        <span className="text-muted text-xs font-medium tracking-wider uppercase">
          {t('profileList.title')}
        </span>
        <Button
          variant="outline"
          onClick={() => setShowPicker(true)}
          size="icon"
          title={t('profileList.addProfile')}
        >
          +
        </Button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {profiles.length === 0 ? (
          <div className="text-muted px-3 py-6 text-center text-sm">
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
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 px-3 py-2 transition-colors',
                  isSelected ? 'bg-surface' : 'hover:bg-surface',
                )}
              >
                <Avatar profile={profile} size={28} />
                <span className="text-primary flex-1 overflow-hidden text-sm font-normal text-ellipsis whitespace-nowrap">
                  {profile.name}
                </span>
                {matchedProvider && (
                  <span
                    className="max-w-20 shrink-0 overflow-hidden text-xs font-medium tracking-wider text-ellipsis whitespace-nowrap uppercase"
                    style={{ color: matchedProvider.icon_color }}
                    title={matchedProvider.name}
                  >
                    {matchedProvider.name}
                  </span>
                )}
                {isActive && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
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
