"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  LifeBuoy,
  Mail,
  MessageCircle,
  BookOpen,
  Send,
  Clock,
  ArrowUpRight,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import PageHeader from "@/components/shared/PageHeader";
import GlowCard from "@/components/shared/GlowCard";
import StatusPill from "@/components/shared/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const CHANNELS = [
  {
    icon: Mail,
    tone: "bg-skytint text-sky-600",
    title: "Email support",
    detail: "support@davwo.com",
    caption: "Replies within 1 business day",
  },
  {
    icon: MessageCircle,
    tone: "bg-mint text-emerald-600",
    title: "Ask ANI\u2122",
    detail: "In-app assistant",
    caption: "Instant answers, 24/7",
    href: "/ai-assistant",
  },
  {
    icon: BookOpen,
    tone: "bg-lavender text-purple-600",
    title: "Knowledge base",
    detail: "Guides & docs",
    caption: "Setup, integrations & FAQs",
  },
];

export default function SupportPage() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      toast.error("Please add a subject and a short message.");
      return;
    }
    toast.success("Support ticket submitted \u2014 our team will be in touch shortly.");
    setSubject("");
    setMessage("");
  };

  return (
    <div>
      <PageHeader
        title="Support"
        subtitle="Get help from the DAVWO team, or reach ANI™ for instant answers."
        right={<StatusPill tone="success">Avg. response &lt; 1 day</StatusPill>}
      />

      {/* Contact channels */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {CHANNELS.map((c) => {
          const Icon = c.icon;
          const inner = (
            <GlowCard className="p-5 h-full" onClick={c.href ? () => {} : undefined}>
              <div className="flex items-start justify-between">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.tone}`}>
                  <Icon size={20} strokeWidth={1.8} />
                </div>
                {c.href && <ArrowUpRight size={16} className="text-muted-foreground" />}
              </div>
              <div className="mt-4 text-sm font-semibold text-foreground">{c.title}</div>
              <div className="text-sm text-foreground/70 mt-0.5">{c.detail}</div>
              <div className="text-xs text-muted-foreground mt-1">{c.caption}</div>
            </GlowCard>
          );
          return c.href ? (
            <Link key={c.title} href={c.href} className="block h-full">
              {inner}
            </Link>
          ) : (
            <div key={c.title} className="h-full">
              {inner}
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        {/* Open ticket */}
        <GlowCard className="p-6 lg:col-span-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <LifeBuoy size={14} /> Your tickets
          </div>
          <div className="mt-4 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Onboarding walkthrough</span>
              <StatusPill tone="warning">Open</StatusPill>
            </div>
            <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
              <Clock size={12} /> Opened 2 days ago · 1 unread reply
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Resolved tickets are archived automatically after 30 days.
          </p>
        </GlowCard>

        {/* New ticket form */}
        <GlowCard className="p-6 lg:col-span-2">
          <h2 className="text-sm font-semibold text-foreground">Open a new ticket</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tell us what you need and we&apos;ll route it to the right team.
          </p>
          <form onSubmit={submit} className="mt-4 space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground/80">Subject</label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Briefly describe the issue"
                className="mt-1.5 rounded-xl"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground/80">Message</label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Share any details, asset IDs or steps to reproduce…"
                rows={5}
                className="mt-1.5 rounded-xl resize-none"
              />
            </div>
            <Button type="submit" className="gap-2">
              <Send size={16} /> Submit ticket
            </Button>
          </form>
        </GlowCard>
      </div>
    </div>
  );
}
