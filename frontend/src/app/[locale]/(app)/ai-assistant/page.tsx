"use client";

import { useRef, useState, useEffect } from "react";
import { MessageCircle, Send, Radio, FlaskConical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { Block } from "@/lib/ani/blocks";
import { streamChat } from "@/lib/ani/streamChat";
import PageHeader from "@/components/shared/PageHeader";
import RenderBlock from "@/components/ani/RenderBlock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Msg {
  role: "user" | "assistant";
  text?: string;
  blocks?: Block[];
  mode?: "live-llm" | "deterministic";
}

interface HistoryItem {
  role: "user" | "assistant";
  content: { text?: string; blocks?: Block[]; mode?: "live-llm" | "deterministic" };
}

const SUGGESTED = [
  "How is the network doing today?",
  "When's the cheapest time to charge?",
  "What's the live grid carbon right now?",
  "Show me the demand forecast",
  "Which sites need attention?",
  "What's powering the grid?",
];

export default function AiAssistantPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<{ items: HistoryItem[] }>("/ani/chat")
      .then(({ data }) => {
        setMessages(data.items.map((h) => ({ role: h.role, text: h.content.text, blocks: h.content.blocks, mode: h.content.mode })));
      })
      .catch(() => {})
      .finally(() => setHistoryLoaded(true));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }, { role: "assistant", text: "" }]);
    setLoading(true);
    try {
      await streamChat(
        q,
        window.location.pathname,
        (chunk) => setMessages((m) => {
          const next = [...m];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, text: (last.text ?? "") + chunk };
          return next;
        }),
        (answer) => setMessages((m) => {
          const next = [...m];
          next[next.length - 1] = { role: "assistant", blocks: answer.blocks, mode: answer.mode };
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
        next[next.length - 1] = { role: "assistant", text: "Sorry — I couldn't reach the data services just now. Please try again." };
        return next;
      });
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = async () => {
    try {
      await api.delete("/ani/chat");
      setMessages([]);
      toast.success("Conversation cleared");
    } catch {
      toast.error("Could not clear the conversation — please try again.");
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)]">
      <PageHeader
        title="Ask ANI™"
        subtitle="Ask about the network — answers come back as live charts, tables and KPIs."
        right={historyLoaded && messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearHistory} className="gap-1.5 text-muted-foreground">
            <Trash2 size={13} /> Clear conversation
          </Button>
        )}
      />

      <div className="flex-1 overflow-y-auto sidebar-scroll pr-1 space-y-4">
        {historyLoaded && messages.length === 0 && (
          <div className="bg-gradient-to-br from-navy to-navy-2 text-white rounded-2xl p-6">
            <div className="flex items-center gap-2 text-emerald-300 text-sm font-semibold">
              <MessageCircle size={18} /> ANI™
            </div>
            <p className="mt-2 text-slate-200 text-sm max-w-xl">
              I answer with live data — grid carbon, tariffs, demand forecasts, station health and
              recommendations — rendered as charts and tables, not walls of text. Try one of these:
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTED.map((s) => (
                <Button
                  key={s}
                  variant="secondary"
                  size="sm"
                  onClick={() => send(s)}
                  className="h-auto rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="bg-emerald-500 text-white rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[80%] text-sm">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={i} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-navy text-emerald-300 flex items-center justify-center shrink-0">
                <MessageCircle size={16} />
              </div>
              <div className="flex-1 min-w-0 bg-card border border-border rounded-2xl rounded-tl-sm shadow-sm p-4 space-y-3">
                {m.blocks?.map((b, bi) => <RenderBlock key={bi} block={b} />)}
                {m.text && <p className="text-sm text-foreground/90">{m.text}</p>}
                {m.mode && (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1">
                    {m.mode === "live-llm" ? (
                      <><Radio size={11} className="text-emerald-500" /> AI narration over live data</>
                    ) : (
                      <><FlaskConical size={11} /> Rule-based over live data</>
                    )}
                  </div>
                )}
              </div>
            </div>
          ),
        )}

        {loading && !messages[messages.length - 1]?.text && !messages[messages.length - 1]?.blocks && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-navy text-emerald-300 flex items-center justify-center shrink-0">
              <MessageCircle size={16} />
            </div>
            <div className="bg-card border border-border rounded-2xl rounded-tl-sm shadow-sm px-4 py-3 flex items-center gap-1.5">
              {[0, 1, 2].map((d) => (
                <span key={d} className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-soft-pulse" style={{ animationDelay: `${d * 0.2}s` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="mt-4 flex items-center gap-2 bg-card border border-border rounded-2xl p-2 shadow-sm"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask ANI™ about carbon, pricing, forecast, stations…"
          className="flex-1 border-0 shadow-none focus-visible:ring-0 bg-transparent"
        />
        <Button type="submit" size="icon" disabled={loading || !input.trim()} className="rounded-xl shrink-0" aria-label="Send">
          <Send size={16} />
        </Button>
      </form>
    </div>
  );
}
