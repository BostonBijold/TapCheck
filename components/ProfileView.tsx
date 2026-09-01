"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import { Copy, Check, ChevronRight } from "lucide-react";
import Header from "@/components/Header";
import { ApiKeyBridge } from "@/lib/native/api-key-bridge";

interface Props {
  name: string;
  email: string;
  today: string;
  skipAuth: boolean;
  isManager?: boolean;
  hasPassword?: boolean;
}

export default function ProfileView({ name, email, today, skipAuth, isManager = false, hasPassword = false }: Props) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [passwordSet, setPasswordSet] = useState(hasPassword);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordStatus(null);

    if (newPassword.length < 8) {
      setPasswordStatus({ type: "error", text: "Password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: "error", text: "Passwords don't match." });
      return;
    }

    setPasswordSubmitting(true);
    try {
      const res = await fetch("/api/user/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPasswordStatus({ type: "error", text: data.error ?? "Something went wrong." });
        return;
      }
      setPasswordSet(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordStatus({ type: "success", text: "Password updated." });
    } catch {
      setPasswordStatus({ type: "error", text: "Something went wrong. Please try again." });
    } finally {
      setPasswordSubmitting(false);
    }
  };

  useEffect(() => {
    fetch("/api/user/api-key")
      .then((r) => r.json())
      .then((data: { apiKey?: string }) => {
        setApiKey(data.apiKey ?? null);
        if (data.apiKey && Capacitor.isNativePlatform()) {
          ApiKeyBridge.setApiKey({ apiKey: data.apiKey }).catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  const handleCopy = async () => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable — key is still selectable by hand */ }
  };

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-mobile px-4 pb-28">
        <Header userName={name} today={today} skipAuth={skipAuth} />

        <div className="mt-4 space-y-4">
          {/* Identity card */}
          <div className="bg-card rounded-card border border-border p-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-olive/20 flex items-center justify-center flex-shrink-0">
                <span className="font-mono text-olive text-xl font-bold">
                  {name[0]?.toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-heading text-lg text-text truncate">{name}</p>
                <p className="font-mono text-dim text-xs mt-0.5 truncate">{email}</p>
              </div>
            </div>
          </div>

          {/* External API key */}
          <div className="bg-card rounded-card border border-border p-5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-2">
              External API Key
            </p>
            <p className="font-body text-xs text-muted mb-3">
              Paste into an iPhone Shortcut (e.g. fired from an NFC tag) to start a task timer from outside the app.
            </p>
            {apiKey ? (
              <div className="flex items-center gap-2 bg-bg border border-border rounded-card px-3 py-2.5">
                <span className="font-mono text-[11px] text-text break-all select-all flex-1">
                  {apiKey}
                </span>
                <button
                  onClick={handleCopy}
                  aria-label="Copy API key"
                  className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-dim hover:text-olive transition-colors"
                >
                  {copied ? <Check size={14} className="text-olive" /> : <Copy size={14} />}
                </button>
              </div>
            ) : (
              <p className="font-mono text-xs text-dim">Loading…</p>
            )}
          </div>

          {/* Credentials sign-in password — see app/api/user/password/route.ts.
              Blank "Current password" for a Google-only account (nothing to
              check yet); required once one has been set. */}
          {!skipAuth && (
            <div className="bg-card rounded-card border border-border p-5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-3">
                {passwordSet ? "Change Password" : "Set a Password"}
              </p>
              <form onSubmit={handlePasswordSubmit} className="space-y-2.5">
                {passwordSet && (
                  <input
                    type="password"
                    placeholder="Current password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full bg-bg border border-border rounded-card px-3.5 py-2.5 font-body text-sm text-text placeholder:text-dim focus:outline-none focus:border-olive"
                  />
                )}
                <input
                  type="password"
                  placeholder="New password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-bg border border-border rounded-card px-3.5 py-2.5 font-body text-sm text-text placeholder:text-dim focus:outline-none focus:border-olive"
                />
                <input
                  type="password"
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-bg border border-border rounded-card px-3.5 py-2.5 font-body text-sm text-text placeholder:text-dim focus:outline-none focus:border-olive"
                />
                {passwordStatus && (
                  <p className={`font-mono text-xs ${passwordStatus.type === "error" ? "text-burgundy-light" : "text-done"}`}>
                    {passwordStatus.text}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={passwordSubmitting}
                  className="w-full py-3 rounded-card bg-olive text-white font-body font-medium text-sm hover:bg-olive-light transition-colors disabled:opacity-50"
                >
                  {passwordSubmitting ? "Saving…" : passwordSet ? "Update Password" : "Set Password"}
                </button>
              </form>
            </div>
          )}

          {/* Manager-only: task lists, standalone tasks, and the company's
              saved-task catalog — see components/ManageTasksView.tsx and
              docs/features/task-lists.md's "Company Task Catalog" section. */}
          {isManager && (
            <Link
              href="/tasks/manage"
              className="flex items-center justify-between bg-card rounded-card border border-border p-5 hover:bg-card-hover transition-colors"
            >
              <div>
                <p className="font-body text-sm text-text">Manage Tasks</p>
                <p className="font-mono text-[10px] text-dim mt-0.5">Task lists, standalone tasks, and NFC tag bindings</p>
              </div>
              <ChevronRight size={16} className="text-dim flex-shrink-0" />
            </Link>
          )}

          {/* Manager-only: which chirp plays on this company's devices for
              an NFC scan-to-complete save — see components/CompanySettingsView.tsx. */}
          {isManager && (
            <Link
              href="/company-settings"
              className="flex items-center justify-between bg-card rounded-card border border-border p-5 hover:bg-card-hover transition-colors"
            >
              <div>
                <p className="font-body text-sm text-text">Company Settings</p>
                <p className="font-mono text-[10px] text-dim mt-0.5">NFC save sound</p>
              </div>
              <ChevronRight size={16} className="text-dim flex-shrink-0" />
            </Link>
          )}

          <Link
            href="/privacy"
            className="flex items-center justify-between bg-card rounded-card border border-border p-5 hover:bg-card-hover transition-colors"
          >
            <p className="font-body text-sm text-text">Privacy Policy</p>
            <ChevronRight size={16} className="text-dim flex-shrink-0" />
          </Link>

          {/* Sign out */}
          {!skipAuth && (
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full py-4 rounded-card border border-burgundy/30 text-burgundy-light font-mono text-sm hover:bg-burgundy/10 transition-colors min-h-[48px]"
            >
              Sign out
            </button>
          )}

          {skipAuth && (
            <div className="px-4 py-3 rounded-card bg-tobacco/10 border border-tobacco/20">
              <p className="font-mono text-tobacco text-xs">
                Dev mode — auth is bypassed (SKIP_AUTH=true)
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
