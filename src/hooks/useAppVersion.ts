import { useAppConfig } from './useAppConfig'

/** The version shown to people: config/app.version (set by admins), else the build's own. */
export function useAppVersion(): string {
  return useAppConfig().version ?? __APP_VERSION__
}
