"use client";

import { motion } from "framer-motion";

interface LogoProps {
  compact?: boolean;
  stacked?: boolean;
  className?: string;
}

export default function Logo({ compact = false, stacked = false, className = "" }: LogoProps) {
  if (stacked) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={`inline-flex flex-col items-center ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/davwo-logo.png" alt="DAVWO" className="h-32 lg:h-40 w-auto" draggable={false} />
      </motion.div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <motion.img
        initial={{ rotate: -6, opacity: 0 }}
        animate={{ rotate: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        src="/davwo-icon-white.png"
        alt="DAVWO mark"
        className="h-9 w-auto select-none"
        draggable={false}
      />
      {!compact && (
        <div className="leading-none">
          <div className="font-display font-bold text-2xl tracking-tight text-foreground">
            DAVWO
          </div>
        </div>
      )}
    </div>
  );
}
