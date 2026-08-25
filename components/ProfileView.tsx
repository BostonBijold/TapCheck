"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import { Copy, Check } from "lucide-react";
import Header from "@/components/Header";
import { ApiKeyBridge } from "@/lib/native/api-key-bridge";

interface Props {
  name: string;
  email: string;
  today: string;
  skipAuth: boolean;
}

export default function ProfileView({ name, email, today, skipAuth }: Props) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [debugStatus, setDebugStatus] = useState<string | null>(null);

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

  // Temporary diagnostic for the "not signed in" Shortcuts issue — remove
  // once resolved.
  const handlePushKey = async () => {
    if (!apiKey) { setDebugStatus("No apiKey loaded in JS yet"); return; }
    try {
      await ApiKeyBridge.setApiKey({ apiKey });
      setDebugStatus("setApiKey call succeeded (no error thrown)");
    } catch (err) {
      setDebugStatus(`setApiKey FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleCheckKey = async () => {
    try {
      const result = await ApiKeyBridge.debugReadKey();
      setDebugStatus(`Keychain: hasKey=${result.hasKey}, length=${result.length}`);
    } catch (err) {
      setDebugStatus(`debugReadKey FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

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
              Paste into an iPhone Shortcut (e.g. fired from an NFC tag) to start a habit or task timer from outside the app.
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

          {/* Temporary native bridge diagnostic — remove after debugging */}
          <div className="bg-card rounded-card border border-tobacco/40 p-5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-tobacco mb-2">
              Debug: Native Keychain
            </p>
            <div className="flex gap-2 mb-3">
              <button
                onClick={handlePushKey}
                className="flex-1 py-2 rounded-card border border-border text-text font-mono text-xs"
              >
                Push Key
              </button>
              <button
                onClick={handleCheckKey}
                className="flex-1 py-2 rounded-card border border-border text-text font-mono text-xs"
              >
                Check Key
              </button>
            </div>
            {debugStatus && (
              <p className="font-mono text-[11px] text-tobacco break-all">{debugStatus}</p>
            )}
          </div>

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
