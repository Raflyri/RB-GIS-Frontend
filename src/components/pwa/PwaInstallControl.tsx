"use client";

import { Download, Share, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface PwaInstallControlProps {
  variant: "header" | "mobile-menu";
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const standaloneMedia =
    window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
  const iosStandalone =
    Boolean(
      (window.navigator as Navigator & { standalone?: boolean }).standalone,
    );
  return standaloneMedia || iosStandalone;
}

function detectIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  const isIosDevice =
    /iphone|ipad|ipod/i.test(ua) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1);
  if (!isIosDevice) return false;
  const isSafariEngine = !/crios|fxios|edgios|opios/i.test(ua);
  return isSafariEngine;
}

export default function PwaInstallControl({ variant }: PwaInstallControlProps) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIosSafari, setIsIosSafari] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    setIsStandalone(detectStandalone());
    setIsIosSafari(detectIosSafari());

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      setShowIosGuide(false);
    };

    const mediaQuery = window.matchMedia?.("(display-mode: standalone)");
    const handleDisplayModeChange = () => {
      setIsStandalone(detectStandalone());
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);
    mediaQuery?.addEventListener?.("change", handleDisplayModeChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
      mediaQuery?.removeEventListener?.("change", handleDisplayModeChange);
    };
  }, []);

  if (isStandalone || (!deferredPrompt && !isIosSafari)) {
    return null;
  }

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      setInstalling(true);
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setDeferredPrompt(null);
        }
      } finally {
        setInstalling(false);
      }
      return;
    }

    if (isIosSafari) {
      setShowIosGuide((prev) => !prev);
    }
  };

  if (variant === "mobile-menu") {
    return (
      <div className="mt-3 space-y-2 border-t border-slate-100 pt-2.5">
        <button
          type="button"
          disabled={installing}
          onClick={handleInstallClick}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 active:bg-blue-100 disabled:opacity-60"
        >
          {deferredPrompt ? (
            <Download className="h-4 w-4" />
          ) : (
            <Smartphone className="h-4 w-4" />
          )}
          {installing ? "Menyiapkan..." : "Install ke Layar Utama"}
        </button>

        {showIosGuide && isIosSafari && !deferredPrompt && (
          <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-[11px] leading-relaxed text-slate-700">
            <Share className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
            <p>
              Ketuk ikon <strong>Bagikan (Share)</strong> →{" "}
              <strong>Tambah ke Layar Utama</strong>
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={installing}
        onClick={handleInstallClick}
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 shadow-sm transition-colors hover:bg-blue-100 disabled:opacity-60"
        title="Install aplikasi Web GIS LDKH ke layar utama perangkat"
      >
        {deferredPrompt ? (
          <Download className="h-3.5 w-3.5" />
        ) : (
          <Smartphone className="h-3.5 w-3.5" />
        )}
        <span className="hidden lg:inline">Install ke Layar Utama</span>
        <span className="lg:hidden">Install App</span>
      </button>

      {showIosGuide && isIosSafari && !deferredPrompt && (
        <div className="absolute right-0 top-full z-40 mt-2 flex w-64 items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-[11px] leading-relaxed text-slate-700 shadow-xl">
          <Share className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
          <p>
            Ketuk ikon <strong>Bagikan (Share)</strong> →{" "}
            <strong>Tambah ke Layar Utama</strong>
          </p>
        </div>
      )}
    </div>
  );
}
