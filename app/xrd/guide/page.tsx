import Link from "next/link";
import { XrdGuide } from "@/components/xrd/xrd-guide";
import { AppHeader, PageContainer } from "@/components/site/app-header";

export default function XrdGuidePage() {
  return <>
    <AppHeader activeSection="xrd" status="Workflow, methods, and scientific limits" title="XRD documentation" moreActions={<Link className="ui-button header-navigation-button" href="/xrd">XRD Analysis</Link>} />
    <main><PageContainer width="comparison"><XrdGuide /></PageContainer></main>
  </>;
}
