import { Avatar as AvatarRoot, AvatarFallback } from '@/components/ui/avatar';

import type { ProfileConfig } from '../types';

interface AvatarProps {
  profile: ProfileConfig;
  size?: number;
}

export function Avatar({ profile, size = 28 }: AvatarProps) {
  const initial = profile.name.charAt(0).toUpperCase();
  return (
    <AvatarRoot className="shrink-0" style={{ width: size, height: size }}>
      <AvatarFallback
        className="text-app font-semibold"
        style={{
          backgroundColor: profile.icon_color,
          fontSize: size * 0.4,
        }}
      >
        {initial}
      </AvatarFallback>
    </AvatarRoot>
  );
}
