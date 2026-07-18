import { redirect } from "next/navigation";
export default async function LabPage({params}:{params:Promise<{labId:string}>}){const {labId}=await params;redirect(`/labs/${labId}/library`);}
