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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDirectoryPicker, setShowDirectoryPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  // Load config on mount
  useEffect(() => {
    invoke<ProfilesStore>('get_config')
      .then((s) => {
        if (!initialized.current) {
          setStore(s);
          setSelectedId(s.active_profile_id);
          initialized.current = true;
        }
        i18n.changeLanguage(s.locale);
      })
      .catch((e) => {
        console.error('get_config failed:', e);
        setError(t('errors.loadConfigFailed'));
      });
  }, [i18n, t, setStore, setSelectedId]);

  // Listen for locale-changed events from tray menu
  useEffect(() => {
    const unlisten = listen<string>('locale-changed', (event) => {
      i18n.changeLanguage(event.payload);
      setStore((s) => (s ? { ...s, locale: event.payload } : s));
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [i18n, setStore]);

  // Listen for show-directory-picker events from tray menu "Launch Claude"
  useEffect(() => {
    const unlisten = listen('show-directory-picker', () => {
      setShowDirectoryPicker(true);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setShowDirectoryPicker]);

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
          name: provider.name,
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
      <div
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          padding: '10px 16px',
          backgroundColor: '#FF6B6B',
          color: '#0F0F0F',
          borderRadius: 4,
          fontSize: 13,
          fontWeight: 500,
          zIndex: 2000,
          maxWidth: 360,
        }}
      >
        {error}
      </div>
    );
  }

  if (!store) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          backgroundColor: '#0F0F0F',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#737373',
          fontSize: 13,
        }}
      >
        {t('errors.loadConfigFailed')}
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: '#0F0F0F',
        display: 'flex',
        overflow: 'hidden',
      }}
    >
      {/* Left: profile list */}
      <ProfileList
        profiles={store.profiles}
        providers={store.providers}
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
