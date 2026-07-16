"use client";

import { ApplicationRecoveryPanel } from "@/components/error-recovery/application-recovery-panel";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="en"><body><ApplicationRecoveryPanel error={error} reset={reset} title="MAX Stoich could not load its application shell" /></body></html>;
}
