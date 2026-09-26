import Link from "next/link";
import { XrdIntegratedWorkspace } from "@/components/xrd/xrd-integrated-workspace";
import { AppHeader, PageContainer } from "@/components/site/app-header";

export default function XrdPage() {
  return <>
    <AppHeader activeSection="xrd" status="Experimental patterns, references, and lattice analysis" title="XRD Analysis" moreActions={<details className="action-menu header-action-menu relative"><summary className="ui-button header-navigation-button cursor-pointer">More <span aria-hidden="true">•••</span></summary><div className="action-menu-panel"><Link className="ui-button justify-start" href="/xrd/guide">XRD guide</Link></div></details>} />
    <main><PageContainer width="comparison"><XrdIntegratedWorkspace /></PageContainer></main>
  </>;
}
