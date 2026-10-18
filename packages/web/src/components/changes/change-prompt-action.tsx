"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  AiPromptButton,
  AiPromptModal,
  buildChangeAiPrompt,
  type ChangePromptInput,
} from "@repowise-dev/ui/health";

/**
 * The change page's primary action: the shared prompt button and dialog.
 * Its own client boundary so the page around it stays server-rendered.
 */
// Follow-up: swap for the shared prompt action component once the perf lane
// extracts one into packages/ui; the builder call stays the same.
export function ChangePromptAction({ change }: { change: ChangePromptInput }) {
  // Fixing what got worse when the change made anything worse; else a review
  // of what its checklist flagged. The builder picks the same way.
  const fixing = change.findings.length > 0;
  const [open, setOpen] = useState(false);
  const t = useTranslations("views.changes");
  return (
    <>
      <AiPromptButton label={t(fixing ? "promptActionFix" : "promptAction")} onClick={() => setOpen(true)} />
      <AiPromptModal
        open={open}
        onOpenChange={setOpen}
        getPrompt={(flavor) => buildChangeAiPrompt({ change, flavor })}
        filePath={change.label}
        title={t("promptTitle")}
        description={t("promptDescription")}
      />
    </>
  );
}
