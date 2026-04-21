import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import '../lib/i18n';
import type { ProfilesStore } from '../types';

import '../App.css';
import { TerminalWindow } from '../components/TerminalWindow';
import { setFontSettings } from '../lib/terminal';

export function TerminalWindowApp() {
  const { i18n } = useTranslation();
  const [store, setStore] = useState<ProfilesStore | null>(null);

  useEffect(() => {
    invoke<ProfilesStore>('get_config').then((s) => {
      setStore(s);
      setFontSettings({
        fontFamily: s.terminal_font_family,
        fontSize: s.terminal_font_size,
      });
      return i18n.changeLanguage(s.locale);
    });
  }, [i18n]);

  useEffect(() => {
    const unlisten = listen<string>('locale-changed', async (event) => {
      await i18n.changeLanguage(event.payload);
      setStore((s) => (s ? { ...s, locale: event.payload } : s));
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [i18n]);

  useEffect(() => {
    const unlisten = listen('profiles-changed', async () => {
      const s = await invoke<ProfilesStore>('get_config');
      setStore(s);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    getCurrentWindow().show().catch(console.error);
  }, []);

  if (!store) return null;

  return (
    <TerminalWindow
      profiles={store.profiles}
      activeProfileId={store.active_profile_id}
      recentDirectories={store.recent_directories}
      onOpenSettings={() => invoke('toggle_settings_window')}
    />
  );
}
