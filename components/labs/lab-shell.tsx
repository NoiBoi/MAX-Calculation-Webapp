"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { useCloudSync } from "@/components/cloud/cloud-sync-provider";
import { useAccountRepositories } from "@/components/cloud/use-account-repositories";
import { SiteBrand } from "@/components/site/site-brand";
import { labApi } from "@/lib/labs/client";
import { syncAuthorizedLabCaches } from "@/lib/labs/local-cache";
import type { LabAuditEvent, LabInvitationSummary, LabLibraryEntry, LabLibraryVersion, LabMembership, LabPublicationNote, LabRetentionDays, LabRole, LabSummary } from "@/lib/labs/types";
import { downloadText, safeExportFilename } from "@/lib/export/laboratory-export";

type LabView = "library" | "members" | "audit" | "settings";
const requestId = () => `ui-${crypto.randomUUID()}`;

function LabNavigation({ lab, view }: { lab: LabSummary; view: LabView }) {
  return <nav aria-label="Lab sections" className="flex flex-wrap gap-2 border-b pb-3">
    {(["library","members","audit","settings"] as const).map((item) => <Link aria-current={view === item ? "page" : undefined} className={`rounded border px-3 py-2 text-sm font-semibold ${view === item ? "bg-teal-900 text-white" : ""}`} href={`/labs/${lab.id}/${item}`} key={item}>{item[0]!.toUpperCase() + item.slice(1)}</Link>)}
  </nav>;
}

export function LabsHome() {
  const repositories = useAccountRepositories();
  const { user } = useAuth();
  const cloud = useCloudSync();
  const router = useRouter();
  const [labs, setLabs] = useState<readonly LabSummary[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("Loading private labs…");
  const load = useCallback(async () => {
    await repositories.database.open();
    if (user && cloud.online) await syncAuthorizedLabCaches(repositories.database).catch(() => undefined);
    setLabs(await repositories.database.labCaches.orderBy("name").toArray());
    setMessage("");
  }, [cloud.online, repositories.database, user]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  if (!user) return <main className="mx-auto max-w-5xl p-6"><h1 className="text-2xl font-bold">Private lab libraries</h1><p className="mt-3">Sign in to access authorized lab libraries.</p><Link className="mt-4 inline-block rounded bg-teal-900 px-4 py-2 text-white" href="/login?next=/labs">Sign in</Link></main>;
  return <main className="mx-auto min-h-screen max-w-6xl p-4">
    <header className="flex flex-wrap items-center gap-3 border-b pb-4"><Link href="/workspace"><SiteBrand /></Link><div className="mr-auto"><h1 className="text-2xl font-bold">Private lab libraries</h1><p className="text-sm">Personal recipes remain private until explicitly published as immutable lab snapshots.</p></div><Link className="rounded border px-3 py-2" href="/workspace">Calculator</Link></header>
    {message && <p aria-live="polite" className="mt-4 rounded border p-3">{message}</p>}
    <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_22rem]">
      <section><h2 className="text-lg font-semibold">Your active labs</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{labs.map((lab) => <article className="rounded border bg-white p-4" key={lab.id}><div className="flex items-start justify-between gap-2"><div><h3 className="font-bold">{lab.name}</h3><p className="mt-1 text-sm">{lab.description || "Private MAXCalc library"}</p></div><span className="rounded border px-2 py-1 text-xs font-semibold">{lab.role}</span></div><p className="mt-3 text-xs">Retention: {lab.retentionDays ? `${lab.retentionDays} days after archive` : "Never automatically purge"}</p><Link className="mt-3 inline-block rounded bg-teal-900 px-3 py-2 text-sm font-semibold text-white" href={`/labs/${lab.id}/library`}>Open library</Link></article>)}{!labs.length && <p className="rounded border border-dashed p-6 text-sm">No active lab memberships are available for this account.</p>}</div></section>
      <section className="rounded border bg-white p-4"><h2 className="font-semibold">Create a private lab</h2><p className="mt-1 text-xs">The creator becomes the first admin. Nothing from your personal workspace is published automatically.</p><label className="mt-3 block text-sm font-semibold">Lab name<input className="mt-1 w-full rounded border px-3 py-2" onChange={(event) => setName(event.target.value)} value={name} /></label><label className="mt-3 block text-sm font-semibold">Description<textarea className="mt-1 w-full rounded border p-3" onChange={(event) => setDescription(event.target.value)} value={description} /></label><button className="mt-3 rounded bg-teal-900 px-4 py-2 font-semibold text-white disabled:bg-slate-400" disabled={!cloud.online || !name.trim()} onClick={() => void labApi.create(name, description).then(({ labId }) => router.push(`/labs/${labId}/library`)).catch((error) => setMessage(error instanceof Error ? error.message : "Lab creation failed."))}>Create private lab</button>{!cloud.online && <p className="mt-2 text-xs">Lab administration requires an online authorization check.</p>}</section>
    </div>
  </main>;
}

export function LabWorkspace({ labId, view }: { labId: string; view: LabView }) {
  const repositories = useAccountRepositories();
  const cloud = useCloudSync();
  const router = useRouter();
  const [lab, setLab] = useState<LabSummary>();
  const [entries, setEntries] = useState<readonly LabLibraryEntry[]>([]);
  const [versions, setVersions] = useState<readonly LabLibraryVersion[]>([]);
  const [notes, setNotes] = useState<readonly LabPublicationNote[]>([]);
  const [members, setMembers] = useState<readonly LabMembership[]>([]);
  const [audit, setAudit] = useState<readonly LabAuditEvent[]>([]);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [message, setMessage] = useState("Loading authorized lab cache…");
  const [selectedNotes, setSelectedNotes] = useState<ReadonlySet<string>>(new Set());
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<LabRole>("member");
  const [invitationUrl, setInvitationUrl] = useState("");
  const [invitations, setInvitations] = useState<readonly LabInvitationSummary[]>([]);
  const [retentionDays, setRetentionDays] = useState<LabRetentionDays>(null);
  const [labName, setLabName] = useState("");
  const [labDescription, setLabDescription] = useState("");
  const [renderedAt] = useState(() => Date.now());

  const load = useCallback(async () => {
    await repositories.database.open();
    if (cloud.online) {
      const session = await repositories.database.labSyncSessions.get(`${repositories.ownerId}:${labId}`);
      const payload = await labApi.sync(labId, session?.cursor ?? "0").catch(() => undefined);
      if (payload) {
        const { applyLabSyncPayload } = await import("@/lib/labs/local-cache");
        await applyLabSyncPayload(repositories.database, payload);
      } else await syncAuthorizedLabCaches(repositories.database).catch(() => undefined);
    }
    const currentLab = await repositories.database.labCaches.get(labId);
    if (!currentLab) { setLab(undefined); setMessage(cloud.online ? "Your account no longer has access to this lab." : "This lab is not available in the authorized offline cache."); return; }
    const [entryValues, versionValues, noteValues, memberValues, auditValues] = await Promise.all([
      repositories.database.labEntries.where("labId").equals(labId).toArray(),
      repositories.database.labVersions.where("labId").equals(labId).toArray(),
      repositories.database.labPublicationNotes.where("labId").equals(labId).toArray(),
      repositories.database.labMemberships.where("labId").equals(labId).toArray(),
      repositories.database.labAuditEvents.where("labId").equals(labId).reverse().sortBy("occurredAt"),
    ]);
    const invitationValues = cloud.online && currentLab.role === "admin" ? await labApi.invitations(labId).then((value) => value.invitations).catch(() => []) : [];
    setLab(currentLab); setLabName(currentLab.name); setLabDescription(currentLab.description); setRetentionDays(currentLab.retentionDays); setEntries(entryValues); setVersions(versionValues); setNotes(noteValues); setMembers(memberValues); setAudit(auditValues); setInvitations(invitationValues); setMessage("");
  }, [cloud.online, labId, repositories]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  useEffect(() => { const changed = () => void load(); window.addEventListener("max-stoich:lab-cache-changed", changed); return () => window.removeEventListener("max-stoich:lab-cache-changed", changed); }, [load]);

  const currentVersion = useCallback((entry: LabLibraryEntry) => versions.find((item) => item.id === entry.currentVersionId), [versions]);
  const visibleEntries = useMemo(() => entries.filter((entry) => (showArchived ? entry.visibilityStatus !== "active" : entry.visibilityStatus === "active") && `${entry.title} ${entry.description} ${currentVersion(entry)?.targetFormula ?? ""} ${currentVersion(entry)?.adjustedFeedFormula ?? ""} ${notes.filter((note) => note.entryId === entry.id).map((note) => `${note.title} ${note.body}`).join(" ")}`.toLowerCase().includes(search.toLowerCase())).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)), [currentVersion, entries, notes, search, showArchived]);
  const mutate = async (action: string, data: Record<string, unknown>, success: string) => {
    if (!cloud.online) { setMessage("Lab writes require an online authorization check."); return; }
    try { await labApi.action(action, { ...data, requestId: requestId() }); await syncAuthorizedLabCaches(repositories.database); await load(); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The lab action failed."); }
  };
  const copyVersion = async (entry: LabLibraryEntry, version: LabLibraryVersion, includeNotes: boolean) => {
    const result = version.calculationSnapshot.result;
    const saved = await repositories.saveCalculatedRevision({
      name: `Copy of ${entry.title}`, inputState: version.scientificInput.inputState, result,
      revisionNote: `Copied from ${lab!.name} · ${entry.title} · lab version ${version.versionNumber}`,
      copiedFromLab: { labId: lab!.id, labName: lab!.name, entryId: entry.id, entryTitle: entry.title, publicationVersionId: version.id, versionNumber: version.versionNumber, publisherName: version.publisherName, publishedAt: version.createdAt, copiedAt: new Date().toISOString() },
    });
    if (includeNotes) for (const note of notes.filter((item) => item.publicationVersionId === version.id && selectedNotes.has(item.id))) await repositories.saveRecipeNote({ recipeId: saved.recipe.id, recipeRevisionId: saved.revision.id, category: note.category, title: note.title, body: `${note.body}\n\nSource: ${lab!.name}, ${entry.title}, lab version ${version.versionNumber}.`, tags: [...note.tags], ...(note.experimentDate ? { experimentDate: note.experimentDate } : {}) });
    setMessage(`Created personal recipe ${saved.recipe.name}. The lab publication remains unchanged.`);
  };
  const compareVersion = (entry: LabLibraryEntry, version: LabLibraryVersion) => {
    sessionStorage.setItem("max-stoich:lab-comparison-staging", JSON.stringify({ name: `${entry.title} · Lab v${version.versionNumber}`, inputState: version.scientificInput.inputState, validationStatus: version.calculationSnapshot.validationStatus, source: { kind: "lab-library", labId, labName: lab?.name, labEntryId: entry.id, labEntryTitle: entry.title, labVersionId: version.id, labVersionNumber: version.versionNumber, labPublisherName: version.publisherName, labPublishedAt: version.createdAt } }));
    router.push("/compare");
  };
  const exportLab = () => {
    const safePayload = {
      schemaVersion: "1.0.0",
      exportedAt: new Date().toISOString(),
      lab: { id: lab!.id, name: lab!.name, description: lab!.description, retentionDays: lab!.retentionDays },
      memberships: members.map(({ id, userId, displayName, role, status, joinedAt, createdAt, updatedAt, removedAt }) => ({ id, userId, displayName, role, status, joinedAt, createdAt, updatedAt, removedAt })),
      entries,
      versions,
      publicationNotes: notes,
      auditEvents: audit.map((event) => ({ id: event.id, labId: event.labId, actorUserId: event.actorUserId, actorName: event.actorName, eventType: event.eventType, targetType: event.targetType, targetId: event.targetId, targetVersionId: event.targetVersionId, metadata: event.metadata, occurredAt: event.occurredAt, syncSequence: event.syncSequence })),
    };
    downloadText(safeExportFilename(`${lab!.name}-private-lab-export`, "json"), JSON.stringify(safePayload, null, 2), "application/json");
  };

  if (!lab) return <main className="mx-auto max-w-4xl p-6"><Link href="/labs">← Labs</Link><p className="mt-5 rounded border p-4">{message}</p></main>;
  return <main className="mx-auto min-h-screen max-w-[1500px] p-4">
    <header className="flex flex-wrap items-center gap-3 pb-4"><Link href="/workspace"><SiteBrand /></Link><Link className="rounded border px-3 py-2" href="/labs">All labs</Link><div className="mr-auto"><h1 className="text-2xl font-bold">{lab.name}</h1><p className="text-sm">Private lab library · Your role: <strong>{lab.role}</strong></p></div><span className="rounded border px-3 py-2 text-sm font-semibold">Read-only snapshots</span></header>
    <LabNavigation lab={lab} view={view} />{message && <p aria-live="polite" className="mt-3 rounded border bg-white p-3">{message}</p>}
    {view === "library" && <section className="mt-4"><div className="flex flex-wrap gap-3"><input aria-label="Search lab library" className="min-w-64 flex-1 rounded border px-3 py-2" onChange={(event) => setSearch(event.target.value)} placeholder="Search title, formulas, or published note text" value={search} /><label className="flex items-center gap-2 rounded border px-3"><input checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} type="checkbox" />Archived and held</label><Link className="rounded bg-teal-900 px-4 py-2 font-semibold text-white" href="/workspace">Publish from calculator</Link></div>
      <div className="mt-4 space-y-4">{visibleEntries.map((entry) => { const current = currentVersion(entry); const history = versions.filter((item) => item.entryId === entry.id).sort((a,b) => b.versionNumber-a.versionNumber); return <article className="rounded border bg-white p-4" key={entry.id}><div className="flex flex-wrap items-start gap-3"><div className="mr-auto"><div className="flex gap-2"><h2 className="text-lg font-bold">{entry.title}</h2><span className="rounded border px-2 py-1 text-xs">{entry.visibilityStatus}</span></div><p className="mt-1 text-sm">{entry.description}</p>{current && <><p className="mt-2 font-mono">{current.targetFormula} · adjusted feed {current.adjustedFeedFormula ?? "not recorded"}</p><p className="text-xs">Current lab version {current.versionNumber} · {current.verificationStatus} · {current.warningCount} warning(s) · engine {current.engineVersion}</p></>}</div>{current && <div className="flex flex-wrap gap-2"><button className="rounded bg-teal-900 px-3 py-2 text-sm font-semibold text-white" onClick={() => void copyVersion(entry,current,false)}>Copy recipe only</button><button className="rounded border px-3 py-2 text-sm" onClick={() => void copyVersion(entry,current,true)}>Copy with selected notes</button><button className="rounded border px-3 py-2 text-sm" onClick={() => compareVersion(entry,current)}>Add to comparison</button></div>}</div>
        <details className="mt-3"><summary className="font-semibold">Version history, provenance, and selected notes</summary><div className="mt-3 space-y-3">{history.map((version) => <section className="rounded border p-3" key={version.id}><p><strong>Lab version {version.versionNumber}</strong> · published by {version.publisherName} · {new Date(version.createdAt).toLocaleString()}</p><p className="mt-1 text-xs">Published calculation · arithmetic: {version.verificationStatus} · experimental status not recorded · digest {version.contentDigest.slice(0,16)}…</p><p className="mt-2 text-sm">{version.publicationNote || "No publication note."}</p>{notes.filter((item) => item.publicationVersionId === version.id).map((note) => <label className="mt-2 flex items-start gap-2 rounded bg-slate-50 p-2 text-sm" key={note.id}><input checked={selectedNotes.has(note.id)} onChange={() => setSelectedNotes((currentSet) => { const next = new Set(currentSet); if (next.has(note.id)) next.delete(note.id); else next.add(note.id); return next; })} type="checkbox" /><span><strong>{note.category}: {note.title}</strong><span className="block whitespace-pre-wrap">{note.body}</span></span></label>)}<div className="mt-2 flex gap-2"><button className="rounded border px-2 py-1 text-sm" onClick={() => void copyVersion(entry,version,false)}>Copy this version</button><button className="rounded border px-2 py-1 text-sm" onClick={() => compareVersion(entry,version)}>Compare this version</button></div></section>)}</div></details>
        {(lab.role === "admin" || lab.role === "member" && entry.createdBy === repositories.ownerId) && entry.visibilityStatus === "active" && <button className="mt-3 rounded border px-3 py-2 text-sm" onClick={() => void mutate("entry-state",{entryId:entry.id,entryAction:"archive",expectedVersion:entry.version},"Entry archived; immutable versions were preserved.")}>Archive</button>}
        {lab.role === "admin" && entry.visibilityStatus !== "active" && <div className="mt-3 flex flex-wrap gap-2"><button className="rounded border px-3 py-2 text-sm" onClick={() => void mutate("entry-state",{entryId:entry.id,entryAction:"restore",expectedVersion:entry.version},"Entry restored.")}>Restore</button>{entry.visibilityStatus === "retention-hold" ? <button className="rounded border px-3 py-2 text-sm" onClick={() => void mutate("entry-state",{entryId:entry.id,entryAction:"unhold",expectedVersion:entry.version},"Retention hold removed.")}>Remove hold</button> : <button className="rounded border px-3 py-2 text-sm" onClick={() => { const reason=window.prompt("Retention-hold reason"); if(reason) void mutate("entry-state",{entryId:entry.id,entryAction:"hold",expectedVersion:entry.version,holdReason:reason},"Retention hold applied."); }}>Apply hold</button>}{entry.purgeEligibleAt && Date.parse(entry.purgeEligibleAt)<=renderedAt && entry.visibilityStatus!=="retention-hold" && <button className="rounded border border-red-500 px-3 py-2 text-sm text-red-800" onClick={() => { const title=window.prompt(`Type the exact entry title to permanently purge lab publication payloads:\n${entry.title}`); if(title===entry.title) void mutate("purge",{entryId:entry.id,confirmationTitle:title},"Eligible lab publication payloads purged; audit tombstone retained."); }}>Purge eligible entry…</button>}</div>}</article>; })}{!visibleEntries.length && <p className="rounded border border-dashed p-8 text-center">No authorized lab publications match this view.</p>}</div></section>}
    {view === "members" && <section className="mt-4"><h2 className="text-xl font-bold">Memberships</h2>{lab.role === "admin" && <div className="mt-3 grid gap-2 rounded border bg-white p-4 sm:grid-cols-[1fr_10rem_auto]"><input aria-label="Invite email" className="rounded border px-3 py-2" onChange={(event)=>setInviteEmail(event.target.value)} placeholder="name@example.edu" value={inviteEmail}/><select aria-label="Invitation role" className="rounded border px-3" onChange={(event)=>setInviteRole(event.target.value as LabRole)} value={inviteRole}><option value="member">Member</option><option value="viewer">Viewer</option><option value="admin">Admin</option></select><button className="rounded bg-teal-900 px-4 py-2 text-white disabled:bg-slate-400" disabled={!cloud.online||!inviteEmail} onClick={()=>void labApi.invite(labId,inviteEmail,inviteRole).then(async (result)=>{setInvitationUrl(result.invitationUrl);setInvitations((await labApi.invitations(labId)).invitations);setMessage("Invitation created. Copy the secure link once; only its digest is stored.");}).catch((error)=>setMessage(error.message))}>Create invitation</button>{invitationUrl&&<div className="sm:col-span-3"><label className="text-xs font-semibold">Secure invitation link<input className="mt-1 w-full rounded border p-2 font-mono text-xs" readOnly value={invitationUrl}/></label><button className="mt-2 rounded border px-3 py-2 text-sm" onClick={()=>void navigator.clipboard.writeText(invitationUrl)}>Copy link</button></div>}</div>}
      <div className="mt-4 overflow-x-auto"><table className="w-full border-collapse bg-white text-sm"><thead><tr><th className="border p-2 text-left">Member</th><th className="border p-2">Role</th><th className="border p-2">Status</th><th className="border p-2">Joined</th><th className="border p-2">Actions</th></tr></thead><tbody>{members.map((member)=><tr key={member.id}><td className="border p-2"><strong>{member.displayName}</strong>{member.email&&<span className="block text-xs">{member.email}</span>}</td><td className="border p-2 text-center">{member.role}</td><td className="border p-2 text-center">{member.status}</td><td className="border p-2 text-center">{member.joinedAt?new Date(member.joinedAt).toLocaleDateString():"—"}</td><td className="border p-2 text-center">{lab.role==="admin"&&member.userId!==repositories.ownerId?<div className="flex justify-center gap-2"><select aria-label={`Role for ${member.displayName}`} className="rounded border p-1" value={member.role} onChange={(event)=>void mutate("manage-member",{labId,userId:member.userId,role:event.target.value,status:member.status},"Member role updated.")}><option value="admin">Admin</option><option value="member">Member</option><option value="viewer">Viewer</option></select><button className="rounded border px-2" onClick={()=>void mutate("manage-member",{labId,userId:member.userId,role:member.role,status:member.status==="suspended"?"active":"suspended"},"Membership status updated.")}>{member.status==="suspended"?"Reactivate":"Suspend"}</button><button className="rounded border border-red-400 px-2 text-red-800" onClick={()=>window.confirm(`Remove ${member.displayName} from this lab?`)&&void mutate("manage-member",{labId,userId:member.userId,role:member.role,status:"removed"},"Member removed; their personal records were not changed.")}>Remove</button></div>:"—"}</td></tr>)}</tbody></table></div>{lab.role!=="admin"&&<p className="mt-3 text-sm">Only lab admins can invite or manage members.</p>}</section>}
    {view === "members" && lab.role === "admin" && <section className="mt-4 rounded border bg-white p-4"><h2 className="font-bold">Pending and historical invitations</h2><p className="mt-1 text-xs">Invitation plaintext is shown only once at creation. The server retains a SHA-256 digest, recipient, role, expiry, and status.</p><ul className="mt-3 space-y-2">{invitations.map((invitation) => { const state = invitation.acceptedAt ? "accepted" : invitation.revokedAt ? "revoked" : Date.parse(invitation.expiresAt) <= renderedAt ? "expired" : "pending"; return <li className="flex flex-wrap items-center gap-2 rounded border p-2 text-sm" key={invitation.id}><span className="mr-auto"><strong>{invitation.emailNormalized}</strong> · {invitation.intendedRole} · expires {new Date(invitation.expiresAt).toLocaleString()}</span><span className="rounded border px-2 py-1 text-xs">{state}</span>{state === "pending" && <button className="rounded border border-red-400 px-2 py-1 text-red-800" onClick={() => void mutate("revoke-invitation",{invitationId:invitation.id},"Invitation revoked.")}>Revoke</button>}</li>; })}{!invitations.length && <li className="text-sm">No invitations are recorded for this lab.</li>}</ul></section>}
    {view === "audit" && <AuditView audit={audit} lab={lab} />}
    {view === "settings" && <section className="mt-4 max-w-3xl rounded border bg-white p-4"><h2 className="text-xl font-bold">Lab settings and retention</h2><p className="mt-1 text-sm">Eligibility never runs an automatic browser purge. Purge remains an explicit, confirmed admin action.</p><label className="mt-4 block text-sm font-semibold">Lab name<input className="mt-1 w-full rounded border p-2" disabled={lab.role!=="admin"} onChange={(event)=>setLabName(event.target.value)} value={labName}/></label><label className="mt-3 block text-sm font-semibold">Description<textarea className="mt-1 w-full rounded border p-2" disabled={lab.role!=="admin"} onChange={(event)=>setLabDescription(event.target.value)} value={labDescription}/></label><label className="mt-3 block text-sm font-semibold">Retention after archive<select className="mt-1 w-full rounded border p-2" disabled={lab.role!=="admin"} onChange={(event)=>setRetentionDays(event.target.value?Number(event.target.value) as 30|90|365:null)} value={retentionDays??""}><option value="">Never automatically purge</option><option value="30">Eligible after 30 days</option><option value="90">Eligible after 90 days</option><option value="365">Eligible after 365 days</option></select></label><div className="mt-3 flex flex-wrap gap-2"><button className="rounded bg-teal-900 px-4 py-2 text-white disabled:bg-slate-400" disabled={lab.role!=="admin"||!cloud.online||!labName.trim()} onClick={()=>void mutate("update-settings",{labId,name:labName,description:labDescription,retentionDays},"Lab settings updated.")}>Save lab settings</button>{lab.role==="admin"&&<button className="rounded border px-4 py-2" onClick={exportLab}>Export authorized lab data</button>}</div><p className="mt-4 text-xs">Lab exports and publication payloads never include authentication secrets, invitation token plaintext, or members’ unrelated personal records.</p></section>}
  </main>;
}

function AuditView({ audit, lab }: { audit: readonly LabAuditEvent[]; lab: LabSummary }) {
  const [query,setQuery]=useState(""); const [eventType,setEventType]=useState("");
  const values=audit.filter((item)=>(!eventType||item.eventType===eventType)&&`${item.actorName} ${item.eventType} ${item.targetType} ${JSON.stringify(item.metadata)}`.toLowerCase().includes(query.toLowerCase()));
  const exportAudit=(format:"json"|"csv")=>{const safe=values.map(({id,eventType,targetType,targetId,targetVersionId,actorName,occurredAt,metadata})=>({id,eventType,targetType,targetId,targetVersionId,actorName,occurredAt,metadata}));const text=format==="json"?JSON.stringify(safe,null,2):["occurredAt,actor,eventType,targetType,targetId",...safe.map((item)=>[item.occurredAt,item.actorName,item.eventType,item.targetType,item.targetId??""].map((value)=>`"${String(value).replaceAll('"','""')}"`).join(","))].join("\n");downloadText(safeExportFilename(`${lab.name}-audit`,format),text,format==="json"?"application/json":"text/csv");};
  if(lab.role==="viewer")return <section className="mt-4 rounded border p-4"><h2 className="text-xl font-bold">Publication history</h2><p className="mt-2">Viewers receive publication history through immutable version records rather than raw administrative audit metadata.</p></section>;
  return <section className="mt-4"><div className="flex flex-wrap gap-2"><input aria-label="Search audit history" className="min-w-64 flex-1 rounded border p-2" onChange={(event)=>setQuery(event.target.value)} placeholder="Actor, event, target, or safe metadata" value={query}/><select aria-label="Audit event type" className="rounded border p-2" onChange={(event)=>setEventType(event.target.value)} value={eventType}><option value="">All event types</option>{[...new Set(audit.map((item)=>item.eventType))].sort().map((item)=><option key={item}>{item}</option>)}</select>{lab.role==="admin"&&<><button className="rounded border px-3" onClick={()=>exportAudit("csv")}>Export redacted CSV</button><button className="rounded border px-3" onClick={()=>exportAudit("json")}>Export redacted JSON</button></>}</div><ol className="mt-4 space-y-2">{values.map((item)=><li className="rounded border bg-white p-3" key={item.id}><div className="flex flex-wrap gap-2"><strong>{item.eventType}</strong><span>· {item.actorName}</span><time className="ml-auto" dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString()} ({Intl.DateTimeFormat().resolvedOptions().timeZone})</time></div><p className="text-xs">{item.targetType}{item.targetId?` · ${item.targetId.slice(0,8)}…`:""}</p><details className="mt-2"><summary>Safe metadata</summary><pre className="mt-2 overflow-auto rounded bg-slate-100 p-2 text-xs">{JSON.stringify(item.metadata,null,2)}</pre></details></li>)}</ol></section>;
}

export function AcceptLabInvitation({ token }: { token: string }) {
  const router=useRouter(); const [message,setMessage]=useState("Ready to verify this private lab invitation.");
  return <main className="mx-auto max-w-xl p-6"><h1 className="text-2xl font-bold">Accept private lab invitation</h1><p className="mt-3">Acceptance requires the signed-in email to match the invitation. Expired, revoked, or previously used invitations are rejected.</p><p aria-live="polite" className="mt-4 rounded border p-3">{message}</p><button className="mt-4 rounded bg-teal-900 px-4 py-2 font-semibold text-white" onClick={()=>void labApi.action<{labId:string}>("accept-invitation",{token,requestId:requestId()}).then(({labId})=>router.push(`/labs/${labId}/library`)).catch((error)=>setMessage(error instanceof Error?error.message:"Invitation could not be accepted."))}>Accept invitation</button></main>;
}
