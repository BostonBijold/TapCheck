"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

// Capacitor's native Universal Link handling (CAPSceneDelegateProxy.swift's
// scene(_:continue:)) only broadcasts a native notification — it never
// navigates the WebView on its own. @capacitor/app forwards that as the JS
// "appUrlOpen" event; this is what actually routes the app to the tapped
// path (e.g. /nfc/<tagCode>) instead of leaving it wherever it was last
// showing. See docs/features/nfc.md.
export default function UniversalLinkHandler() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let removeListener: (() => void) | undefined;

    import("@capacitor/app").then(({ App }) => {
      const handle = App.addListener("appUrlOpen", (data) => {
        const url = new URL(data.url);
        window.location.href = url.pathname + url.search;
      });
      handle.then((h) => { removeListener = () => h.remove(); });
    });

    return () => removeListener?.();
  }, []);

  return null;
}
