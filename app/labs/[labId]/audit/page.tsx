import { LabWorkspace } from "@/components/labs/lab-shell";
export default async function LabAuditPage({params}:{params:Promise<{labId:string}>}){const {labId}=await params;return <LabWorkspace labId={labId} view="audit"/>;}
