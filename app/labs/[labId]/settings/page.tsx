import { LabWorkspace } from "@/components/labs/lab-shell";
export default async function LabSettingsPage({params}:{params:Promise<{labId:string}>}){const {labId}=await params;return <LabWorkspace labId={labId} view="settings"/>;}
