"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "@/i18n/navigation";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import api from "@/lib/api";
import type { Block } from "@/lib/ani/blocks";
import { streamChat } from "@/lib/ani/streamChat";
import RenderBlock from "@/components/ani/RenderBlock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Msg { role: "user" | "assistant"; text?: string; blocks?: Block[]; }
interface BriefingItem {
  observation: string; explanation: string; recommendation: string;
  impact: { savings_gbp?: number; carbon_pct?: number; confidence_pct: number };
  severity: "high" | "medium" | "low";
}
interface Briefing { greeting: string; learning_line: string; items: BriefingItem[]; }

// Per-page quick prompts — ANI already knows the context of where you are.
const PROMPTS: Record<string, string[]> = {
  "/dashboard": ["Generate an executive summary", "Show optimisation opportunities", "Which assets need attention?"],
  "/monitoring": ["Which sites need attention?", "Any faults right now?", "Show utilisation by station"],
  "/analytics": ["Why did energy costs change?", "Compare today with last week", "What's powering the grid?"],
  "/forecasting": ["Explain today's forecast", "When is peak demand?", "What's driving demand?"],
  "/alerts": ["Which assets need attention?", "Summarise the top risks", "What needs maintenance?"],
  "/assets": ["Which assets are underutilised?", "Show asset health", "Where can I optimise?"],
  "/map": ["Which sites need attention?", "Show network status", "Any offline stations?"],
  "/marketplace": ["Show marketplace recommendations", "Which partners fit my profile?"],
  "/reports": ["Generate an executive summary", "Compare today with last week"],
  "/settings": ["How is the network doing today?", "Show optimisation opportunities"],
  "/demo": ["How is the network doing today?", "What's the lowest-cost charging window?"],
};
const DEFAULT_PROMPTS = ["How is the network doing today?", "What's the lowest-cost charging window?", "Which assets need attention?"];

const SEV_DOT = { high: "bg-red-500", medium: "bg-amber-500", low: "bg-sky-500" } as const;
const pageName = (p: string) => (p.split("/")[1] || "dashboard").replace(/-/g, " ");

export default function FloatingAni() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const prompts = PROMPTS[Object.keys(PROMPTS).find((p) => pathname.startsWith(p)) ?? ""] ?? DEFAULT_PROMPTS;

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading, briefing]);

  // Proactive: fetch the overnight briefing the first time the panel opens.
  useEffect(() => {
    if (open && !briefing) {
      api.get<Briefing>("/ani/briefing").then((r) => setBriefing(r.data)).catch(() => {});
    }
  }, [open, briefing]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }, { role: "assistant", text: "" }]);
    setLoading(true);
    try {
      await streamChat(
        q,
        pathname,
        (chunk) => setMessages((m) => {
          const next = [...m];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, text: (last.text ?? "") + chunk };
          return next;
        }),
        (answer) => setMessages((m) => {
          const next = [...m];
          next[next.length - 1] = { role: "assistant", blocks: answer.blocks };
          return next;
        }),
        (detail) => setMessages((m) => {
          const next = [...m];
          next[next.length - 1] = { role: "assistant", text: detail };
          return next;
        }),
      );
    } catch {
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = { role: "assistant", text: "Sorry — I couldn't reach the data services just now." };
        return next;
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {!open && (
        <Button
          onClick={() => setOpen(true)}
          aria-label="Open Ask ANI"
          className="fixed bottom-5 right-5 z-40 gap-2 rounded-full pl-3 pr-4 py-5 shadow-lg"
        >
          <MessageCircle size={16} />
          <span className="text-sm font-semibold">Ask ANI</span>
        </Button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-40 w-[calc(100vw-2.5rem)] sm:w-[420px] h-[70vh] max-h-[640px] bg-card text-card-foreground rounded-2xl shadow-2xl border flex flex-col overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between border-b">
            <div>
              <div className="text-sm font-semibold leading-tight">Ask ANI</div>
              <div className="text-[10px] text-muted-foreground leading-tight capitalize">context: {pageName(pathname)}</div>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)} aria-label="Close">
              <X size={16} />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto sidebar-scroll p-3 space-y-3">
            {/* Proactive briefing */}
            {messages.length === 0 && (
              briefing ? (
                <div className="space-y-2.5">
                  <p className="text-sm text-foreground/90"><span className="font-semibold">{briefing.greeting}</span> {briefing.learning_line}</p>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Today&apos;s priorities</p>
                  {briefing.items.map((it, i) => (
                    <div key={i} className="rounded-xl border border-border p-3">
                      <div className="flex items-start gap-2">
                        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${SEV_DOT[it.severity]}`} />
                        <div className="min-w-0 text-xs leading-relaxed">
                          <div className="text-foreground font-medium">{it.observation}</div>
                          <div className="text-muted-foreground mt-0.5">{it.explanation}</div>
                          <div className="mt-1 text-emerald-500"><span className="font-semibold">Recommended:</span> {it.recommendation}</div>
                          <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                            {it.impact.savings_gbp != null && <span>≈ £{it.impact.savings_gbp.toLocaleString()}</span>}
                            {it.impact.carbon_pct != null && <span>−{it.impact.carbon_pct}% carbon</span>}
                            <span>{it.impact.confidence_pct}% confidence</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Analysing your network…</div>
              )
            )}

            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                {m.role === "user" ? (
                  <div className="bg-primary text-primary-foreground text-sm rounded-2xl rounded-br-sm px-3 py-2 max-w-[85%]">{m.text}</div>
                ) : (
                  <div className="space-y-2 max-w-full">
                    {m.text && <p className="text-sm text-foreground/90">{m.text}</p>}
                    {m.blocks?.map((b, j) => <RenderBlock key={j} block={b} />)}
                  </div>
                )}
              </div>
            ))}
            {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" /> ANI is thinking…</div>}
            <div ref={endRef} />
          </div>

          {/* Suggested prompts */}
          <div className="px-3 pt-2 flex flex-wrap gap-1.5 border-t">
            {prompts.map((p) => (
              <Button key={p} variant="outline" size="sm" onClick={() => send(p)} disabled={loading}
                className="h-auto text-[11px] px-2.5 py-1 font-normal rounded-full">
                {p}
              </Button>
            ))}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="p-3 flex items-center gap-2">
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Ask about ${pageName(pathname)}…`}
              className="flex-1 rounded-xl h-10" />
            <Button type="submit" size="icon" disabled={loading || !input.trim()} className="rounded-xl shrink-0">
              <Send size={16} />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
