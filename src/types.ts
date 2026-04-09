export interface ModelConfig {
  main?: string;
  haiku?: string;
  sonnet?: string;
  opus?: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  icon: string;
  icon_color: string;
  base_url: string;
}

export interface ProfileConfig {
  id: string;
  name: string;
  icon: string;
  icon_color: string;
  base_url: string;
  api_key: string;
  models: ModelConfig;
}

export type RecentDirectories = Record<string, string[]>;

export interface ProfilesStore {
  active_profile_id: string;
  profiles: ProfileConfig[];
  providers: ProviderConfig[];
  recent_directories: RecentDirectories;
  locale: string;
}
