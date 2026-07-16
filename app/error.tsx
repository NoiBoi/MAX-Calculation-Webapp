"use client";
import { useState } from "react";
export default function ApplicationError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [pending, setPending] = useState(false);
  return <main className="p-8"><h1 className="text-xl font-bold">MAX Stoich encountered a local application error</h1><p className="mt-2">Recoverable workspace and scientific records were not cleared. Retry starts a fresh application load and database initialization.</p><button className="mt-4 rounded bg-teal-800 px-4 py-2 text-white disabled:bg-slate-400" disabled={pending} onClick={() => { setPending(true); reset(); window.location.reload(); }}>{pending ? "Retrying local workspace…" : "Retry"}</button></main>;
}
