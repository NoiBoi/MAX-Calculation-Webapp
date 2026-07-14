import Link from "next/link";
import { FormulaDemo } from "./formula-demo";
import { SiteCompositionDemo } from "./site-composition-demo";
import { BalanceMatrixDemo } from "./balance-matrix-demo";
import { BatchCalculationDemo } from "./batch-calculation-demo";

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-8 py-16">
      <section aria-labelledby="title" className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-widest text-teal-700">MAX Stoich</p>
        <h1 id="title" className="text-4xl font-semibold tracking-tight">Scientific foundation in progress</h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-700">
          Exact formula, site, precursor-balance, and batch-weighing calculations are available as
          development demonstrations while scientific validation continues.
        </p>
        <Link className="inline-flex rounded-md bg-slate-900 px-4 py-2 font-medium text-white" href="/workspace">
          Open laboratory calculator
        </Link>
      </section>
      <FormulaDemo />
      <SiteCompositionDemo />
      <BalanceMatrixDemo />
      <BatchCalculationDemo />
    </main>
  );
}
