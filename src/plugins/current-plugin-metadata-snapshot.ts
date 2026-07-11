import type { OpenClawConfig } from "../config/types.openclaw.js";
import {
  clearCurrentPluginMetadataSnapshotState,
  getCurrentPluginMetadataSnapshotState,
  setCurrentPluginMetadataSnapshotState,
} from "./current-plugin-metadata-state.js";
import { resolveInstalledPluginIndexPolicyHash } from "./installed-plugin-index-policy.js";
import {
  resolvePluginControlPlaneFingerprint,
  type ResolvePluginControlPlaneContextParams,
} from "./plugin-control-plane-context.js";
import type { PluginMetadataSnapshot } from "./plugin-metadata-snapshot.types.js";

export function resolvePluginMetadataControlPlaneFingerprint(
  config?: OpenClawConfig,
  options: Omit<ResolvePluginControlPlaneContextParams, "config"> = {},
): string {
  return resolvePluginControlPlaneFingerprint({
    config,
    ...options,
  });
}

// Single-slot Gateway-owned handoff. Replace or clear it at lifecycle boundaries;
// never accumulate historical metadata snapshots here.
export function setCurrentPluginMetadataSnapshot(
  snapshot: PluginMetadataSnapshot | undefined,
  options: { config?: OpenClawConfig; env?: NodeJS.ProcessEnv; workspaceDir?: string } = {},
): void {
  setCurrentPluginMetadataSnapshotState(
    snapshot,
    snapshot
      ? resolvePluginMetadataControlPlaneFingerprint(options.config, {
          env: options.env,
          index: snapshot.index,
          policyHash: snapshot.policyHash,
          workspaceDir: options.workspaceDir ?? snapshot.workspaceDir,
        })
      : undefined,
  );
}

export function clearCurrentPluginMetadataSnapshot(): void {
  clearCurrentPluginMetadataSnapshotState();
}

export function getCurrentPluginMetadataSnapshot(
  params: {
    config?: OpenClawConfig;
    env?: NodeJS.ProcessEnv;
    workspaceDir?: string;
  } = {},
): PluginMetadataSnapshot | undefined {
  const { snapshot: rawSnapshot, configFingerprint } = getCurrentPluginMetadataSnapshotState();
  const snapshot = rawSnapshot as PluginMetadataSnapshot | undefined;
  if (!snapshot) {
    console.error(`[TEMP-DEBUG-34] miss: no snapshot`);
    return undefined;
  }
  if (
    params.config &&
    snapshot.policyHash !== resolveInstalledPluginIndexPolicyHash(params.config)
  ) {
    console.error(
      `[TEMP-DEBUG-34] miss: policyHash snapshot=${snapshot.policyHash} requested=${resolveInstalledPluginIndexPolicyHash(params.config)}`,
    );
    return undefined;
  }
  if (params.config) {
    const requestedConfigFingerprint = resolvePluginMetadataControlPlaneFingerprint(params.config, {
      env: params.env,
      index: snapshot.index,
      policyHash: snapshot.policyHash,
      workspaceDir: params.workspaceDir,
    });
    if (configFingerprint && configFingerprint !== requestedConfigFingerprint) {
      console.error(
        `[TEMP-DEBUG-34] miss: configFingerprint(state) stored=${configFingerprint} requested=${requestedConfigFingerprint} workspaceDir=${params.workspaceDir}`,
      );
      return undefined;
    }
    if (snapshot.configFingerprint && snapshot.configFingerprint !== requestedConfigFingerprint) {
      console.error(
        `[TEMP-DEBUG-34] miss: configFingerprint(snapshot) stored=${snapshot.configFingerprint} requested=${requestedConfigFingerprint} workspaceDir=${params.workspaceDir}`,
      );
      return undefined;
    }
  }
  if (snapshot.workspaceDir !== undefined && params.workspaceDir === undefined) {
    console.error(
      `[TEMP-DEBUG-34] miss: snapshot.workspaceDir=${snapshot.workspaceDir} params.workspaceDir=undefined`,
    );
    return undefined;
  }
  if (
    params.workspaceDir !== undefined &&
    (snapshot.workspaceDir ?? "") !== (params.workspaceDir ?? "")
  ) {
    console.error(
      `[TEMP-DEBUG-34] miss: workspaceDir snapshot=${JSON.stringify(snapshot.workspaceDir)} params=${JSON.stringify(params.workspaceDir)}`,
    );
    return undefined;
  }
  console.error(`[TEMP-DEBUG-34] HIT`);
  return snapshot;
}
