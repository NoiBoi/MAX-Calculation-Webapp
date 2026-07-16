"use client";
import { ApplicationRecoveryPanel } from "@/components/error-recovery/application-recovery-panel";
export default function SettingsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) { return <ApplicationRecoveryPanel error={error} reset={reset} title="Data management could not be displayed" />; }
