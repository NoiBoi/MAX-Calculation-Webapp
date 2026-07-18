import { LabWorkspace } from "@/components/labs/lab-shell";
export default async function LabMembersPage({params}:{params:Promise<{labId:string}>}){const {labId}=await params;return <LabWorkspace labId={labId} view="members"/>;}
