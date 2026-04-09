import type { ProfileConfig } from '../types';

interface AvatarProps {
  profile: ProfileConfig;
  size?: number;
}

export function Avatar({ profile, size = 28 }: AvatarProps) {
  const initial = profile.name.charAt(0).toUpperCase();
  const sizePx = `${size}px`;
  return (
    <div
      style={{
        width: sizePx,
        height: sizePx,
        borderRadius: '50%',
        backgroundColor: profile.icon_color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: `${size * 0.4}px`,
        fontWeight: 600,
        color: '#0F0F0F',
        flexShrink: 0,
        fontFamily: 'Noto Sans, sans-serif',
      }}
    >
      {initial}
    </div>
  );
}
