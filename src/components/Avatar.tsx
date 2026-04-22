import type { ProfileConfig } from '@/types';

import { AvatarFallback, Avatar as AvatarRoot } from '@/components/ui/avatar';

interface AvatarProps {
  profile: ProfileConfig;
  size?: number;
}

export function Avatar({ profile, size = 28 }: AvatarProps) {
  const initial = profile.name.charAt(0).toUpperCase();
  return (
    <AvatarRoot className="shrink-0" style={{ width: size, height: size }}>
      <AvatarFallback
        className="text-foreground font-semibold"
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
