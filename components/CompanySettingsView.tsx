"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Play, Check } from "lucide-react";
import Header from "@/components/Header";
import { playNotificationSound, type NotificationSound } from "@/lib/notification-sound";

interface Props {
  userName: string;
  today: string;
  skipAuth: boolean;
  initialNotificationSound: NotificationSound;
}

const OPTIONS: { value: NotificationSound; label: string; description: string }[] = [
  { value: "standard", label: "Standard", description: "The default chirp." },
  { value: "male", label: "Male", description: "An alternate chirp voice." },
];

export default function CompanySettingsView({ userName, today, skipAuth, initialNotificationSound }: Props) {
  const [notificationSound, setNotificationSound] = useState<NotificationSound>(initialNotificationSound);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSelect = async (value: NotificationSound) => {
    if (value === notificationSound || saving) return;
    const previous = notificationSound;
    setNotificationSound(value);
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/company/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationSound: value }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setNotificationSound(previous);
      setError("Failed to save — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-mobile px-4 pb-28">
        <Header userName={userName} today={today} skipAuth={skipAuth} />

        <div className="mt-4 mb-5 flex items-center gap-2">
          <Link href="/profile" className="flex items-center gap-1 text-muted font-body text-sm min-h-[44px]" aria-label="Back">
            <ChevronLeft size={16} />
          </Link>
          <h1 className="font-heading text-xl text-text">Company Settings</h1>
        </div>

        <p className="font-mono text-[10px] text-dim uppercase tracking-widest mb-3">
          NFC Save Sound
        </p>
        <p className="font-body text-xs text-muted mb-4">
          Plays on this device when a task is completed by scanning its linked NFC tag.
        </p>

        <div className="space-y-2">
          {OPTIONS.map((opt) => {
            const selected = notificationSound === opt.value;
            return (
              <div
                key={opt.value}
                className={`flex items-center gap-2 bg-card rounded-card border p-4 transition-colors ${
                  selected ? "border-olive" : "border-border"
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  disabled={saving}
                  className="flex-1 min-w-0 flex items-center justify-between text-left min-h-[44px] disabled:opacity-60"
                >
                  <div className="min-w-0">
                    <p className="font-body text-sm text-text">{opt.label}</p>
                    <p className="font-mono text-[10px] text-dim mt-0.5">{opt.description}</p>
                  </div>
                  {selected && (
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-olive flex items-center justify-center ml-2">
                      <Check size={13} strokeWidth={3} className="text-bg" />
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => playNotificationSound(opt.value)}
                  aria-label={`Preview ${opt.label} sound`}
                  className="flex-shrink-0 w-9 h-9 rounded-full border border-border-light flex items-center justify-center text-muted hover:text-olive transition-colors"
                >
                  <Play size={13} />
                </button>
              </div>
            );
          })}
        </div>

        {error && <p className="font-mono text-xs text-burgundy-light mt-3">{error}</p>}
      </div>
    </div>
  );
}
