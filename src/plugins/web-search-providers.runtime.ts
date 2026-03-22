import type { OpenClawConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { loadOpenClawPlugins } from "./loader.js";
import type { PluginLoadOptions } from "./loader.js";
import { createPluginLoaderLogger } from "./logger.js";
import { getActivePluginRegistry } from "./runtime.js";
import type { PluginWebSearchProviderEntry } from "./types.js";
import {
  resolveBundledWebSearchResolutionConfig,
  sortWebSearchProviders,
} from "./web-search-providers.shared.js";

const log = createSubsystemLogger("plugins");
const webSearchProviderSnapshotCache = new WeakMap<
  OpenClawConfig,
  WeakMap<NodeJS.ProcessEnv, Map<string, PluginWebSearchProviderEntry[]>>
>();

export function resolvePluginWebSearchProviders(params: {
  config?: PluginLoadOptions["config"];
  workspaceDir?: string;
  env?: PluginLoadOptions["env"];
  bundledAllowlistCompat?: boolean;
  activate?: boolean;
  cache?: boolean;
}): PluginWebSearchProviderEntry[] {
  const env = params.env ?? process.env;
  const cacheOwnerConfig = params.config;
  const cacheKey = JSON.stringify({
    workspaceDir: params.workspaceDir ?? "",
    bundledAllowlistCompat: params.bundledAllowlistCompat === true,
  });
  const { config } = resolveBundledWebSearchResolutionConfig({
    ...params,
    env,
  });
  const shouldMemoizeSnapshot = params.activate !== true && params.cache !== true;
  if (cacheOwnerConfig && shouldMemoizeSnapshot) {
    const configCache = webSearchProviderSnapshotCache.get(cacheOwnerConfig);
    const envCache = configCache?.get(env);
    const cached = envCache?.get(cacheKey);
    if (cached) {
      return cached;
    }
  }
  const registry = loadOpenClawPlugins({
    config,
    workspaceDir: params.workspaceDir,
    env,
    cache: params.cache ?? false,
    activate: params.activate ?? false,
    logger: createPluginLoaderLogger(log),
  });

  const resolved = sortWebSearchProviders(
    registry.webSearchProviders.map((entry) => ({
      ...entry.provider,
      pluginId: entry.pluginId,
    })),
  );
  if (cacheOwnerConfig && shouldMemoizeSnapshot) {
    let configCache = webSearchProviderSnapshotCache.get(cacheOwnerConfig);
    if (!configCache) {
      configCache = new WeakMap<NodeJS.ProcessEnv, Map<string, PluginWebSearchProviderEntry[]>>();
      webSearchProviderSnapshotCache.set(cacheOwnerConfig, configCache);
    }
    let envCache = configCache.get(env);
    if (!envCache) {
      envCache = new Map<string, PluginWebSearchProviderEntry[]>();
      configCache.set(env, envCache);
    }
    envCache.set(cacheKey, resolved);
  }
  return resolved;
}

export function resolveRuntimeWebSearchProviders(params: {
  config?: PluginLoadOptions["config"];
  workspaceDir?: string;
  env?: PluginLoadOptions["env"];
  bundledAllowlistCompat?: boolean;
}): PluginWebSearchProviderEntry[] {
  const runtimeProviders = getActivePluginRegistry()?.webSearchProviders ?? [];
  if (runtimeProviders.length > 0) {
    return sortWebSearchProviders(
      runtimeProviders.map((entry) => ({
        ...entry.provider,
        pluginId: entry.pluginId,
      })),
    );
  }
  return resolvePluginWebSearchProviders(params);
}
