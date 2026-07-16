"use client";
import { ApplicationRecoveryPanel } from "@/components/error-recovery/application-recovery-panel";
export default function ComparisonError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) { return <ApplicationRecoveryPanel error={error} reset={reset} title="Route comparison could not be displayed" />; }
