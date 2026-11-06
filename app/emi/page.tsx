import Link from "next/link";
import { EmiAnalyzerShell } from "@/components/emi/emi-analyzer-shell";
import { AppHeader, PageContainer } from "@/components/site/app-header";

export default function EmiAnalyzerPage() {
  return <>
    <AppHeader
      activeSection="emi"
      status="Local complex S-parameter analysis · files stay in this browser"
      title="EMI Analysis"
      contextualActions={<Link className="ui-button" href="/demo#emi-analysis">Documentation</Link>}
    />
    <main><PageContainer width="comparison"><EmiAnalyzerShell /></PageContainer></main>
  </>;
}
