import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useTranslation } from 'react-i18next';
import './i18n';
import type { ProfilesStore, ProfileConfig } from './types';
import { ProfileList } from './components/ProfileList';
import { ProfileEditor } from './components/ProfileEditor';
import { DirectoryPicker } from './components/DirectoryPicker';
import './App.css';

function App() {
  const { i18n, t } = useTranslation();
  const [store, setStore] = useState<ProfilesStore | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDirectoryPicker, setShowDirectoryPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load config on mount
  useEffect(() => {
    invoke<ProfilesStore>('get_config')
      .then((s) => {
        setStore(s);
        setSelectedId(s.active_profile_id);
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
    return () => { unlisten.then((fn) => fn()); };
  }, [i18n, setStore]);

  const selectedProfile = store?.profiles.find((p) => p.id === selectedId) ?? null;

  const recentDirs = store?.recent_directories[store.active_profile_id] ?? [];

  async function handleSetActive(id: string) {
    try {
      await invoke('set_active_profile', { id });
      setStore((s) => (s ? { ...s, active_profile_id: id } : s));
    } catch (e) {
      console.error('set_active_profile failed:', e);
    }
  }

  async function handleSaveProfiles(profiles: ProfileConfig[]) {
    try {
      await invoke('save_profiles', { profiles });
      setStore((s) => {
        if (!s) return s;
        const active = s.active_profile_id;
        const newActive = profiles.some((p) => p.id === active)
          ? active
          : profiles[0]?.id ?? '';
        return { ...s, profiles, active_profile_id: newActive };
      });
    } catch (e) {
      console.error('save_profiles failed:', e);
    }
  }

  function handleSaveProfile(profile: ProfileConfig) {
    if (!store) return;
    const updated = store.profiles.map((p) => (p.id === profile.id ? profile : p));
    handleSaveProfiles(updated);
  }

  function handleAddProfile() {
    if (!store) return;
    const newProfile: ProfileConfig = {
      id: crypto.randomUUID(),
      name: 'New Profile',
      icon: 'custom',
      icon_color: '#737373',
      base_url: '',
      api_key: '',
      models: {},
      is_built_in: false,
    };
    const updated = [...store.profiles, newProfile];
    handleSaveProfiles(updated);
    setSelectedId(newProfile.id);
  }

  function handleDuplicateProfile(profile: ProfileConfig) {
    if (!store) return;
    const copy: ProfileConfig = {
      ...profile,
      id: crypto.randomUUID(),
      name: `Copy of ${profile.name}`,
      is_built_in: false,
      models: { ...profile.models },
    };
    const updated = [...store.profiles, copy];
    handleSaveProfiles(updated);
    setSelectedId(copy.id);
  }

  function handleDeleteProfile(id: string) {
    if (!store) return;
    const remaining = store.profiles.filter((p) => p.id !== id);
    if (remaining.length === 0) return;
    const newActive = store.active_profile_id === id ? remaining[0].id : store.active_profile_id;
    handleSaveProfiles(remaining);
    setSelectedId(newActive);
  }

  function handleSelectProfile(id: string) {
    setSelectedId(id);
    handleSetActive(id);
  }

  async function handleLaunch(dir: string) {
    setShowDirectoryPicker(false);
    try {
      await invoke('launch_claude', { directory: dir });
      // Refresh config to get updated recent_directories
      const updated = await invoke<ProfilesStore>('get_config');
      setStore(updated);
    } catch (e) {
      console.error('launch_claude failed:', e);
      setError(String(e));
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
        activeId={store.active_profile_id}
        onSelect={handleSelectProfile}
        onAdd={handleAddProfile}
      />

      {/* Right: profile editor */}
      <ProfileEditor
        profile={selectedProfile}
        onSave={handleSaveProfile}
        onDelete={handleDeleteProfile}
        onDuplicate={handleDuplicateProfile}
        onLaunch={() => setShowDirectoryPicker(true)}
      />

      {/* Directory picker modal */}
      {showDirectoryPicker && (
        <DirectoryPicker
          recentDirectories={recentDirs}
          onLaunch={handleLaunch}
          onCancel={() => setShowDirectoryPicker(false)}
        />
      )}
    </div>
  );
}

export default App;
