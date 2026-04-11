import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import './lib/i18n';
import type { ProfileConfig, ProfilesStore, ProviderConfig } from './types';

import './App.css';
import { DirectoryPicker } from './components/DirectoryPicker';
import { ProfileEditor } from './components/ProfileEditor';
import { ProfileList } from './components/ProfileList';

function App() {
  const { i18n, t } = useTranslation();
  const [store, setStore] = useState<ProfilesStore | null>(null);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDirectoryPicker, setShowDirectoryPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  // Load config and providers on mount
  useEffect(() => {
    Promise.all([
      invoke<ProfilesStore>('get_config'),
      invoke<ProviderConfig[]>('get_providers'),
    ])
      .then(([s, p]) => {
        if (!initialized.current) {
          setStore(s);
          setProviders(p);
          setSelectedId(s.active_profile_id);
          initialized.current = true;
        }
        return i18n.changeLanguage(s.locale);
      })
      .then(() => {
        // Sync tray strings after language is confirmed changed
        return invoke('rebuild_tray_menu', {
          settingsLabel: i18n.t('tray.settings'),
          langEnLabel: i18n.t('languages.en'),
          langZhLabel: i18n.t('languages.zh'),
          quitLabel: i18n.t('tray.quit'),
        });
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
      // Rebuild tray menu with new translated strings
      await invoke('rebuild_tray_menu', {
        settingsLabel: i18n.t('tray.settings'),
        langEnLabel: i18n.t('languages.en'),
        langZhLabel: i18n.t('languages.zh'),
        quitLabel: i18n.t('tray.quit'),
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [i18n, setStore]);

  // Show window once the page is ready
  useEffect(() => {
    invoke('show_settings_window_cmd');
  }, []);

  const selectedProfile = store?.profiles.find((p) => p.id === selectedId) ?? null;

  const recentDirs = store?.recent_directories[store.active_profile_id] ?? [];

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
          name: 'New Profile',
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
      name: `Copy of ${profile.name}`,
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

  async function handleUseProfile(id: string) {
    try {
      await invoke('use_profile', { id });
      setStore((s) => (s ? { ...s, active_profile_id: id } : s));
    } catch (e: unknown) {
      console.error('use_profile failed:', e);
    }
  }

  async function handleLaunch(dir: string) {
    setShowDirectoryPicker(false);
    try {
      await invoke('launch_claude', { directory: dir, profileId: selectedId });
      // Refresh config to get updated recent_directories
      const updated = await invoke<ProfilesStore>('get_config');
      setStore(updated);
    } catch (e: unknown) {
      console.error('launch_claude failed:', e);
      setError(e instanceof Error ? e.message : String(e));
      setTimeout(() => setError(null), 5000);
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
      />

      {/* Right: profile editor */}
      <ProfileEditor
        profile={selectedProfile}
        official={selectedProfile?.provider_id === 'anthropic'}
        activeId={store.active_profile_id}
        onSave={handleSaveProfile}
        onDelete={handleDeleteProfile}
        onDuplicate={handleDuplicateProfile}
        onLaunch={() => setShowDirectoryPicker(true)}
        onUse={handleUseProfile}
      />

      {/* Directory picker modal */}
      {showDirectoryPicker && (
        <DirectoryPicker
          recentDirectories={recentDirs}
          accentColor={selectedProfile?.icon_color ?? '#D4915D'}
          onLaunch={handleLaunch}
          onCancel={() => setShowDirectoryPicker(false)}
        />
      )}
    </div>
  );
}

export default App;
