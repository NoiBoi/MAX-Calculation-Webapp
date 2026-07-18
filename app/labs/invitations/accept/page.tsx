import { AcceptLabInvitation } from "@/components/labs/lab-shell";
export default async function AcceptInvitationPage({searchParams}:{searchParams:Promise<{token?:string}>}){const {token=""}=await searchParams;return <AcceptLabInvitation token={token}/>;}
