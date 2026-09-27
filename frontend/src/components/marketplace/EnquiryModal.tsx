"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { formatGBP, type MpProduct, type CalculatedPricing } from "@/lib/marketplaceMock";

const KEY = "davwo_enquiries";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: MpProduct | null;
  mode: "application" | "contact";
  pricing?: CalculatedPricing | null;
  configSummary?: string;
}

export function EnquiryModal({ open, onOpenChange, product, mode, pricing, configSummary }: Props) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (open) {
      setName(user?.name || "");
      setEmail(user?.email || "");
      setPhone("");
      setMessage(
        mode === "application"
          ? `I'd like to start an application for the ${product?.brand} ${product?.model}.`
          : `I have a question about the ${product?.brand} ${product?.model}.`,
      );
      setSubmitted(false);
    }
  }, [open, user, product, mode]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    const entry = {
      id: `enq-${Date.now()}`,
      productId: product.id,
      productName: `${product.brand} ${product.model}`,
      mode,
      name,
      email,
      phone,
      message,
      config: configSummary || null,
      monthly: pricing?.monthlyPayment ?? null,
      createdAt: new Date().toISOString(),
    };
    try {
      const existing = JSON.parse(window.localStorage.getItem(KEY) || "[]");
      window.localStorage.setItem(KEY, JSON.stringify([entry, ...existing]));
    } catch {
      window.localStorage.setItem(KEY, JSON.stringify([entry]));
    }
    setSubmitted(true);
    toast.success(mode === "application" ? "Application request sent" : "Enquiry sent", {
      description: "The Davwo team will be in touch shortly.",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="enquiry-modal">
        {submitted ? (
          <div className="py-6 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Thanks, {name.split(" ")[0] || "there"}!</h3>
            <p className="text-sm text-slate-600 mt-1.5">
              Your {mode === "application" ? "application request" : "enquiry"} for the{" "}
              <strong className="text-slate-900">
                {product?.brand} {product?.model}
              </strong>{" "}
              has been logged. A Davwo advisor will contact you soon.
            </p>
            <Button className="mt-5 w-full" data-testid="enquiry-done-btn" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{mode === "application" ? "Start your application" : "Contact us"}</DialogTitle>
              <DialogDescription>
                {product?.brand} {product?.model} — {product?.version}
                {pricing ? ` · from ${formatGBP(pricing.monthlyPayment, 2)}/mo` : ""}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={submit} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="enq-name">Full name</Label>
                <Input id="enq-name" data-testid="enquiry-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="enq-email">Email</Label>
                  <Input id="enq-email" type="email" data-testid="enquiry-email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="enq-phone">Phone</Label>
                  <Input id="enq-phone" data-testid="enquiry-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enq-message">Message</Label>
                <Textarea id="enq-message" data-testid="enquiry-message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
              </div>
              {configSummary && (
                <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <span className="font-semibold text-slate-800">Your configuration:</span> {configSummary}
                </div>
              )}
              <Button type="submit" className="w-full gap-2" data-testid="enquiry-submit">
                <Send className="w-4 h-4" /> {mode === "application" ? "Submit application" : "Send enquiry"}
              </Button>
              <p className="text-[11px] text-slate-400 text-center">
                Preview only — no real transaction is made. Your details are stored locally for this demo.
              </p>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
