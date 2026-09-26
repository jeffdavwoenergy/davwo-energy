"use client";

import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft, Star, ShieldCheck, MapPin, Globe, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { fetcher } from "@/lib/swr";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/shared/PageHeader";
import Panel, { Skeleton, ErrorBox } from "@/components/shared/Panel";
import type { Vendor } from "@/lib/server/marketplace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function VendorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { data: vendor, error } = useSWR<Vendor>(id ? `/marketplace/vendors/${id}` : null, fetcher);

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendor) return;
    setSending(true);
    try {
      await api.post("/marketplace/contact", { vendorId: vendor.id, name, email, message });
      setSent(true);
      setMessage("");
      toast.success(`Message sent to ${vendor.name}`);
    } catch {
      toast.error("Could not send your message — please try again.");
    } finally {
      setSending(false);
    }
  };

  if (error) {
    return (
      <div>
        <Button variant="link" onClick={() => router.push("/marketplace")} className="h-auto p-0 gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft size={15} /> Back to Marketplace
        </Button>
        <ErrorBox message="Could not load this vendor." />
      </div>
    );
  }

  if (!vendor) {
    return (
      <div>
        <Skeleton className="h-10 w-40 mb-4" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div>
      <Link href="/marketplace" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 w-fit">
        <ArrowLeft size={15} /> Back to Marketplace
      </Link>

      <PageHeader
        title={vendor.name}
        subtitle={vendor.tagline}
        right={
          vendor.verified ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 rounded-full px-3 py-1.5">
              <ShieldCheck size={13} /> Verified Partner
            </span>
          ) : undefined
        }
      />

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Panel title="About">
            <p className="text-sm text-muted-foreground leading-relaxed">{vendor.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {vendor.highlights.map((h) => (
                <span key={h} className="text-xs bg-accent text-muted-foreground border border-border rounded-full px-2.5 py-1">
                  {h}
                </span>
              ))}
            </div>
          </Panel>

          <Panel title="Details">
            <dl className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Rating</dt>
                <dd className="flex items-center gap-1 font-medium text-foreground">
                  <Star size={14} className="text-amber-500 fill-amber-500" />
                  {vendor.rating.toFixed(1)} ({vendor.reviews} reviews)
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Region</dt>
                <dd className="flex items-center gap-1 font-medium text-foreground">
                  <MapPin size={14} /> {vendor.region}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Website</dt>
                <dd className="flex items-center gap-1 font-medium text-foreground truncate">
                  <Globe size={14} /> {vendor.website.replace(/^https?:\/\//, "")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Email</dt>
                <dd className="flex items-center gap-1 font-medium text-foreground truncate">
                  <Mail size={14} /> {vendor.contact_email}
                </dd>
              </div>
            </dl>
          </Panel>
        </div>

        <Panel title="Contact Vendor" subtitle="Send an enquiry — no payment or booking required.">
          {sent ? (
            <div className="text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 rounded-xl p-4">
              Thanks — your message has been sent to {vendor.name}. They&apos;ll follow up by email.
              {" "}
              <Link href="/marketplace/enquiries" className="font-semibold underline">Track it in My Enquiries →</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Your name</label>
                <Input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Message</label>
                <Textarea
                  required
                  rows={4}
                  maxLength={1000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={`Tell ${vendor.name} what you're looking for…`}
                  className="mt-1 resize-none"
                />
              </div>
              <Button type="submit" disabled={sending} className="w-full gap-2">
                <Send size={15} /> {sending ? "Sending…" : "Send Enquiry"}
              </Button>
            </form>
          )}
        </Panel>
      </div>
    </div>
  );
}
