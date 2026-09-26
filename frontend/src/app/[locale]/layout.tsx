import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import "../globals.css";
import { routing } from "@/i18n/routing";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "DAVWO / ANI™ — Energy Infrastructure Intelligence",
  description:
    "Monitor, analyse, predict, recommend and optimise EV-charging, battery, solar and grid assets — powered by ANI™.",
  icons: { icon: "/davwo-icon.png" },
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Enables static rendering for this locale (next-intl reads the locale
  // from context on the server rather than needing it threaded manually).
  setRequestLocale(locale);

  return (
    <html lang={locale} className="dark">
      <body className="font-sans min-h-screen bg-background text-foreground">
        <NextIntlClientProvider>
          <AuthProvider>{children}</AuthProvider>
          <Toaster richColors position="top-right" />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
