import Link from "next/link";
import { AppHeader, PageContainer } from "@/components/site/app-header";

export default function RecipesPage() { return <><AppHeader activeSection="other" status="Planned application surface" title="Recipes" contextualActions={<Link className="ui-button" href="/workspace">Calculator</Link>} /><main><PageContainer width="readable"><h2 className="text-xl font-bold">Recipes — planned</h2></PageContainer></main></>; }
