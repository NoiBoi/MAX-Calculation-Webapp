import Link from "next/link";
import { XrdIntegratedWorkspace } from "@/components/xrd/xrd-integrated-workspace";
import { AppHeader, PageContainer } from "@/components/site/app-header";

export default function XrdPage() {
  return <>
    <AppHeader activeSection="xrd" status="Experimental patterns, references, and lattice analysis" title="XRD Analysis" contextualActions={<Link className="ui-button" href="/xrd/guide">Documentation</Link>} />
    <main><PageContainer width="comparison"><XrdIntegratedWorkspace /></PageContainer></main>
  </>;
}
