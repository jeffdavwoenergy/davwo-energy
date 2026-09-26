"use client";

import React, { useState } from "react";

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  defaultGlow?: boolean;
  glowOnHover?: boolean;
  onClick?: () => void;
}

// Ambient card glow — a single, soft light-green wash (adapted from the
// reference dashboard's multi-colour "rainbow" glow, deliberately reduced to
// one glowing light green per the design brief).
const GREEN_GLOW =
  "linear-gradient(135deg, #bbf7d0 0%, #86efac 20%, #4ade80 44%, #22c55e 66%, #34d399 86%, #6ee7b7 100%)";

export default function GlowCard({
  children,
  className = "",
  defaultGlow = false,
  glowOnHover = true,
  onClick,
}: GlowCardProps) {
  const [hovered, setHovered] = useState(false);
  const active = defaultGlow || (glowOnHover && hovered);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`relative group h-full rounded-2xl transition-all duration-300 ${onClick ? "cursor-pointer" : ""}`}
    >
      {/* Ambient diffuse green glow */}
      <div
        aria-hidden="true"
        className={`absolute -inset-[3px] rounded-[22px] transition-all duration-500 pointer-events-none -z-10 ${
          active ? "opacity-70 blur-xl scale-[1.01]" : "opacity-0 blur-md scale-95"
        }`}
        style={{ background: GREEN_GLOW }}
      />
      {/* Gradient border ring — a soft light-green edge that's always faintly
          on (so the card "stands out" like the reference hero card) and
          brightens into a full ring when glowing. */}
      <div
        aria-hidden="true"
        className={`absolute rounded-[19px] pointer-events-none transition-all duration-300 ${
          active ? "-inset-[1.5px] opacity-100" : "-inset-[1px] opacity-45"
        }`}
        style={{ background: GREEN_GLOW }}
      />
      {/* Inner surface */}
      <div
        className={`relative w-full h-full bg-card rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-shadow duration-300 ${
          active ? "shadow-[0_10px_34px_rgba(16,185,129,0.14)]" : ""
        } ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
