import Link from "next/link";
import { XrdGuide } from "@/components/xrd/xrd-guide";
import { AppHeader, PageContainer } from "@/components/site/app-header";

export default function XrdGuidePage() {
  return <>
    <AppHeader activeSection="xrd" title="XRD documentation" moreActions={<Link className="ui-button header-navigation-button" href="/xrd">XRD analysis</Link>} />
    <main><PageContainer width="comparison"><XrdGuide /></PageContainer></main>
  </>;
}
