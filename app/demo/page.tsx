import Link from "next/link";
import { FormulaDemo } from "../formula-demo";
import { SiteCompositionDemo } from "../site-composition-demo";
import { BalanceMatrixDemo } from "../balance-matrix-demo";
import { BatchCalculationDemo } from "../batch-calculation-demo";
import { AppHeader, PageContainer } from "@/components/site/app-header";

export default function DemoPage() {
  return <><AppHeader activeSection="other" status="Development reference" title="Feature demo and tutorial" contextualActions={<Link className="ui-button" href="/workspace">Calculator</Link>} /><main><PageContainer width="readable"><section aria-labelledby="title" className="space-y-4"><p className="text-sm font-semibold uppercase tracking-widest text-teal-700">MAXCalc · Development reference</p><h1 id="title" className="text-4xl font-semibold tracking-tight">Feature demo and tutorial</h1><p className="max-w-2xl text-lg leading-8 text-slate-700">Secondary demonstrations of formula parsing, site composition, precursor balancing, and batch calculations. Use the calculator for production recipe work.</p></section><FormulaDemo /><SiteCompositionDemo /><BalanceMatrixDemo /><BatchCalculationDemo /></PageContainer></main></>;
}
