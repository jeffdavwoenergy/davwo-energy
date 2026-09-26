"use client";

import { useState } from "react";
import useSWR from "swr";
import { AlertCircle, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import type { AxiosInstance } from "axios";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface KBEntry {
  id: string;
  issue: string;
  symptoms?: string;
  resolution: string;
}

/** Add/list known issues + resolutions for a product. Shared between the
 * admin manage page (/marketplace/products/[id]/knowledgebase) and the
 * supplier dashboard (/supplier/products/[id]/knowledgebase) — same
 * feature, different caller owning the product, so `client` and `basePath`
 * are passed in rather than hardcoded. */
export default function ProductKnowledgeBase({ productId, basePath, client }: { productId: string; basePath: string; client: AxiosInstance }) {
  const { data, mutate } = useSWR<{ entries: KBEntry[] }>(`${basePath}/${productId}/knowledgebase`, (url: string) => client.get(url).then((r) => r.data));
  const [open, setOpen] = useState(false);
  const [issue, setIssue] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [resolution, setResolution] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await client.post(`${basePath}/${productId}/knowledgebase`, { issue, symptoms: symptoms || undefined, resolution });
      toast.success("Known issue added");
      setIssue(""); setSymptoms(""); setResolution("");
      await mutate();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Could not add that entry.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <AlertCircle size={13} /> Known issues {data ? `(${data.entries.length})` : ""} <ChevronDown size={12} className={open ? "rotate-180 transition" : "transition"} />
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {data?.entries.map((e) => (
            <div key={e.id} className="rounded-lg bg-accent p-2.5 text-xs">
              <div className="font-semibold text-foreground">{e.issue}</div>
              {e.symptoms && <div className="text-muted-foreground mt-0.5">Symptoms: {e.symptoms}</div>}
              <div className="text-muted-foreground mt-0.5">Fix: {e.resolution}</div>
            </div>
          ))}
          <form onSubmit={submit} className="space-y-1.5 pt-1">
            <Input required placeholder="Issue (e.g. Won't power on)" value={issue} onChange={(ev) => setIssue(ev.target.value)}
              className="h-auto px-2.5 py-1.5 text-xs" />
            <Input placeholder="Symptoms (optional)" value={symptoms} onChange={(ev) => setSymptoms(ev.target.value)}
              className="h-auto px-2.5 py-1.5 text-xs" />
            <Textarea required rows={2} placeholder="Resolution" value={resolution} onChange={(ev) => setResolution(ev.target.value)}
              className="px-2.5 py-1.5 text-xs resize-none" />
            <Button type="submit" variant="link" disabled={saving} className="h-auto p-0 text-xs font-semibold">
              {saving ? "Adding…" : "+ Add known issue"}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
