"use client";

import { useState, useEffect, useRef } from "react";
import { X, Search, ChevronLeft } from "lucide-react";
import HabitIcon, { IconPicker } from "@/components/HabitIcon";

interface Template {
  _id: string;
  name: string;
  icon: string;
  defaultProjectedMinutes: number;
  category: string;
  timeOfDay: string;
  isSystem: boolean;
}

interface Props {
  groupId: string;
  groupName: string;
  onAdd: (
    templateId: string | null,
    name: string,
    icon: string,
    projectedMinutes: number,
    itemType: "standard" | "stopwatch" | "checkbox",
    scheduledDays: number[],
    successThreshold: number
  ) => Promise<void>;
  onClose: () => void;
}

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"]; // Sun..Sat, matches calendarWeekDates order
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const CATEGORY_LABELS: Record<string, string> = {
  hygiene: "Hygiene",
  fitness: "Fitness",
  nutrition: "Nutrition",
  mindfulness: "Mindfulness",
  reading: "Reading",
  family: "Family",
  productivity: "Productivity",
  custom: "Custom",
};

export default function AddHabitSheet({ groupId, groupName, onAdd, onClose }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"browse" | "create">("browse");
  const [adding, setAdding] = useState<string | null>(null);

  // Custom form state
  const [customIcon, setCustomIcon] = useState("star");
  const [customName, setCustomName] = useState("");
  const [customMins, setCustomMins] = useState("15");
  const [customType, setCustomType] = useState<"standard" | "stopwatch" | "checkbox">("standard");
  const [customScheduledDays, setCustomScheduledDays] = useState<number[]>(ALL_DAYS);
  const [customThreshold, setCustomThreshold] = useState(7);
  const [saving, setSaving] = useState(false);

  function toggleCustomDay(day: number) {
    setCustomScheduledDays((prev) => {
      const next = prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort();
      // Auto-follow the day count until the user deliberately lowers the
      // threshold below it — never force it back up when a day is re-added.
      setCustomThreshold((t) => Math.min(t, Math.max(next.length, 1)));
      return next;
    });
  }

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/habit-templates?groupId=${groupId}`)
      .then((r) => r.json())
      .then((data) => { setTemplates(data); setLoading(false); });
  }, [groupId]);

  useEffect(() => {
    if (view === "browse") searchRef.current?.focus();
  }, [view]);

  const filtered = templates.filter((t) =>
    search.trim() === "" || t.name.toLowerCase().includes(search.toLowerCase())
  );

  // Group by category
  const byCategory = filtered.reduce<Record<string, Template[]>>((acc, t) => {
    const key = t.isSystem ? t.category : "custom";
    acc[key] = acc[key] ?? [];
    acc[key].push(t);
    return acc;
  }, {});

  const handleAddTemplate = async (t: Template) => {
    setAdding(t._id);
    // Browsing a template skips the schedule/threshold prompt — every day,
    // full threshold — same as today's behavior; editable afterward.
    await onAdd(t._id, t.name, t.icon, t.defaultProjectedMinutes, "standard", ALL_DAYS, 7);
    setAdding(null);
  };

  const handleSaveCustom = async () => {
    if (!customName.trim() || !customIcon) return;
    setSaving(true);
    // First create the template in the catalog
    const res = await fetch("/api/habit-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: customName.trim(),
        icon: customIcon,
        defaultProjectedMinutes: customType === "standard" ? (parseInt(customMins) || 15) : 0,
        category: "custom",
        timeOfDay: "any",
      }),
    });
    const template = await res.json();
    await onAdd(template._id, template.name, template.icon, template.defaultProjectedMinutes, customType, customScheduledDays, customThreshold);
    setSaving(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 max-w-mobile mx-auto">
        <div className="bg-card rounded-t-modal max-h-[80vh] flex flex-col">
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-border-light" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 pb-3 flex-shrink-0">
            {view === "create" ? (
              <button
                onClick={() => setView("browse")}
                className="flex items-center gap-1 text-muted font-body text-sm min-h-[44px]"
              >
                <ChevronLeft size={16} />
                Back
              </button>
            ) : (
              <h2 className="font-heading text-lg text-text">
                Add to {groupName}
              </h2>
            )}
            <button onClick={onClose} className="text-dim min-h-[44px] min-w-[44px] flex items-center justify-end">
              <X size={18} />
            </button>
          </div>

          {view === "browse" ? (
            <>
              {/* Create custom CTA */}
              <div className="px-4 mb-3 flex-shrink-0">
                <button
                  onClick={() => setView("create")}
                  className="w-full flex items-center gap-3 bg-olive/10 border border-olive/30 text-olive py-3 px-4 rounded-card font-body text-sm"
                >
                  <span className="text-lg">+</span>
                  Create custom habit
                </button>
              </div>

              {/* Search */}
              <div className="px-4 mb-3 flex-shrink-0">
                <div className="flex items-center gap-2 bg-bg border border-border rounded-card px-3 py-2">
                  <Search size={14} className="text-dim flex-shrink-0" />
                  <input
                    ref={searchRef}
                    type="text"
                    placeholder="Search habits..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="flex-1 bg-transparent font-body text-sm text-text placeholder:text-dim outline-none"
                  />
                </div>
              </div>

              {/* Results */}
              <div className="overflow-y-auto px-4 pb-8">
                {loading && (
                  <p className="text-dim font-mono text-xs text-center py-8">Loading catalog…</p>
                )}

                {!loading && filtered.length === 0 && (
                  <p className="text-dim font-mono text-xs text-center py-8">
                    No habits match &ldquo;{search}&rdquo;
                  </p>
                )}

                {Object.entries(byCategory).map(([category, items]) => (
                  <div key={category} className="mb-5">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-2">
                      {CATEGORY_LABELS[category] ?? category}
                    </p>
                    <div className="bg-bg rounded-card divide-y divide-border overflow-hidden">
                      {items.map((t) => (
                        <div key={t._id} className="flex items-center gap-3 px-3 py-3">
                          <div className="w-7 flex items-center justify-center flex-shrink-0">
                            <HabitIcon name={t.icon} size={17} className="text-muted" />
                          </div>
                          <span className="flex-1 font-body text-sm text-text">{t.name}</span>
                          <span className="font-mono text-dim text-xs flex-shrink-0">
                            {t.defaultProjectedMinutes}m
                          </span>
                          <button
                            onClick={() => handleAddTemplate(t)}
                            disabled={adding === t._id}
                            className="ml-2 bg-olive/15 hover:bg-olive/30 border border-olive/30 text-olive font-mono text-xs px-3 py-1.5 rounded-pill transition-colors disabled:opacity-50 flex-shrink-0"
                          >
                            {adding === t._id ? "…" : "Add"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            /* Create custom form */
            <div className="px-4 pb-8 overflow-y-auto">
              <p className="font-mono text-dim text-xs mb-6">
                This habit will be saved to your personal catalog.
              </p>

              <div className="space-y-4">
                {/* Type */}
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-2">
                    Type
                  </label>
                  <div className="flex bg-bg border border-border rounded-card p-0.5">
                    <button
                      type="button"
                      onClick={() => setCustomType("standard")}
                      className={`flex-1 py-2 rounded-card font-mono text-xs transition-colors ${
                        customType === "standard" ? "bg-olive text-text" : "text-dim"
                      }`}
                    >
                      ▶ Countdown
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomType("stopwatch")}
                      className={`flex-1 py-2 rounded-card font-mono text-xs transition-colors ${
                        customType === "stopwatch" ? "bg-olive text-text" : "text-dim"
                      }`}
                    >
                      ⏱ Stopwatch
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomType("checkbox")}
                      className={`flex-1 py-2 rounded-card font-mono text-xs transition-colors ${
                        customType === "checkbox" ? "bg-olive text-text" : "text-dim"
                      }`}
                    >
                      ✓ Checkbox
                    </button>
                  </div>
                  <p className="font-mono text-[9px] text-dim mt-1.5">
                    {customType === "standard"
                      ? "Set a target. Timer counts down. Tracks projected vs actual."
                      : customType === "stopwatch"
                      ? "No target. Counts up. Builds a picture of how long things actually take."
                      : "No timer. Tap to mark done. Simple ✓/✗ tracking."}
                  </p>
                </div>

                {/* Icon */}
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-2">
                    Icon
                  </label>
                  <IconPicker selected={customIcon} onSelect={setCustomIcon} />
                </div>

                {/* Name */}
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-2">
                    Habit name
                  </label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. Drink creatine"
                    className="w-full bg-bg border border-border rounded-card px-3 py-2.5 font-body text-sm text-text placeholder:text-dim outline-none focus:border-olive"
                  />
                </div>

                {/* Time — timed only */}
                {customType === "standard" && ( // minutes only for countdown
                  <div>
                    <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-2">
                      Target minutes
                    </label>
                    <input
                      type="number"
                      value={customMins}
                      onChange={(e) => setCustomMins(e.target.value)}
                      min={1}
                      className="w-28 bg-bg border border-border rounded-card px-3 py-2.5 font-mono text-sm text-text outline-none focus:border-olive"
                    />
                  </div>
                )}

                {/* Schedule */}
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-2">
                    Days expected
                  </label>
                  <div className="flex gap-1.5">
                    {DAY_LABELS.map((label, day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleCustomDay(day)}
                        className={`w-9 h-9 rounded-full font-mono text-xs transition-colors ${
                          customScheduledDays.includes(day)
                            ? "bg-olive text-text"
                            : "bg-bg border border-border text-dim"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Threshold */}
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-2">
                    Counts as a win when done
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={customThreshold}
                      onChange={(e) =>
                        setCustomThreshold(Math.max(1, Math.min(parseInt(e.target.value) || 1, customScheduledDays.length)))
                      }
                      min={1}
                      max={Math.max(customScheduledDays.length, 1)}
                      className="w-16 bg-bg border border-border rounded-card px-3 py-2.5 font-mono text-sm text-text outline-none focus:border-olive"
                    />
                    <span className="font-mono text-xs text-dim">
                      of {customScheduledDays.length} scheduled day{customScheduledDays.length === 1 ? "" : "s"} this week
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleSaveCustom}
                  disabled={!customName.trim() || saving}
                  className="w-full py-4 rounded-card bg-olive text-text font-body font-medium disabled:opacity-40 mt-4"
                >
                  {saving ? "Saving…" : "Save & Add to Routine"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
