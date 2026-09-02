"use client";

import { useState } from "react";
import {
  Droplets, Shirt, Flame, Utensils, Dumbbell, Wind, BookOpen, Zap, Sun, Moon,
  ListChecks, Pill, Users, Footprints, PenLine, Sparkles, Cross, Activity,
  Phone, Target, Shield, Coffee, Star, Mountain, Compass, Book, Headphones,
  TreePine, Clock, Refrigerator, Snowflake, Thermometer, SprayCan, Banknote,
  ClipboardCheck, Package, Toilet, Trash2, PowerOff, LockKeyhole, Bug,
  HelpCircle, ChevronDown, X, type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  "droplets":   Droplets,
  "shirt":      Shirt,
  "flame":      Flame,
  "utensils":   Utensils,
  "dumbbell":   Dumbbell,
  "wind":       Wind,
  "book-open":  BookOpen,
  "zap":        Zap,
  "sun":        Sun,
  "moon":       Moon,
  "list-checks": ListChecks,
  "pill":       Pill,
  "users":      Users,
  "footprints": Footprints,
  "pen-line":   PenLine,
  "sparkles":   Sparkles,
  "cross":      Cross,
  "activity":   Activity,
  "phone":      Phone,
  "target":     Target,
  "shield":     Shield,
  "coffee":     Coffee,
  "star":       Star,
  "mountain":   Mountain,
  "compass":    Compass,
  "book":       Book,
  "headphones": Headphones,
  "tree-pine":  TreePine,
  "clock":      Clock,
  // Restaurant task-catalog icons — see lib/seed-templates.ts/lib/seed.ts,
  // which use these keys instead of raw emoji for every seeded task.
  "refrigerator":    Refrigerator,
  "snowflake":       Snowflake,
  "thermometer":     Thermometer,
  "spray-can":       SprayCan,
  "banknote":        Banknote,
  "clipboard-check": ClipboardCheck,
  "package":         Package,
  "toilet":          Toilet,
  "trash-2":         Trash2,
  "power-off":       PowerOff,
  "lock-keyhole":    LockKeyhole,
  "bug":             Bug,
  "help-circle":     HelpCircle,
};

export const ICON_NAMES = Object.keys(ICON_MAP);

interface Props {
  name: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export default function AppIcon({ name, size = 18, strokeWidth = 1.75, className = "" }: Props) {
  const Icon = ICON_MAP[name];
  if (!Icon) {
    // Graceful fallback for any legacy emoji still in the DB
    return (
      <span className={`leading-none select-none ${className}`} style={{ fontSize: size * 0.9 }}>
        {name}
      </span>
    );
  }
  return <Icon size={size} strokeWidth={strokeWidth} className={className} />;
}

// Icon picker used in AddTaskSheet and TaskListEditView — a compact trigger
// showing just the currently selected icon, not the full ~40-icon grid
// inline. The grid only appears in an overlay sheet on tap, so it doesn't
// add to the surrounding form's scroll length; it closes itself the moment
// an icon is picked.
export function IconPicker({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 bg-bg border border-border rounded-card px-3 py-2.5 hover:border-border-light transition-colors"
      >
        <div className="w-9 h-9 flex items-center justify-center rounded-card bg-olive/10 border border-olive/30 text-olive flex-shrink-0">
          <AppIcon name={selected} size={18} strokeWidth={1.75} />
        </div>
        <span className="flex-1 text-left font-body text-sm text-text">Change icon</span>
        <ChevronDown size={14} className="text-dim flex-shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[60]" onClick={() => setOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[61] max-w-mobile mx-auto">
            <div className="bg-card rounded-t-modal max-h-[70vh] flex flex-col">
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-border-light" />
              </div>
              <div className="flex items-center justify-between px-4 pb-3 flex-shrink-0">
                <h3 className="font-heading text-base text-text">Choose an Icon</h3>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-dim min-h-[44px] min-w-[44px] flex items-center justify-end"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="px-4 pb-8 overflow-y-auto">
                <div className="grid grid-cols-6 gap-1.5">
                  {ICON_NAMES.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        onSelect(name);
                        setOpen(false);
                      }}
                      className={`flex items-center justify-center w-10 h-10 rounded-card transition-colors ${
                        selected === name
                          ? "bg-olive/20 border border-olive/50 text-olive"
                          : "bg-bg border border-border text-dim hover:border-border-light hover:text-muted"
                      }`}
                      aria-label={name}
                    >
                      <AppIcon name={name} size={16} strokeWidth={1.75} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
