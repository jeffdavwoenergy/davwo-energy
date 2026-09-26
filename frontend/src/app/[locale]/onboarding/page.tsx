"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, UserPlus, ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function OnboardingPage() {
  const { user, booting } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<0 | 1>(0);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("operator");
  const [inviting, setInviting] = useState(false);
  const [invited, setInvited] = useState<string[]>([]);

  useEffect(() => {
    if (!booting && !user) router.replace("/login");
  }, [booting, user, router]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    try {
      await api.post("/users/invite", { name, email, role });
      setInvited((list) => [...list, `${name} (${email})`]);
      toast.success(`Invited ${name}`);
      setName(""); setEmail("");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Could not send the invite.");
    } finally {
      setInviting(false);
    }
  };

  if (booting || !user) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-navy text-white relative overflow-hidden flex items-center justify-center px-6 py-12">
      <div className="absolute inset-0 bg-map-dark opacity-90" />
      <div className="absolute inset-0 bg-grain" />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 w-full max-w-lg bg-card text-card-foreground rounded-2xl shadow-2xl p-8"
      >
        {step === 0 ? (
          <>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-4">
              <CheckCircle2 size={14} /> Workspace ready
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground">
              Welcome to Davwo, {user.name.split(" ")[0]}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              <b>{user.orgName}</b>&rsquo;s ANI&#8482; workspace is live — populated with a working
              dashboard, monitoring and analytics so you never start from an empty screen. A few
              things before you dive in:
            </p>
            <ul className="mt-5 space-y-3 text-sm text-foreground/80">
              <li className="flex items-start gap-2">
                <Check size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                Your dashboard already reflects a seeded synthetic network unique to your org — real
                assets sharpen every figure automatically once connected.
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                Ask ANI&#8482; anything from the assistant — it answers in charts and tables, never
                invented numbers.
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                You can invite teammates now or later from Settings → Team.
              </li>
            </ul>
            <Button onClick={() => setStep(1)} className="mt-7 w-full gap-2 py-3 h-auto">
              Continue <ArrowRight size={16} />
            </Button>
          </>
        ) : (
          <>
            <div className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-muted-foreground mb-4">
              <UserPlus size={14} /> Optional
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground">Invite your team</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Add teammates now, or skip and do this anytime from Settings.
            </p>

            {invited.length > 0 && (
              <div className="mt-4 space-y-1.5">
                {invited.map((who) => (
                  <div key={who} className="flex items-center gap-2 text-sm text-emerald-700">
                    <Check size={14} /> {who}
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={invite} className="mt-5 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <Input required placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
                <Input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger className="h-auto py-2.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="operator">Operator</SelectItem>
                  <SelectItem value="pilot">Pilot User</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" variant="outline" disabled={inviting} className="w-full gap-2 py-2.5 h-auto">
                {inviting ? <><Loader2 size={16} className="animate-spin" /> Inviting…</> : <><UserPlus size={16} /> Send invite</>}
              </Button>
            </form>

            <Button onClick={() => router.push("/dashboard")} className="mt-4 w-full gap-2 py-3 h-auto">
              Enter your dashboard <ArrowRight size={16} />
            </Button>
          </>
        )}
      </motion.div>
    </div>
  );
}
