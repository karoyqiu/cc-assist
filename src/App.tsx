import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import './lib/i18n';
import type { ProfileConfig, ProfilesStore, ProviderConfig } from './types';

import './App.css';
import { ProfileEditor } from './components/ProfileEditor';
import { ProfileList } from './components/ProfileList';
import { TerminalWindow } from './components/TerminalWindow';

export function TerminalWindowApp() {
  const { i18n } = useTranslation();
  const [store, setStore] = useState<ProfilesStore | null>(null);

  useEffect(() => {
    invoke<ProfilesStore>('get_config').then((s) => {
      setStore(s);
      return i18n.changeLanguage(s.locale);
    });
  }, [i18n]);

  // Listen for locale-changed events from tray menu
  useEffect(() => {
    const unlisten = listen<string>('locale-changed', async (event) => {
      await i18n.changeLanguage(event.payload);
      setStore((s) => (s ? { ...s, locale: event.payload } : s));
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [i18n]);

  // Listen for profile changes from settings window
  useEffect(() => {
    const unlisten = listen('profiles-changed', async () => {
      const s = await invoke<ProfilesStore>('get_config');
      setStore(s);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Show window once loaded
  useEffect(() => {
    getCurrentWindow().show().catch(console.error);
  }, []);

  if (!store) return null;

  const profile = store.profiles.find((p) => p.id === store.active_profile_id);

  return (
    <TerminalWindow
      profiles={store.profiles}
      activeProfileId={store.active_profile_id}
      activeProfileColor={profile?.icon_color ?? '#D4915D'}
      recentDirectories={store.recent_directories}
      onOpenSettings={() => invoke('toggle_settings_window')}
    />
  );
}

export function SettingsApp() {
  const { i18n, t } = useTranslation();
  const [store, setStore] = useState<ProfilesStore | null>(null);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  // Load config and providers on mount
  useEffect(() => {
    Promise.all([invoke<ProfilesStore>('get_config'), invoke<ProviderConfig[]>('get_providers')])
      .then(([s, p]) => {
        if (!initialized.current) {
          setStore(s);
          setProviders(p);
          setSelectedId(s.active_profile_id);
          initialized.current = true;
        }
        return i18n.changeLanguage(s.locale);
      })
      .catch((e) => {
        console.error('get_config failed:', e);
        setError(i18n.t('errors.loadConfigFailed'));
      });
  }, [i18n, setStore, setSelectedId]);

  // Listen for locale-changed events from tray menu
  useEffect(() => {
    const unlisten = listen<string>('locale-changed', async (event) => {
      await i18n.changeLanguage(event.payload);
      setStore((s) => (s ? { ...s, locale: event.payload } : s));
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [i18n, setStore]);

  useEffect(() => {
    getCurrentWindow().show().catch(console.error);
  }, []);

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

  if (error) {
    return (
      <div className="text-app bg-danger fixed right-4 bottom-4 z-50 max-w-90 rounded px-4 py-2.5 text-sm font-medium">
        {error}
      </div>
    );
  }

  if (!store) {
    return (
      <div className="bg-app text-muted flex h-screen w-screen items-center justify-center text-sm">
        {t('errors.loadConfigFailed')}
      </div>
    );
  }

  return (
    <div className="bg-app flex h-screen w-screen overflow-hidden">
      {/* Left: profile list */}
      <ProfileList
        profiles={store.profiles}
        providers={providers}
        activeId={store.active_profile_id}
        selectedId={selectedId}
        onSelect={handleSelectProfile}
        onAdd={handleAddWithProvider}
        onReorder={handleReorderProfiles}
      />

      {/* Right: profile editor */}
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
  );
}
