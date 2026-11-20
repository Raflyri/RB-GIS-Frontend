"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const isLoopback =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    if (!window.isSecureContext && !isLoopback) {
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      })
      .catch(() => undefined);
  }, []);

  return null;
}
