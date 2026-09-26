"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe2 } from "lucide-react";

const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
};

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Select
      value={locale}
      onValueChange={(next) => {
        router.replace(pathname, { locale: next as Locale });
      }}
    >
      <SelectTrigger
        aria-label="Language"
        className="hidden sm:flex h-9 w-auto gap-1.5 border-none bg-transparent px-2 shadow-none hover:bg-accent focus:ring-0"
      >
        <Globe2 size={16} className="text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {routing.locales.map((l) => (
          <SelectItem key={l} value={l}>{LOCALE_LABEL[l]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
