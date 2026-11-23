"use client";

import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Maximize2,
  ShieldAlert,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { UserRead } from "@/lib/types";

interface GuestCanvasPdfViewerProps {
  pdfUrl: string;
  currentUser: UserRead;
  onClose?: () => void;
}

function formatCurrentWibTimestamp(): string {
  const now = new Date();
  const wibDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(wibDate.getUTCDate())}-${pad(wibDate.getUTCMonth() + 1)}-${wibDate.getUTCFullYear()} ${pad(wibDate.getUTCHours())}:${pad(wibDate.getUTCMinutes())}:${pad(wibDate.getUTCSeconds())} WIB`;
}

/**
 * Strict Read-Only Canvas PDF Viewer untuk Guest (tanpa <iframe>, Download, ataupun Print).
 * Menggunakan pdfjs-dist untuk merender setiap halaman langsung ke <canvas> ber-watermark.
 */
export default function GuestCanvasPdfViewer({
  pdfUrl,
  currentUser,
  onClose,
}: GuestCanvasPdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<{
    numPages: number;
    getPage: (pageNum: number) => Promise<{
      getViewport: (opts: { scale: number }) => { width: number; height: number };
      render: (opts: {
        canvasContext: CanvasRenderingContext2D;
        viewport: { width: number; height: number };
        transform?: number[];
      }) => { promise: Promise<void>; cancel?: () => void };
    }>;
    destroy: () => Promise<void>;
  } | null>(null);
  const renderTaskRef = useRef<{ promise: Promise<void>; cancel?: () => void } | null>(null);

  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState<number | "fit">("fit");
  const [effectiveScale, setEffectiveScale] = useState<number>(1);
  const [openedAtWib] = useState<string>(() => formatCurrentWibTimestamp());

  const watermarkLabel = useMemo(() => {
    const code = currentUser.short_code || "GUEST";
    const ip = currentUser.ip_address || "IP-VERIFIED";
    return `READ-ONLY GUEST · #${code} · ${ip} · ${openedAtWib}`;
  }, [currentUser.short_code, currentUser.ip_address, openedAtWib]);

  // Blokir shortcut simpan & cetak (Ctrl/Cmd+S dan Ctrl/Cmd+P) selama viewer Guest terbuka
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && (key === "s" || key === "p")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, []);

  // Muat biner PDF ke memory menggunakan pdfjs-dist tanpa mengekspos toolbar browser
  useEffect(() => {
    let cancelled = false;

    async function loadPdfDocument() {
      setLoading(true);
      setError(null);
      setPageNumber(1);
      setTotalPages(0);

      if (pdfDocRef.current) {
        await pdfDocRef.current.destroy().catch(() => undefined);
        pdfDocRef.current = null;
      }

      try {
        const response = await fetch(pdfUrl, {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`Gagal mengunduh stream PDF (${response.status}).`);
        }
        const buffer = await response.arrayBuffer();
        if (cancelled) return;

        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

        const loadingTask = pdfjsLib.getDocument({ data: buffer });
        const doc = await loadingTask.promise;
        if (cancelled) {
          await doc.destroy().catch(() => undefined);
          return;
        }

        pdfDocRef.current = doc as unknown as typeof pdfDocRef.current;
        setTotalPages(doc.numPages);
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message || "Gagal merender dokumen PDF.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPdfDocument();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel?.();
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy().catch(() => undefined);
        pdfDocRef.current = null;
      }
    };
  }, [pdfUrl]);

  const renderPage = useCallback(async () => {
    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!doc || !canvas || !container || totalPages <= 0) return;

    renderTaskRef.current?.cancel?.();
    setRendering(true);
    try {
      const page = await doc.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(240, container.clientWidth - 32);
      const targetScale =
        scale === "fit"
          ? Math.min(2.2, Math.max(0.5, availableWidth / Math.max(1, baseViewport.width)))
          : scale;
      setEffectiveScale(targetScale);

      const viewport = page.getViewport({ scale: targetScale });
      const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

      canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
      canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Canvas 2D context tidak tersedia.");
      }

      const task = page.render({
        canvasContext: context,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      });
      renderTaskRef.current = task;
      await task.promise;
    } catch (err) {
      const msg = (err as Error)?.message || "";
      if (!msg.toLowerCase().includes("cancel")) {
        setError(msg || "Gagal menampilkan halaman PDF.");
      }
    } finally {
      setRendering(false);
    }
  }, [pageNumber, scale, totalPages]);

  useEffect(() => {
    if (!loading && !error && totalPages > 0) {
      renderPage();
    }
  }, [loading, error, totalPages, renderPage]);

  const handleZoomOut = () => {
    const next = Math.max(0.5, Number((effectiveScale - 0.2).toFixed(2)));
    setScale(next);
  };

  const handleZoomIn = () => {
    const next = Math.min(2.6, Number((effectiveScale + 0.2).toFixed(2)));
    setScale(next);
  };

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      className="guest-pdf-protected flex h-full min-h-0 flex-col select-none bg-slate-200/80"
    >
      {/* Custom Minimal Toolbar: Halaman X/Y, Prev/Next, Zoom Out/In/Fit, Tutup (0 tombol Download/Print) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={pageNumber <= 1 || loading}
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            aria-label="Halaman sebelumnya"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Prev
          </button>
          <span className="px-1.5 font-mono text-[11px] font-semibold tabular-nums text-slate-700">
            Halaman {totalPages > 0 ? pageNumber : 0} / {totalPages}
          </span>
          <button
            type="button"
            disabled={pageNumber >= totalPages || loading}
            onClick={() => setPageNumber((p) => Math.min(totalPages, p + 1))}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            aria-label="Halaman berikutnya"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={loading}
            onClick={handleZoomOut}
            className="inline-flex min-h-[32px] items-center justify-center rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            title="Perkecil (Zoom Out)"
            aria-label="Zoom Out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => setScale("fit")}
            className={`inline-flex min-h-[32px] items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium ${
              scale === "fit"
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            title="Sesuaikan lebar layar (Fit)"
          >
            <Maximize2 className="h-3 w-3" />
            Fit
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleZoomIn}
            className="inline-flex min-h-[32px] items-center justify-center rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            title="Perbesar (Zoom In)"
            aria-label="Zoom In"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="ml-1 inline-flex min-h-[32px] items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
            >
              <X className="h-3.5 w-3.5" />
              Tutup
            </button>
          )}
        </div>
      </div>

      {/* Peringatan Read-Only Guest */}
      <div className="flex items-center gap-1.5 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-800">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        <span className="truncate">
          Mode Pratinjau Terproteksi (Read-Only): Unduh &amp; cetak dinonaktifkan untuk sesi Guest.
        </span>
      </div>

      {/* Canvas Container + Watermark Diagonal Semi-Transparan */}
      <div
        ref={containerRef}
        className="relative flex min-h-0 flex-1 items-start justify-center overflow-auto p-4"
      >
        {loading && (
          <div className="my-auto flex items-center gap-2 text-xs font-medium text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            Merender halaman PDF terproteksi...
          </div>
        )}

        {!loading && error && (
          <div className="my-auto max-w-sm rounded-xl border border-red-200 bg-white p-4 text-center text-xs text-red-700 shadow-sm">
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="relative inline-block overflow-hidden rounded-lg bg-white shadow-lg">
            <canvas ref={canvasRef} className="block max-w-none" />

            {/* Diagonal Semi-Transparent Watermark Overlay */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-around overflow-hidden opacity-20"
            >
              {[0, 1, 2, 3].map((rowIdx) => (
                <div
                  key={rowIdx}
                  className="-rotate-25 whitespace-nowrap font-mono text-[11px] font-bold tracking-wider text-slate-800"
                  style={{ transform: "rotate(-24deg)" }}
                >
                  {watermarkLabel}
                </div>
              ))}
            </div>

            {rendering && (
              <div className="absolute right-2 top-2 rounded-md bg-white/90 px-2 py-1 text-[10px] font-medium text-slate-600 shadow">
                Merender...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
