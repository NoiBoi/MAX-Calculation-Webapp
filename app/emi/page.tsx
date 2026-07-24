import Link from "next/link";
import { EmiAnalyzerShell } from "@/components/emi/emi-analyzer-shell";
import { AppHeader, PageContainer } from "@/components/site/app-header";

export default function EmiAnalyzerPage() {
  return <>
    <AppHeader
      activeSection="other"
      contextualActions={<><Link className="ui-button header-navigation-button" href="/workspace">Calculator</Link><Link className="ui-button header-navigation-button" href="/compare">Compare</Link></>}
      status="Local complex S-parameter analysis · files stay in this browser"
      title="EMI Shielding Analyzer"
    />
    <main><PageContainer width="comparison"><EmiAnalyzerShell /></PageContainer></main>
  </>;
}
