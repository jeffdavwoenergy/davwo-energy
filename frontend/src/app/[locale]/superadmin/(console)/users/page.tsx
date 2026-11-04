"use client";

import { useMemo, useState } from "react";
import { Link2 } from "lucide-react";
import { useOverview, formatDate } from "@/lib/superAdminApi";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, ErrorBox, EmptyBox } from "@/components/shared/Panel";
import StatusPill from "@/components/shared/StatusPill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, FilterSelect, SearchBox, UserActions } from "@/components/superadmin/parts";

export default function SuperAdminUsersPage() {
  const { data, error } = useOverview();
  const [q, setQ] = useState("");
  const [org, setOrg] = useState("all");
  const [role, setRole] = useState("all");

  const users = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.users ?? []).filter((u) =>
      (org === "all" || u.orgId === org) &&
      (role === "all" || u.role === role) &&
      (!needle || [u.name, u.email, u.orgName, u.job_title].some((f) => f?.toLowerCase().includes(needle))),
    );
  }, [data, q, org, role]);

  if (error) return <ErrorBox message="Could not load users." />;

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Every Ask ANI™ account across all organisations. Change roles, reset passwords or remove access."
        status={data ? [
          { label: "Total", value: data.stats.users },
          { label: "Admins", value: data.stats.admins },
        ] : []}
      />

      <Panel bodyClassName="p-0">
        <div className="p-4 flex flex-col sm:flex-row gap-3 border-b border-border">
          <SearchBox value={q} onChange={setQ} placeholder="Search name, email or organisation" />
          <FilterSelect
            value={org}
            onChange={setOrg}
            allLabel="All organisations"
            className="sm:w-56"
            options={(data?.organisations ?? []).map((o) => ({ value: o.id, label: o.name }))}
          />
          <FilterSelect
            value={role}
            onChange={setRole}
            allLabel="All roles"
            className="sm:w-40"
            options={[{ value: "admin", label: "Admin" }, { value: "operator", label: "Operator" }, { value: "pilot", label: "Pilot" }]}
          />
        </div>

        {!data ? <div className="p-4"><Skeleton className="h-64" /></div> : users.length === 0 ? <EmptyBox message="No users match these filters." /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">User</TableHead>
                <TableHead>Organisation</TableHead>
                <TableHead className="hidden md:table-cell">Joined</TableHead>
                <TableHead className="text-right pr-4">Role &amp; actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-3 min-w-[200px]">
                      <Avatar name={u.name} />
                      <div className="min-w-0">
                        <div className="font-medium flex items-center gap-1.5">
                          <span className="truncate">{u.name}</span>
                          {u.demo && <StatusPill tone="neutral" dot={false}>Demo</StatusPill>}
                          {u.linkedSupplierId && (
                            <span title="Also has a linked Supplier Portal account" className="text-sky-600"><Link2 size={14} /></span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{u.email}{u.job_title ? ` · ${u.job_title}` : ""}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{u.orgName}</div>
                    <div className="text-xs text-muted-foreground font-mono">{u.orgId}</div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{formatDate(u.createdAt)}</TableCell>
                  <TableCell className="pr-4"><UserActions user={u} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
