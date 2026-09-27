"use client";

import { Camera, Heart } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { SpecIcon } from "./SpecIcon";
import { formatGBP, type MpProduct } from "@/lib/marketplaceMock";

interface ProductCardProps {
  product: MpProduct;
  contractType: "personal" | "business";
  isSaved: boolean;
  onToggleSave: (e: React.MouseEvent, id: string) => void;
}

export function ProductCard({ product, contractType, isSaved, onToggleSave }: ProductCardProps) {
  const vatMultiplier = contractType === "business" ? 1 / 1.2 : 1;
  const monthlyPrice = Math.round(product.baseMonthlyPrice * vatMultiplier);
  const initialPayment = Math.round(product.baseInitialPayment * vatMultiplier);
  const vatText = contractType === "business" ? "Per month (ex. VAT)" : "Per month (inc. VAT)";
  const gridItems = product.specsGrid.slice(0, 6);

  return (
    <Link
      href={`/marketplace/${product.id}`}
      data-testid={`product-card-${product.id}`}
      className="group bg-white rounded-xl border border-slate-200/90 hover:border-emerald-300 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col overflow-hidden text-left"
    >
      {/* Studio image */}
      <div className="relative aspect-[16/11] w-full bg-[#eef0f3] overflow-hidden flex items-center justify-center">
        <div className="absolute top-2.5 left-2.5 z-10 bg-slate-900/75 text-white text-[11px] font-semibold px-2 py-0.5 rounded flex items-center gap-1 shadow-xs">
          <Camera className="w-3.5 h-3.5" />
          <span>{product.photosCount}</span>
        </div>

        <button
          type="button"
          data-testid={`product-save-${product.id}`}
          onClick={(e) => onToggleSave(e, product.id)}
          className="absolute top-2.5 right-2.5 z-10 p-1.5 rounded-full bg-white/80 hover:bg-white text-slate-700 hover:text-red-600 transition-colors shadow-xs"
          title={isSaved ? "Remove from saved" : "Save item"}
        >
          <Heart className={`w-4 h-4 ${isSaved ? "fill-red-600 text-red-600" : "text-slate-600"}`} />
        </button>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.images[0]}
          alt={`${product.brand} ${product.model}`}
          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
      </div>

      {/* Content */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-2 mb-2.5">
            <div>
              <span className="block text-[11px] font-medium text-slate-500">From</span>
              <div className="text-[26px] font-black tracking-tight text-[#0c132b] leading-tight">{formatGBP(monthlyPrice)}</div>
              <span className="block text-[10px] text-slate-500 font-medium">{vatText}</span>
            </div>

            <div className="text-right">
              {initialPayment > 0 ? (
                <span className="block text-xs font-bold text-slate-900 leading-tight">{formatGBP(initialPayment)} upfront</span>
              ) : (
                <span className="block text-xs font-bold text-emerald-700 leading-tight">£0 deposit option</span>
              )}
              <span className="block text-[11px] text-slate-500 mt-0.5">{product.contractMonths} month term</span>
              {product.annualMileage ? (
                <span className="block text-[11px] text-slate-500">{product.annualMileage.toLocaleString()} miles p/a</span>
              ) : product.outrightPrice ? (
                <span className="block text-[11px] text-slate-600 font-medium">or {formatGBP(product.outrightPrice)} buy</span>
              ) : (
                <span className="block text-[11px] text-slate-500">Flexible agreement</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
            <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded">{product.categoryLabel}</span>
            <span className="bg-emerald-50 text-emerald-800 text-[10px] font-semibold px-2 py-0.5 rounded truncate max-w-[200px]">
              {product.deliveryEstimate}
            </span>
          </div>

          <h3 className="text-[15px] font-bold text-slate-950 group-hover:text-emerald-700 transition-colors leading-snug line-clamp-1">
            {product.brand} {product.model}
          </h3>
          <p className="text-xs text-slate-600 mt-0.5 line-clamp-1 mb-3.5 font-normal">{product.version}</p>
        </div>

        <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-y-2 text-xs text-slate-700">
          {gridItems.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2 pr-1 min-w-0">
              <SpecIcon icon={item.icon} />
              <span className="truncate text-[12px] font-medium text-slate-800" title={item.value}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Link>
  );
}
