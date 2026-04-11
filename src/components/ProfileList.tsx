import { arrayMove } from '@dnd-kit/helpers';
import { DragDropProvider } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ProfileConfig, ProviderConfig } from '@/types';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { Avatar } from './Avatar';

interface Props {
  profiles: ProfileConfig[];
  providers: ProviderConfig[];
  activeId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (provider: ProviderConfig | null) => void;
  onReorder: (profiles: ProfileConfig[]) => void;
}

function findProviderByBaseUrl(
  baseUrl: string,
  providers: ProviderConfig[],
): ProviderConfig | undefined {
  return providers.find((p) => p.base_url === baseUrl);
}

interface SortableItemProps {
  profile: ProfileConfig;
  providers: ProviderConfig[];
  activeId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  index: number;
}

function SortableProfileItem({
  profile,
  providers,
  activeId,
  selectedId,
  onSelect,
  index,
}: SortableItemProps) {
  const { t } = useTranslation();
  const { isDragging, ref, handleRef } = useSortable({
    id: profile.id,
    index,
  });
  const isActive = profile.id === activeId;
  const isSelected = profile.id === selectedId;
  const matchedProvider = profile.base_url
    ? findProviderByBaseUrl(profile.base_url, providers)
    : undefined;

  return (
    <div
      ref={ref}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 transition-colors',
        isSelected ? 'bg-surface' : 'hover:bg-surface',
        isDragging && 'bg-surface opacity-50',
      )}
    >
      <button
        type="button"
        ref={handleRef}
        className="text-muted hover:text-primary cursor-grab touch-none p-0.5"
        title="Drag to reorder"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="4" cy="3" r="1" fill="currentColor" />
          <circle cx="8" cy="3" r="1" fill="currentColor" />
          <circle cx="4" cy="6" r="1" fill="currentColor" />
          <circle cx="8" cy="6" r="1" fill="currentColor" />
          <circle cx="4" cy="9" r="1" fill="currentColor" />
          <circle cx="8" cy="9" r="1" fill="currentColor" />
        </svg>
      </button>
      <div
        className="flex flex-1 cursor-pointer items-center gap-2.5 overflow-hidden"
        onClick={() => onSelect(profile.id)}
      >
        <Avatar profile={profile} size={28} />
        <span className="text-primary flex-1 overflow-hidden text-sm font-normal text-ellipsis whitespace-nowrap">
          {profile.name}
        </span>
        {matchedProvider && (
          <span
            className="max-w-20 shrink-0 overflow-hidden text-xs font-medium tracking-wider text-ellipsis whitespace-nowrap uppercase"
            style={{ color: matchedProvider.icon_color }}
            title={matchedProvider.name_key ? t(matchedProvider.name_key) : matchedProvider.name}
          >
            {matchedProvider.name_key ? t(matchedProvider.name_key) : matchedProvider.name}
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
    </div>
  );
}

export function ProfileList({
  profiles,
  providers,
  activeId,
  selectedId,
  onSelect,
  onAdd,
  onReorder,
}: Props) {
  const { t } = useTranslation();
  const [showPicker, setShowPicker] = useState(false);

  function handleDragEnd(event: any) {
    const { operation } = event;
    if (operation.canceled) return;
    const sourceId = operation.source?.id;
    const targetIndex = operation.target?.index;
    if (!sourceId || targetIndex === undefined) return;

    const oldIndex = profiles.findIndex((p) => p.id === sourceId);
    if (oldIndex === -1 || oldIndex === targetIndex) return;

    onReorder(arrayMove(profiles, oldIndex, targetIndex));
  }

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
              <span className="text-primary text-sm">
                {provider.name_key ? t(provider.name_key) : provider.name}
              </span>
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
          <DragDropProvider onDragEnd={handleDragEnd}>
            {profiles.map((profile, index) => (
              <SortableProfileItem
                key={profile.id}
                profile={profile}
                providers={providers}
                activeId={activeId}
                selectedId={selectedId}
                onSelect={onSelect}
                index={index}
              />
            ))}
          </DragDropProvider>
        )}
      </div>
    </div>
  );
}
