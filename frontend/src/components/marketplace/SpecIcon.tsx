import {
  Zap,
  Plug,
  Activity,
  ShieldCheck,
  CheckCircle2,
  Home,
  Battery,
  Sun,
  Layers,
  Gauge,
  Car,
  MapPin,
  Armchair,
} from "lucide-react";

export function SpecIcon({ icon, className = "w-3.5 h-3.5 text-slate-700 shrink-0" }: { icon?: string; className?: string }) {
  switch (icon) {
    case "zap":
    case "fuel":
      return <Zap className={className} />;
    case "plug":
      return <Plug className={className} />;
    case "activity":
      return <Activity className={className} />;
    case "shield":
      return <ShieldCheck className={className} />;
    case "check":
      return <CheckCircle2 className={className} />;
    case "home":
      return <Home className={className} />;
    case "battery":
      return <Battery className={className} />;
    case "sun":
      return <Sun className={className} />;
    case "layers":
      return <Layers className={className} />;
    case "gauge":
      return <Gauge className={className} />;
    case "car":
      return <Car className={className} />;
    case "metric":
      return <MapPin className={className} />;
    case "seats":
      return <Armchair className={className} />;
    case "gearbox":
      return (
        <span className={`flex items-center justify-center ${className}`}>
          <svg viewBox="0 0 24 24" className="w-full h-full stroke-current fill-none stroke-2">
            <line x1="6" y1="4" x2="6" y2="20" />
            <line x1="18" y1="4" x2="18" y2="20" />
            <line x1="12" y1="4" x2="12" y2="20" />
            <line x1="6" y1="12" x2="18" y2="12" />
          </svg>
        </span>
      );
    case "door":
      return (
        <span className={`flex items-center justify-center ${className}`}>
          <svg viewBox="0 0 24 24" className="w-full h-full stroke-current fill-none stroke-2">
            <rect x="5" y="3" width="14" height="18" rx="2" />
            <circle cx="15" cy="12" r="1" fill="currentColor" />
          </svg>
        </span>
      );
    default:
      return <CheckCircle2 className={className} />;
  }
}
