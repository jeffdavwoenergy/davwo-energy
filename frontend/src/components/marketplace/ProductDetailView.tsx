"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  Camera,
  Grid,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  Truck,
  CheckCircle,
  Shield,
  Heart,
  List,
  Star,
  X,
  Leaf,
} from "lucide-react";
import { SpecIcon } from "./SpecIcon";
import { EnquiryModal } from "./EnquiryModal";
import {
  calcPricing,
  formatGBP,
  type MpProduct,
  type Customization,
} from "@/lib/marketplaceMock";
import { useSavedProducts } from "@/lib/useSavedProducts";

/**
 * `preview`: the supplier portal's full-listing preview. Renders inside a
 * dialog, so the pricing card stays in place (no floating/sticky window
 * chrome), buyer actions are inert, and the sections that are the same on
 * every listing (breadcrumbs, Davwo card, "How it works") are left out —
 * only what the supplier's own listing data drives is shown.
 */
export function ProductDetailView({ product, basePath = "/marketplace", preview = false }: { product: MpProduct; basePath?: string; preview?: boolean }) {
  const { isSaved, toggle } = useSavedProducts();
  const colors = product.colors ?? [];

  const [customization, setCustomization] = useState<Customization>({
    contractType: "personal",
    color: colors[0]?.name || "Standard",
    annualMileage: product.annualMileage || 5000,
    contractMonths: product.contractMonths || 36,
    upfrontMonths: 12,
    includeMaintenance: false,
    quantity: 1,
  });

  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [showAllSpecs, setShowAllSpecs] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [enquiry, setEnquiry] = useState<{ open: boolean; mode: "application" | "contact" }>({ open: false, mode: "application" });

  const toggleFaq = (k: string) => setOpenFaq((p) => (p === k ? null : k));

  const pricing = calcPricing(product, customization);

  const currentColorObj = colors.find((c) => c.name === customization.color);
  const activeHeroImage =
    currentColorObj?.image && selectedImageIndex === 0 ? currentColorObj.image : product.images[selectedImageIndex] || product.images[0];

  const termWord = product.termType === "lease" ? "lease" : product.termType === "subscription" ? "subscription" : "finance";
  const priceLabel = `${customization.contractType === "business" ? "Business" : "Personal"} ${termWord} ${pricing.vatLabel}`;

  const configSummary = [
    colors.length ? customization.color : null,
    `${customization.contractMonths} months`,
    `${customization.upfrontMonths}mo upfront`,
    product.annualMileage ? `${customization.annualMileage.toLocaleString()} miles p/a` : null,
    customization.includeMaintenance ? "with maintenance" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Floating pricing card dock behaviour
  const rightColumnRef = useRef<HTMLDivElement>(null);
  const cardSlotRef = useRef<HTMLDivElement>(null);
  const [isDockedRaw, setIsDocked] = useState(false);
  const isDocked = preview || isDockedRaw;
  const [columnRect, setColumnRect] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const update = () => {
      if (rightColumnRef.current) {
        const rect = rightColumnRef.current.getBoundingClientRect();
        if (rect.width > 50) setColumnRect({ left: rect.left, width: rect.width });
      }
      if (cardSlotRef.current) {
        const slotRect = cardSlotRef.current.getBoundingClientRect();
        const slotHeight = slotRect.height || 190;
        const dockThreshold = window.innerHeight - slotHeight - 16;
        setIsDocked(slotRect.top <= dockThreshold);
      }
    };
    update();
    const t1 = setTimeout(update, 50);
    const t2 = setTimeout(update, 200);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && rightColumnRef.current) {
      ro = new ResizeObserver(update);
      ro.observe(rightColumnRef.current);
    }
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (ro) ro.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const resetToLowest = () =>
    setCustomization((prev) => ({
      ...prev,
      contractMonths: product.contractMonths,
      upfrontMonths: 12,
      annualMileage: product.annualMileage || 5000,
      includeMaintenance: false,
    }));

  const monthlyBeforeMaint = pricing.monthlyPayment - pricing.maintenanceMonthly;

  const renderPricingCard = (isFloating: boolean) => (
    <div
      className={`w-full bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 transition-shadow ${
        isFloating ? "shadow-2xl" : "shadow-sm"
      }`}
      data-testid="pricing-card"
    >
      <div className="flex items-start justify-between gap-3 lg:gap-4 mb-3">
        <div>
          <span className="block text-[12px] text-slate-600 font-medium">{priceLabel}</span>
          <div className="text-[28px] sm:text-3xl lg:text-[34px] font-black text-[#0c132b] leading-tight tracking-tight mt-0.5" data-testid="pricing-monthly">
            {formatGBP(pricing.monthlyPayment, 2)}
          </div>
          <span className="text-[12px] text-slate-500 font-normal">per month</span>
        </div>
        <div className="text-right text-[12px] space-y-1">
          <div className="text-slate-800">
            <span className="font-bold text-[#0c132b]">{formatGBP(pricing.initialPayment, 2)}</span> initial payment
          </div>
          <div className="text-slate-700">
            <span className="font-bold text-[#0c132b]">{customization.contractMonths}</span> month contract
          </div>
          {product.annualMileage ? (
            <div className="text-slate-700">
              <span className="font-bold text-[#0c132b]">{customization.annualMileage.toLocaleString()}</span> miles per year
            </div>
          ) : product.outrightPrice ? (
            <div className="text-slate-700">
              or <span className="font-bold text-[#0c132b]">{formatGBP(product.outrightPrice)}</span> outright
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[13px] text-slate-900 mb-3.5">
        <span className="w-2.5 h-2.5 rounded-full bg-[#008a00] shrink-0 mr-1" />
        <span className="font-bold text-[#0c132b]">In stock</span>
        <span className="text-slate-700 truncate">{product.deliveryStockNote.replace(/^In stock\s*[—-]\s*/i, "- ")}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          data-testid="start-application-btn"
          onClick={() => !preview && setEnquiry({ open: true, mode: "application" })}
          className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold py-3 px-4 rounded-full text-[14px] transition-all text-center shadow-xs cursor-pointer truncate"
        >
          Start application
        </button>
        <button
          type="button"
          data-testid="contact-us-btn"
          onClick={() => !preview && setEnquiry({ open: true, mode: "contact" })}
          className="w-full bg-white hover:bg-emerald-50 active:scale-[0.99] border-2 border-emerald-600 text-emerald-700 font-bold py-3 px-4 rounded-full text-[14px] transition-all text-center cursor-pointer truncate"
        >
          Contact us
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-full text-[#171c26] text-[14px]" data-testid="product-detail">
      {!preview && (
      <>
      {/* Breadcrumb + heart */}
      <div className="flex items-center justify-between py-1 mb-4 text-[13px] text-slate-700">
        <nav className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-none font-medium">
          <Link href={basePath} className="text-emerald-700 hover:underline">
            Marketplace
          </Link>
          <span className="text-slate-400">/</span>
          <Link href={basePath} className="text-emerald-700 hover:underline">
            {product.categoryLabel}
          </Link>
          <span className="text-slate-400">/</span>
          <span className="text-slate-900 font-semibold truncate max-w-[180px] sm:max-w-none">
            {product.brand} {product.model}
          </span>
        </nav>
        <button
          onClick={() => toggle(product.id)}
          data-testid="detail-save-btn"
          className="p-1 text-red-600 hover:text-red-700 transition-colors shrink-0 ml-3 cursor-pointer"
          title={isSaved(product.id) ? "Remove from saved" : "Save product"}
        >
          <Heart className={`w-6 h-6 ${isSaved(product.id) ? "fill-red-600" : "stroke-red-600 fill-none"}`} />
        </button>
      </div>

      </>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 md:gap-6 lg:gap-8 items-start">
        {/* LEFT */}
        <div className="sm:col-span-7 space-y-6">
          {/* Hero */}
          <div className="relative aspect-[4/3] sm:aspect-[16/11] w-full bg-[#eef0f3] rounded-2xl overflow-hidden flex items-center justify-center border border-slate-200/90 shadow-sm">
            <button
              onClick={() => setShowGallery(true)}
              className="absolute top-4 left-4 z-10 bg-[#353945]/85 hover:bg-[#23262f] text-white text-[13px] font-semibold px-3 py-1 rounded-md flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>{product.photosCount}</span>
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={activeHeroImage} alt={`${product.brand} ${product.model}`} className="w-full h-full object-cover object-center transition-all duration-300" />
            <button
              onClick={() => setShowGallery(true)}
              data-testid="view-gallery-btn"
              className="absolute bottom-4 right-4 z-10 bg-white hover:bg-slate-50 text-slate-900 border border-slate-300 shadow-sm text-[13px] font-bold px-4 py-1.5 rounded-full inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Grid className="w-4 h-4 text-slate-800" />
              <span>View gallery</span>
            </button>
          </div>

          {/* Thumbnails */}
          <div className="grid grid-cols-2 gap-4">
            <div
              onClick={() => setSelectedImageIndex(1 < product.images.length ? 1 : 0)}
              className="relative aspect-[16/10] rounded-2xl overflow-hidden bg-[#eef0f3] border border-slate-200/90 cursor-pointer hover:border-emerald-400 transition-colors shadow-sm group"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={product.images[1] || product.images[0]} alt="Detail view" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            </div>
            <div
              onClick={() => setSelectedImageIndex(2 < product.images.length ? 2 : 0)}
              className="relative aspect-[16/10] rounded-2xl overflow-hidden bg-[#eef0f3] border border-slate-200/90 cursor-pointer hover:border-emerald-400 transition-colors shadow-sm group"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={product.images[2] || product.images[0]} alt="Alternate view" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            </div>
          </div>

          {!preview && (
          <>
          <p className="text-[13px] text-slate-500 leading-normal">
            Images are for illustration purposes only. Actual product finish and colours may vary slightly.
          </p>

          </>
          )}
          {!preview && (
          <>
          {/* Davwo brand card */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-[16px]">
              <Leaf className="w-5 h-5 text-emerald-600" />
              <span className="font-extrabold tracking-tight text-[#0c132b]">Davwo Marketplace</span>
            </div>
            <div className="text-[13px] text-slate-600 font-medium mt-1">Certified supply, install &amp; monitoring included</div>
          </div>

          </>
          )}
          {/* Badges + title */}
          <div className="space-y-1.5 pt-0.5">
            <div className="flex items-center gap-2">
              <span className="bg-emerald-50 text-emerald-800 text-[12px] font-semibold px-2.5 py-1 rounded-[4px] capitalize">{termWord} deal</span>
              <span className="bg-[#eef1f6] text-[#0c132b] text-[12px] font-semibold px-2.5 py-1 rounded-[4px]">Brand new</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0c132b] tracking-tight">
              {product.brand} {product.model}
            </h1>
            <p className="text-[15px] sm:text-[16px] text-[#475569] font-normal">{product.version}</p>
          </div>

          {/* Overview */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm">
            <h2 className="text-xl font-bold text-[#0c132b] mb-6">Overview</h2>
            <div className="grid grid-cols-2 gap-y-6 gap-x-8 text-[13px] sm:text-[14px]">
              {product.specsGrid.map((item, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <SpecIcon icon={item.icon} className="w-5 h-5 text-slate-800 shrink-0 mt-0.5" />
                  <div>
                    <span className="block text-slate-500 text-[13px] font-medium">{item.label}</span>
                    <span className="font-bold text-slate-900 text-[15px]">{item.value}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 pt-5 border-t border-slate-100">
              <button
                onClick={() => setShowAllSpecs(true)}
                data-testid="view-all-specs-btn"
                className="w-full flex items-center justify-between text-[14px] font-bold text-slate-900 hover:text-emerald-700 transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <List className="w-4 h-4 text-slate-800 group-hover:text-emerald-700" />
                  <span>View all spec and features</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-700" />
              </button>
            </div>
          </div>

          {/* Features + technical breakdown */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm space-y-6">
            <div>
              <h2 className="text-xl font-bold text-[#0c132b] mb-2">Key features &amp; inclusions</h2>
              <p className="text-[13px] text-slate-600 leading-relaxed mb-4">
                Full specifications and package inclusions verified by certified Davwo installers.
              </p>
              <ul className="space-y-2.5">
                {(product.features || []).map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[13px] text-slate-800">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
            {product.detailedSpecs && (
              <div className="pt-4 border-t border-slate-100">
                <h3 className="text-[15px] font-bold text-[#0c132b] mb-3">Technical breakdown</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {Object.entries(product.detailedSpecs).map(([k, v]) => (
                    <div key={k} className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-slate-500 block mb-0.5 font-medium">{k}</span>
                      <strong className="text-slate-900 font-semibold">{v}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {!preview && (
          <>
          {/* How it works */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm">
            <h2 className="text-xl font-bold text-[#0c132b] mb-2">How it works</h2>
            <p className="text-[13px] text-slate-600 leading-relaxed mb-5">
              Getting set up with Davwo has never been easier. Customise your terms, apply online for a fast decision, and let our
              certified team handle survey, install and ongoing monitoring.
            </p>
            <div className="divide-y divide-slate-100">
              <div className="py-3.5">
                <button
                  onClick={() => toggleFaq("process")}
                  className="w-full flex items-center justify-between text-[14px] font-bold text-slate-900 hover:text-emerald-700 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Truck className="w-4 h-4 text-slate-800" />
                    <span>The process</span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${openFaq === "process" ? "rotate-180" : ""}`} />
                </button>
                {openFaq === "process" && (
                  <div className="pt-3 text-[13px] text-slate-600 space-y-2 animate-in fade-in duration-150">
                    <p>1. <strong>Customise your terms:</strong> Choose contract length, upfront amount and options.</p>
                    <p>2. <strong>Apply online:</strong> Complete a quick application for a fast decision.</p>
                    <p>3. <strong>Survey &amp; install:</strong> Our certified team handles the full installation and handover.</p>
                  </div>
                )}
              </div>
              <div className="py-3.5">
                <button
                  onClick={() => toggleFaq("what-you-get")}
                  className="w-full flex items-center justify-between text-[14px] font-bold text-slate-900 hover:text-emerald-700 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Shield className="w-4 h-4 text-slate-800" />
                    <span>What you get</span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${openFaq === "what-you-get" ? "rotate-180" : ""}`} />
                </button>
                {openFaq === "what-you-get" && (
                  <div className="pt-3 text-[13px] text-slate-600 space-y-1.5 animate-in fade-in duration-150">
                    <p>• Certified hardware supplied and fully installed</p>
                    <p>• Manufacturer warranty and Davwo support cover</p>
                    <p>• Live performance monitoring in your dashboard</p>
                    <p>• Free mainland UK survey and delivery</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          </>
          )}
          {/* Expert review */}
          {product.rating && (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm">
              <h2 className="text-xl font-bold text-[#0c132b] mb-3">
                Expert review for the {product.brand} {product.model}
              </h2>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-3xl font-black text-[#0c132b]">{product.rating}</span>
                <Star className="w-5 h-5 fill-amber-400 text-amber-400 inline-block -translate-y-0.5" />
              </div>
              <p className="text-[13px] text-slate-600 leading-relaxed">
                This rating comes from the Davwo product team, based on running costs, reliability, efficiency and overall value.
              </p>
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div ref={rightColumnRef} className="sm:col-span-5 space-y-6">
          {/* Configurator */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm">
            <h2 className="text-xl font-bold text-[#0c132b] mb-4">Customise your plan</h2>

            <div className="grid grid-cols-2 p-1 bg-white border border-slate-200 rounded-xl mb-5">
              {(["personal", "business"] as const).map((ct) => (
                <button
                  key={ct}
                  type="button"
                  data-testid={`config-contract-${ct}`}
                  onClick={() => setCustomization((p) => ({ ...p, contractType: ct }))}
                  className={`py-2.5 text-[14px] font-bold rounded-lg transition-colors cursor-pointer capitalize ${
                    customization.contractType === ct
                      ? "border-2 border-emerald-600 bg-white text-emerald-700 font-extrabold shadow-sm"
                      : "text-slate-600 hover:text-slate-900 border-2 border-transparent"
                  }`}
                >
                  {ct} {termWord}
                </button>
              ))}
            </div>

            {colors.length > 0 && (
              <div className="mb-5">
                <label className="block text-[14px] font-semibold text-slate-900 mb-1.5">Colour</label>
                <div className="relative">
                  <select
                    value={customization.color}
                    data-testid="config-color"
                    onChange={(e) => {
                      setCustomization((p) => ({ ...p, color: e.target.value }));
                      setSelectedImageIndex(0);
                    }}
                    className="w-full appearance-none bg-white border border-slate-300 rounded-xl px-4 py-3 text-[14px] font-medium text-slate-900 pr-10 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 cursor-pointer shadow-sm"
                  >
                    {colors.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                </div>
              </div>
            )}

            {product.annualMileage ? (
              <div className="mb-5">
                <label className="block text-[14px] font-semibold text-slate-900 mb-1.5">What&rsquo;s your expected annual mileage?</label>
                <div className="relative">
                  <select
                    value={customization.annualMileage}
                    data-testid="config-mileage"
                    onChange={(e) => setCustomization((p) => ({ ...p, annualMileage: Number(e.target.value) }))}
                    className="w-full appearance-none bg-white border border-slate-300 rounded-xl px-4 py-3 text-[14px] font-medium text-slate-900 pr-10 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 cursor-pointer shadow-sm"
                  >
                    {[5000, 8000, 10000, 12000, 15000, 20000].map((m) => (
                      <option key={m} value={m}>
                        {m.toLocaleString()} per year
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                </div>
              </div>
            ) : (
              <div className="mb-5 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-700 space-y-1">
                <span className="font-bold text-slate-900 block">Installation &amp; package</span>
                <p className="text-slate-600">{product.deliveryStockNote}</p>
              </div>
            )}

            <div className="mb-5">
              <label className="block text-[14px] font-semibold text-slate-900 mb-0.5">How long would you like the contract? (months)</label>
              <p className="text-[13px] text-slate-600 mb-2">
                {customization.contractMonths} months / {(customization.contractMonths / 12).toFixed(customization.contractMonths % 12 ? 1 : 0)} years
              </p>
              <div className="grid grid-cols-4 gap-2">
                {[24, 36, 48, 60].map((m) => (
                  <button
                    key={m}
                    type="button"
                    data-testid={`config-term-${m}`}
                    onClick={() => setCustomization((p) => ({ ...p, contractMonths: m }))}
                    className={`h-12 flex items-center justify-center text-[14px] font-bold rounded-lg transition-all cursor-pointer ${
                      customization.contractMonths === m
                        ? "border-2 border-emerald-600 text-emerald-700 bg-white font-black shadow-sm"
                        : "border border-slate-300 text-slate-700 hover:border-slate-400 bg-white"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-[14px] font-semibold text-slate-900 mb-0.5">How much would you like to pay upfront?</label>
              <p className="text-[13px] text-slate-600 mb-2">
                {customization.upfrontMonths} months / {formatGBP(pricing.initialPayment, 2)}
              </p>
              <div className="grid grid-cols-5 gap-2">
                {[1, 3, 6, 9, 12].map((u) => (
                  <button
                    key={u}
                    type="button"
                    data-testid={`config-upfront-${u}`}
                    onClick={() => setCustomization((p) => ({ ...p, upfrontMonths: u }))}
                    className={`h-12 flex items-center justify-center text-[14px] font-bold rounded-lg transition-all cursor-pointer ${
                      customization.upfrontMonths === u
                        ? "border-2 border-emerald-600 text-emerald-700 bg-white font-black shadow-sm"
                        : "border border-slate-300 text-slate-700 hover:border-slate-400 bg-white"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <button
                type="button"
                data-testid="config-reset"
                onClick={resetToLowest}
                className="text-[13px] font-semibold text-emerald-700 hover:text-emerald-800 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span className="underline">Reset to lowest monthly price</span>
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {product.maintenanceCost > 0 && (
              <div className="pt-4 border-t border-slate-200">
                <span className="block text-[13px] font-semibold text-slate-800 mb-2">Would you like to include a maintenance plan?</span>
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    data-testid="config-maintenance"
                    checked={customization.includeMaintenance}
                    onChange={(e) => setCustomization((p) => ({ ...p, includeMaintenance: e.target.checked }))}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="text-[13px] text-slate-700">
                    Yes, add {product.maintenanceLabel} for{" "}
                    <strong className="font-bold text-slate-900">{formatGBP(product.maintenanceCost, 2)} per month</strong>
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* Order summary */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm space-y-4">
            <h2 className="text-xl font-bold text-[#0c132b]">Order summary</h2>
            <div>
              <h3 className="text-[14px] font-bold text-slate-900 mb-1">Your choice</h3>
              <p className="text-[13px] text-slate-800 font-medium leading-relaxed">
                {product.brand} {product.model} {product.version}
              </p>
              {colors.length > 0 && <p className="text-[12px] text-slate-500 mt-0.5">{customization.color}</p>}
            </div>

            <div className="border-t border-slate-100" />

            <div>
              <h3 className="text-[14px] font-bold text-slate-900 mb-2">Contract</h3>
              <div className="space-y-1.5 text-[13px]">
                <div className="flex justify-between text-slate-600">
                  <span>Contract length</span>
                  <span className="font-semibold text-slate-900">{customization.contractMonths} months</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Contract type</span>
                  <span className="font-semibold text-slate-900 capitalize">
                    {customization.contractType} {termWord}
                  </span>
                </div>
                {product.annualMileage && (
                  <div className="flex justify-between text-slate-600">
                    <span>Annual mileage</span>
                    <span className="font-semibold text-slate-900">{customization.annualMileage.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>Expected delivery</span>
                  <span className="font-semibold text-slate-900 text-right max-w-[55%]">{product.deliveryEstimate}</span>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100" />

            <div>
              <h3 className="text-[14px] font-bold text-slate-900 mb-2">Upfront payment(s)</h3>
              <div className="space-y-1.5 text-[13px]">
                <div className="flex justify-between text-slate-600">
                  <span>Initial payment</span>
                  <span className="font-semibold text-slate-900">{formatGBP(pricing.initialPayment, 2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Initial maintenance</span>
                  <span className="text-slate-500">{customization.includeMaintenance ? formatGBP(product.maintenanceCost, 2) : "Not selected"}</span>
                </div>
                <div className="flex justify-between text-slate-900 pt-1 font-bold text-[14px]">
                  <span>Total initial payment</span>
                  <span>{formatGBP(pricing.initialPayment + (customization.includeMaintenance ? product.maintenanceCost : 0), 2)}</span>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100" />

            <div>
              <h3 className="text-[14px] font-bold text-slate-900 mb-2">Monthly payment</h3>
              <div className="space-y-1.5 text-[13px]">
                <div className="flex justify-between text-slate-600">
                  <span>Monthly price</span>
                  <span className="font-semibold text-slate-900">{formatGBP(monthlyBeforeMaint, 2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Monthly maintenance</span>
                  <span className="text-slate-500">{customization.includeMaintenance ? formatGBP(pricing.maintenanceMonthly, 2) : "Not selected"}</span>
                </div>
                <div className="flex justify-between text-slate-900 pt-1 font-bold text-[14px]">
                  <span>Total monthly payment</span>
                  <span>{formatGBP(pricing.monthlyPayment, 2)}</span>
                </div>
                <div className="text-[12px] text-slate-500 pt-0.5">Payable for {customization.contractMonths - 1} months</div>
              </div>
            </div>
          </div>

          {/* Dock slot */}
          <div ref={cardSlotRef} className="w-full">
            {isDocked ? (
              renderPricingCard(false)
            ) : (
              <div className="invisible pointer-events-none" aria-hidden="true">
                {renderPricingCard(false)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating pricing card (tablet/desktop) */}
      {!isDocked && (
        <div
          className="hidden sm:block fixed bottom-4 z-30 transition-[left,width] duration-75 ease-out"
          style={
            columnRect && columnRect.width > 100
              ? { left: `${columnRect.left}px`, width: `${columnRect.width}px` }
              : { right: "1.5rem", width: "400px", maxWidth: "calc(100vw - 3rem)" }
          }
        >
          {renderPricingCard(true)}
        </div>
      )}

      {/* Mobile sticky bar */}
      {!isDocked && (
        <div className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200/90 shadow-2xl p-3.5">
          <div className="flex items-start justify-between gap-4 mb-2.5">
            <div>
              <span className="block text-[11px] text-slate-500 font-medium">{priceLabel}</span>
              <div className="text-2xl font-extrabold text-[#0c132b] leading-tight tracking-tight">{formatGBP(pricing.monthlyPayment, 2)}</div>
              <span className="text-[11px] text-slate-500">per month</span>
            </div>
            <div className="text-right text-[11px] space-y-0.5">
              <div className="font-bold text-[#0c132b]">{formatGBP(pricing.initialPayment, 2)} initial</div>
              <div className="text-slate-600">{customization.contractMonths} month contract</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => !preview && setEnquiry({ open: true, mode: "application" })}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-full text-[13px] transition-all text-center shadow-xs cursor-pointer"
            >
              Start application
            </button>
            <button
              type="button"
              onClick={() => !preview && setEnquiry({ open: true, mode: "contact" })}
              className="w-full bg-white border-2 border-emerald-600 text-emerald-700 font-bold py-2.5 px-4 rounded-full text-[13px] transition-all text-center cursor-pointer"
            >
              Contact us
            </button>
          </div>
        </div>
      )}

      {/* Gallery modal */}
      {showGallery && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowGallery(false)}>
          <div className="bg-white rounded-2xl max-w-3xl w-full p-5 shadow-2xl relative max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowGallery(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 cursor-pointer z-10">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-[#0c132b] mb-4">
              {product.brand} {product.model} gallery
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {product.images.map((img, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={img} alt={`View ${i + 1}`} className="w-full aspect-[16/11] object-cover rounded-xl bg-[#eef0f3] border border-slate-200" />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* All specs modal */}
      {showAllSpecs && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowAllSpecs(false)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowAllSpecs(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold text-[#0c132b] mb-1">Specifications &amp; equipment</h3>
            <p className="text-xs text-slate-500 mb-6">
              {product.brand} {product.model} {product.version}
            </p>
            <div className="space-y-6 text-xs">
              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-3 border-b border-slate-100 pb-1">Key specifications</h4>
                <div className="grid grid-cols-2 gap-3">
                  {product.specsGrid.map((s, i) => (
                    <div key={i} className="bg-slate-50 p-2.5 rounded-lg">
                      <span className="text-slate-500 block">{s.label}</span>
                      <strong className="text-slate-900">{s.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
              {product.detailedSpecs && (
                <div>
                  <h4 className="font-bold text-slate-900 text-sm mb-3 border-b border-slate-100 pb-1">Technical breakdown</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(product.detailedSpecs).map(([k, v]) => (
                      <div key={k} className="bg-slate-50 p-2.5 rounded-lg">
                        <span className="text-slate-500 block">{k}</span>
                        <strong className="text-slate-900">{v}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-3 border-b border-slate-100 pb-1">Standard features</h4>
                <ul className="space-y-2">
                  {(product.features || []).map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-slate-700">
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <button onClick={() => setShowAllSpecs(false)} className="mt-6 w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-full text-sm transition-colors cursor-pointer">
              Close
            </button>
          </div>
        </div>
      )}

      <EnquiryModal
        open={enquiry.open}
        onOpenChange={(v) => setEnquiry((p) => ({ ...p, open: v }))}
        product={product}
        mode={enquiry.mode}
        pricing={pricing}
        configSummary={configSummary}
      />

      {/* Spacer so floating card never covers page footer content */}
      <div className="h-4" />
    </div>
  );
}
