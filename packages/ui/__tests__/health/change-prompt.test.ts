import { describe, expect, it } from "vitest";
import { buildChangeAiPrompt, type ChangePromptInput } from "../../src/health/ai-prompt-builder";

const base: ChangePromptInput = {
  label: "#7",
  title: "feat: x",
  head_sha: "a".repeat(40),
  commits: ["a".repeat(40), "b".repeat(40)],
  files: ["src/a.py"],
  findings: [],
  resolved: 0,
  complete: true,
  attention: [],
};

describe("buildChangeAiPrompt", () => {
  it("asks to fix what the change made worse, with file and line", () => {
    const text = buildChangeAiPrompt({
      change: {
        ...base,
        resolved: 2,
        findings: [
          {
            change_kind: "worsened",
            severity: "high",
            severity_before: "medium",
            path: "src/a.py",
            symbol: "run",
            line_start: 10,
            line_end: 40,
            reason: "run grew",
            sha: "c".repeat(40),
          },
        ],
      },
    });
    expect(text).toContain("## What this change made worse");
    expect(text).toContain("`src/a.py:10-40` in `run` (commit `cccccccccccc`)");
    expect(text).toContain("was medium");
    expect(text).toContain("resolved 2 existing findings");
    expect(text).toContain("git show aaaaaaaaaaaa; git show bbbbbbbbbbbb");
  });

  it("falls back to reviewing what the checklist flagged", () => {
    const text = buildChangeAiPrompt({
      change: { ...base, attention: ["Decisions crossed: 2 accepted"], complete: false },
      flavor: "claude-code-mcp",
    });
    expect(text).not.toContain("made worse");
    expect(text).toContain("- Decisions crossed: 2 accepted");
    expect(text).toContain("could not be compared");
    expect(text).toContain("get_risk");
  });
});
