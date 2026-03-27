import { describe, expect, it } from "vitest";
import { mergeSkillFilters, resolveSessionSkillFilter } from "./skill-filter.js";

describe("resolveSessionSkillFilter", () => {
  it("returns the MCTL hook skill set for incident hook sessions", () => {
    expect(resolveSessionSkillFilter("agent:main:hook:mctl-agent:ticket-123")).toEqual([
      "mctl-agent-external",
      "mctl-platform",
      "mctl-gitops-remediation",
      "mctl-github-remediation",
    ]);
  });

  it("returns undefined for non-hook sessions", () => {
    expect(resolveSessionSkillFilter("agent:main:default")).toBeUndefined();
  });
});

describe("mergeSkillFilters", () => {
  it("intersects all provided filters", () => {
    expect(
      mergeSkillFilters(
        ["mctl-platform", "mctl-agent-external"],
        ["mctl-agent-external", "mctl-gitops-remediation"],
      ),
    ).toEqual(["mctl-agent-external"]);
  });

  it("returns empty when any filter excludes everything", () => {
    expect(mergeSkillFilters(["mctl-platform"], [])).toEqual([]);
  });
});
