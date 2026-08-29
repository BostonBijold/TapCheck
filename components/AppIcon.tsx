import {
  Droplets, Shirt, Flame, Utensils, Dumbbell, Wind, BookOpen, Zap, Sun, Moon,
  ListChecks, Pill, Users, Footprints, PenLine, Sparkles, Cross, Activity,
  Phone, Target, Shield, Coffee, Star, Mountain, Compass, Book, Headphones,
  TreePine, Clock, Refrigerator, Snowflake, Thermometer, SprayCan, Banknote,
  ClipboardCheck, Package, Toilet, Trash2, PowerOff, LockKeyhole, Bug,
  HelpCircle, type LucideIcon,
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

// Reusable picker grid used in AddTaskSheet and TaskListEditView
export function IconPicker({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (name: string) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {ICON_NAMES.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => onSelect(name)}
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
  );
}
