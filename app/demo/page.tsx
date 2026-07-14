import Link from "next/link";
import { FormulaDemo } from "../formula-demo";
import { SiteCompositionDemo } from "../site-composition-demo";
import { BalanceMatrixDemo } from "../balance-matrix-demo";
import { BatchCalculationDemo } from "../batch-calculation-demo";

export default function DemoPage() {
  return <main className="mx-auto min-h-screen max-w-3xl px-8 py-16"><section aria-labelledby="title" className="space-y-4"><p className="text-sm font-semibold uppercase tracking-widest text-teal-700">MAX Stoich · Development reference</p><h1 id="title" className="text-4xl font-semibold tracking-tight">Feature demo and tutorial</h1><p className="max-w-2xl text-lg leading-8 text-slate-700">Secondary demonstrations of formula parsing, site composition, precursor balancing, and batch calculations. Use the calculator for production recipe work.</p><Link className="inline-flex rounded-md bg-slate-900 px-4 py-2 font-medium text-white" href="/">Return to calculator</Link></section><FormulaDemo /><SiteCompositionDemo /><BalanceMatrixDemo /><BatchCalculationDemo /></main>;
}
