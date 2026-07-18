import { LabWorkspace } from "@/components/labs/lab-shell";
export default async function LabLibraryPage({params}:{params:Promise<{labId:string}>}){const {labId}=await params;return <LabWorkspace labId={labId} view="library"/>;}
