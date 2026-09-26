import Link from "next/link";
import { EmiAnalyzerShell } from "@/components/emi/emi-analyzer-shell";
import { AppHeader, PageContainer } from "@/components/site/app-header";

export default function EmiAnalyzerPage() {
  return <>
    <AppHeader
      activeSection="emi"
      status="Local complex S-parameter analysis · files stay in this browser"
      title="EMI Analysis"
      moreActions={<details className="action-menu header-action-menu relative"><summary className="ui-button header-navigation-button cursor-pointer">More <span aria-hidden="true">•••</span></summary><div className="action-menu-panel"><Link className="ui-button justify-start" href="/demo#emi-analysis">Documentation</Link></div></details>}
    />
    <main><PageContainer width="comparison"><EmiAnalyzerShell /></PageContainer></main>
  </>;
}
