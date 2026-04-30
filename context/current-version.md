# Current Deployed Version

Tracks the openclaw image tag running on each mctl-openclaw tenant.
Update this file after every successful tenant rollout.

| Tenant | Version    | Last updated |
|--------|------------|--------------|
| labs   | 2026.4.27  | 2026-04-30   |
| admins | 2026.4.27  | 2026-04-30   |
| ovk    | 2026.4.27  | 2026-04-30   |

## Notes

- Helm values source of truth: `mctlhq/mctl-gitops` under
  `platform-gitops/services/<tenant>/openclaw/values.yaml`.
- Rollout sequence per ADR-0001: labs -> admins -> ovk with 24 h soak
  between each promotion.
- Canary management per ADR-0002: stop s3-sync canary before rollout,
  restart with post-rollout delay after readiness probe passes.
- Previous version: 2026.3.14 (replaced by this upgrade; see
  `decisions/0003-upgrade-to-2026-4-27.md`).
