import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useShowWindowOnMount } from '../hooks/useShowWindowOnMount';
import '../lib/i18n';
import type { ProfileConfig, ProfilesStore, ProviderConfig } from '../types';

import '../App.css';
import { FontCombobox } from '../components/FontCombobox';
import { ProfileEditor } from '../components/ProfileEditor';
import { ProfileList } from '../components/ProfileList';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

export function SettingsApp() {
  const { i18n, t } = useTranslation();
  const [store, setStore] = useState<ProfilesStore | null>(null);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'profiles' | 'terminal'>('profiles');
  const [error, setError] = useState<string | null>(null);
  const [draftFontFamily, setDraftFontFamily] = useState('');
  const [draftFontSize, setDraftFontSize] = useState(14);
  const initialized = useRef(false);

  useEffect(() => {
    Promise.all([invoke<ProfilesStore>('get_config'), invoke<ProviderConfig[]>('get_providers')])
      .then(([s, p]) => {
        if (!initialized.current) {
          setStore(s);
          setProviders(p);
          setSelectedId(s.active_profile_id);
          setDraftFontFamily(s.terminal_font_family);
          setDraftFontSize(s.terminal_font_size);
          initialized.current = true;
        }
        return i18n.changeLanguage(s.locale);
      })
      .catch((e) => {
        console.error('get_config failed:', e);
        setError(i18n.t('errors.loadConfigFailed'));
      });
  }, [i18n, setStore, setSelectedId]);

  useEffect(() => {
    const unlisten = listen<string>('locale-changed', async (event) => {
      await i18n.changeLanguage(event.payload);
      setStore((s) => (s ? { ...s, locale: event.payload } : s));
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [i18n, setStore]);

  useShowWindowOnMount();

  const selectedProfile = store?.profiles.find((p) => p.id === selectedId) ?? null;

  async function handleSaveProfiles(profiles: ProfileConfig[]): Promise<boolean> {
    try {
      await invoke('save_profiles', { profiles });
      setStore((s) => {
        if (!s) return s;
        const active = s.active_profile_id;
        const newActive = profiles.some((p) => p.id === active) ? active : (profiles[0]?.id ?? '');
        return { ...s, profiles, active_profile_id: newActive };
      });
      return true;
    } catch (e: unknown) {
      console.error('save_profiles failed:', e);
      return false;
    }
  }

  async function handleSaveProfile(profile: ProfileConfig) {
    if (!store) return;
    const updated = store.profiles.map((p) => (p.id === profile.id ? profile : p));
    await handleSaveProfiles(updated);
  }

  async function handleAddWithProvider(provider: ProviderConfig | null) {
    if (!store) return;
    const newProfile: ProfileConfig = provider
      ? {
          id: crypto.randomUUID(),
          name: provider.name_key ? t(provider.name_key) : provider.name,
          icon: provider.icon,
          icon_color: provider.icon_color,
          base_url: provider.base_url,
          api_key: '',
          models: {},
          provider_id: provider.id,
        }
      : {
          id: crypto.randomUUID(),
          name: t('profileEditor.newProfileName'),
          icon: 'custom',
          icon_color: '#737373',
          base_url: '',
          api_key: '',
          models: {},
          provider_id: undefined,
        };
    const updated = [...store.profiles, newProfile];
    await handleSaveProfiles(updated);
    setSelectedId(newProfile.id);
  }

  async function handleDuplicateProfile(profile: ProfileConfig) {
    if (!store) return;
    const copy: ProfileConfig = {
      ...profile,
      id: crypto.randomUUID(),
      name: t('profileEditor.copyOfName', { name: profile.name }),
      models: { ...profile.models },
      provider_id: undefined,
    };
    const updated = [...store.profiles, copy];
    await handleSaveProfiles(updated);
    setSelectedId(copy.id);
  }

  async function handleDeleteProfile(id: string): Promise<boolean> {
    if (!store) return false;
    if (!store.profiles.some((p) => p.id === id)) return false;
    const remaining = store.profiles.filter((p) => p.id !== id);
    if (remaining.length === 0) return false;
    const newActive = store.active_profile_id === id ? remaining[0].id : store.active_profile_id;
    const ok = await handleSaveProfiles(remaining);
    if (ok) {
      setSelectedId(newActive);
    }
    return ok;
  }

  function handleSelectProfile(id: string) {
    setSelectedId(id);
  }

  async function handleReorderProfiles(profiles: ProfileConfig[]) {
    await handleSaveProfiles(profiles);
  }

  async function handleUseProfile(id: string) {
    try {
      await invoke('use_profile', { id });
      setStore((s) => (s ? { ...s, active_profile_id: id } : s));
    } catch (e: unknown) {
      console.error('use_profile failed:', e);
    }
  }

  async function handleApplyFontSettings() {
    try {
      await invoke('save_terminal_font_settings', {
        fontFamily: draftFontFamily,
        fontSize: draftFontSize,
      });
      setStore((s) =>
        s ? { ...s, terminal_font_family: draftFontFamily, terminal_font_size: draftFontSize } : s,
      );
    } catch (e) {
      console.error('save_terminal_font_settings failed:', e);
    }
  }

  const fontDirty =
    store &&
    (draftFontFamily !== store.terminal_font_family || draftFontSize !== store.terminal_font_size);

  if (error) {
    return (
      <div className="text-app bg-danger fixed right-4 bottom-4 z-50 max-w-90 rounded px-4 py-2.5 text-sm font-medium">
        {error}
      </div>
    );
  }

  if (!store) {
    return (
      <div className="bg-app text-muted-foreground flex h-screen w-screen items-center justify-center text-sm">
        {t('errors.loadConfigFailed')}
      </div>
    );
  }

  return (
    <div className="bg-app flex h-screen w-screen flex-col overflow-hidden">
      <div className="border-border flex border-b">
        <button
          onClick={() => setActiveTab('profiles')}
          className={`px-4 py-2.5 text-sm ${
            activeTab === 'profiles'
              ? 'text-primary border-primary border-b-2'
              : 'text-muted-foreground'
          }`}
        >
          {t('terminal.tabProfiles')}
        </button>
        <button
          onClick={() => setActiveTab('terminal')}
          className={`px-4 py-2.5 text-sm ${
            activeTab === 'terminal'
              ? 'text-primary border-primary border-b-2'
              : 'text-muted-foreground'
          }`}
        >
          {t('terminal.tabTerminal')}
        </button>
      </div>

      {activeTab === 'profiles' ? (
        <div className="flex flex-1 overflow-hidden">
          <ProfileList
            profiles={store.profiles}
            providers={providers}
            activeId={store.active_profile_id}
            selectedId={selectedId}
            onSelect={handleSelectProfile}
            onAdd={handleAddWithProvider}
            onReorder={handleReorderProfiles}
          />
          <ProfileEditor
            profile={selectedProfile}
            official={selectedProfile?.provider_id === 'anthropic'}
            activeId={store.active_profile_id}
            onSave={handleSaveProfile}
            onDelete={handleDeleteProfile}
            onDuplicate={handleDuplicateProfile}
            onUse={handleUseProfile}
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
            <div className="flex flex-col gap-1">
              <Label className="text-muted-foreground text-xs uppercase">
                {t('terminal.fontFamily')}
              </Label>
              <FontCombobox
                value={draftFontFamily}
                onChange={setDraftFontFamily}
                placeholder="monospace"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-muted-foreground text-xs uppercase">
                {t('terminal.fontSize')}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={8}
                  max={72}
                  value={draftFontSize}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= 8 && v <= 72) {
                      setDraftFontSize(v);
                    }
                  }}
                  className="w-20 text-sm"
                />
                <span className="text-muted-foreground text-xs">{t('terminal.fontSizeUnit')}</span>
              </div>
            </div>
          </div>

          <div className="border-subtle flex justify-end gap-2 border-t px-5 py-3">
            <Button onClick={handleApplyFontSettings} disabled={!fontDirty}>
              {t('terminal.apply')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
