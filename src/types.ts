export interface ModelConfig {
  main?: string;
  haiku?: string;
  sonnet?: string;
  opus?: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  /** i18n translation key for the provider display name, e.g. "providers.anthropic" */
  name_key?: string;
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
  /** Provider ID this profile was created from, e.g. "anthropic". None = custom profile. */
  provider_id?: string;
}

export type RecentDirectories = string[];

export interface ProfilesStore {
  active_profile_id: string;
  profiles: ProfileConfig[];
  recent_directories: RecentDirectories;
  locale: string;
}
