import { Suspense } from "react";
import { PrintRoot } from "@/components/print/print-root";

export default function PrintPage() { return <Suspense fallback={<main>Preparing print layout…</main>}><PrintRoot /></Suspense>; }
