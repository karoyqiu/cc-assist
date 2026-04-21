import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

export function useShowWindowOnMount() {
  useEffect(() => {
    getCurrentWindow().show().catch(console.error);
  }, []);
}
