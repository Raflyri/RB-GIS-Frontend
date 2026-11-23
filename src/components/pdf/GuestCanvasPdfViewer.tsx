"use client";

import {
  ChevronLeft,
  ChevronRight,
  Download,
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
  /** Override mode proteksi read-only Guest; default mengikuti currentUser.role === "GUEST" */
  readOnlyGuest?: boolean;
}

const MIN_PDF_SCALE = 0.25;
const MAX_PDF_SCALE = 4.0;

function clampScale(value: number, minScale = MIN_PDF_SCALE, maxScale = MAX_PDF_SCALE): number {
  return Math.min(maxScale, Math.max(minScale, value));
}

function getTouchDistance(t1: Touch, t2: Touch): number {
  return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
}

function formatCurrentWibTimestamp(): string {
  const now = new Date();
  const wibDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(wibDate.getUTCDate())}-${pad(wibDate.getUTCMonth() + 1)}-${wibDate.getUTCFullYear()} ${pad(wibDate.getUTCHours())}:${pad(wibDate.getUTCMinutes())}:${pad(wibDate.getUTCSeconds())} WIB`;
}

/**
 * Canvas PDF Viewer (pdfjs-dist) dengan dukungan penuh Mobile Pinch-to-Zoom,
 * Double-Tap Zoom, Pan 2-arah, dan proteksi Strict Read-Only saat mode Guest.
 */
export default function GuestCanvasPdfViewer({
  pdfUrl,
  currentUser,
  onClose,
  readOnlyGuest,
}: GuestCanvasPdfViewerProps) {
  const isGuestMode = readOnlyGuest ?? currentUser.role === "GUEST";

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoomLabelRef = useRef<HTMLSpanElement>(null);

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

  // Ref sinkron agar touch/wheel listener selalu membaca dimensi & skala terbaru tanpa stale closure
  const basePageSizeRef = useRef<{ width: number; height: number }>({ width: 595, height: 842 });
  const fitScaleRef = useRef<number>(1);
  const effectiveScaleRef = useRef<number>(1);

  const pinchStateRef = useRef<{
    active: boolean;
    initialDistance: number;
    startScale: number;
    liveScale: number;
    pdfFocusX: number;
    pdfFocusY: number;
  }>({
    active: false,
    initialDistance: 0,
    startScale: 1,
    liveScale: 1,
    pdfFocusX: 0,
    pdfFocusY: 0,
  });

  const gestureHadMultiTouchRef = useRef(false);
  const tapCandidateRef = useRef<{
    x: number;
    y: number;
    time: number;
    moved: boolean;
  } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number }>({
    time: 0,
    x: 0,
    y: 0,
  });
  const pendingFocusAnchorRef = useRef<{
    pdfX: number;
    pdfY: number;
    clientX: number;
    clientY: number;
    targetScale: number;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState<number | "fit">("fit");
  const [effectiveScale, setEffectiveScale] = useState<number>(1);
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [openedAtWib] = useState<string>(() => formatCurrentWibTimestamp());

  const watermarkLabel = useMemo(() => {
    const code = currentUser.short_code || "GUEST";
    const ip = currentUser.ip_address || "IP-VERIFIED";
    return `READ-ONLY GUEST · #${code} · ${ip} · ${openedAtWib}`;
  }, [currentUser.short_code, currentUser.ip_address, openedAtWib]);

  // Blokir shortcut simpan & cetak (Ctrl/Cmd+S dan Ctrl/Cmd+P) hanya pada mode Guest
  useEffect(() => {
    if (!isGuestMode) return;
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
  }, [isGuestMode]);

  // Muat biner PDF ke memory menggunakan pdfjs-dist tanpa mengekspos toolbar browser
  useEffect(() => {
    let cancelled = false;

    async function loadPdfDocument() {
      setLoading(true);
      setError(null);
      setPageNumber(1);
      setTotalPages(0);
      setScale("fit");

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

  const applyCanvasCssDimensions = useCallback((nextScale: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const base = basePageSizeRef.current;
    canvas.style.width = `${Math.max(1, Math.round(base.width * nextScale))}px`;
    canvas.style.height = `${Math.max(1, Math.round(base.height * nextScale))}px`;

    const fit = Math.max(0.01, fitScaleRef.current);
    const pct = Math.max(25, Math.round((nextScale / fit) * 100));
    if (zoomLabelRef.current) {
      zoomLabelRef.current.textContent = `${pct}%`;
    }
  }, []);

  const alignScrollToAnchor = useCallback(
    (pdfX: number, pdfY: number, clientX: number, clientY: number, nextScale: number) => {
      const container = containerRef.current;
      const wrapper = canvasWrapperRef.current;
      if (!container || !wrapper) return;
      const wrapperRect = wrapper.getBoundingClientRect();
      const targetScreenX = wrapperRect.left + pdfX * nextScale;
      const targetScreenY = wrapperRect.top + pdfY * nextScale;
      container.scrollLeft += targetScreenX - clientX;
      container.scrollTop += targetScreenY - clientY;
    },
    [],
  );

  const renderPage = useCallback(async () => {
    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!doc || !canvas || !container || totalPages <= 0) return;

    renderTaskRef.current?.cancel?.();
    setRendering(true);
    let aborted = false;

    try {
      const page = await doc.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      basePageSizeRef.current = {
        width: Math.max(1, baseViewport.width),
        height: Math.max(1, baseViewport.height),
      };

      const availableWidth = Math.max(220, container.clientWidth - 24);
      const computedFitScale = clampScale(availableWidth / Math.max(1, baseViewport.width), MIN_PDF_SCALE, 2.5);
      fitScaleRef.current = computedFitScale;

      const targetScale =
        scale === "fit"
          ? computedFitScale
          : clampScale(scale, Math.min(MIN_PDF_SCALE, computedFitScale * 0.6), MAX_PDF_SCALE);

      effectiveScaleRef.current = targetScale;
      setEffectiveScale(targetScale);
      const nextPercent = Math.max(25, Math.round((targetScale / Math.max(0.01, computedFitScale)) * 100));
      setZoomPercent(nextPercent);

      // Pastikan CSS size canvas langsung sesuai targetScale agar tidak berkedip saat offscreen render berjalan
      applyCanvasCssDimensions(targetScale);
      if (pendingFocusAnchorRef.current) {
        const anchor = pendingFocusAnchorRef.current;
        pendingFocusAnchorRef.current = null;
        alignScrollToAnchor(anchor.pdfX, anchor.pdfY, anchor.clientX, anchor.clientY, targetScale);
      }

      const viewport = page.getViewport({ scale: targetScale });
      const rawDpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      // Batasi ukuran backing canvas agar GPU mobile tidak kehabisan memori saat zoom > 3x
      const maxBackingPixels = 3200;
      const maxRatioForWidth = maxBackingPixels / Math.max(1, viewport.width);
      const maxRatioForHeight = maxBackingPixels / Math.max(1, viewport.height);
      const dpr = Math.max(1, Math.min(rawDpr, 2.25, maxRatioForWidth, maxRatioForHeight));

      // Render ke offscreen canvas terlebih dahulu agar halaman tetap terlihat tajam tanpa blank flash saat pinch berakhir
      const offscreen = window.document.createElement("canvas");
      offscreen.width = Math.max(1, Math.floor(viewport.width * dpr));
      offscreen.height = Math.max(1, Math.floor(viewport.height * dpr));
      const offscreenContext = offscreen.getContext("2d");
      if (!offscreenContext) {
        throw new Error("Canvas 2D context tidak tersedia.");
      }

      const task = page.render({
        canvasContext: offscreenContext,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      });
      renderTaskRef.current = task;
      await task.promise;

      const currentCanvas = canvasRef.current;
      if (
        !currentCanvas ||
        pinchStateRef.current.active ||
        Math.abs(effectiveScaleRef.current - targetScale) > 0.005
      ) {
        return;
      }
      currentCanvas.width = offscreen.width;
      currentCanvas.height = offscreen.height;
      currentCanvas.style.width = `${Math.floor(viewport.width)}px`;
      currentCanvas.style.height = `${Math.floor(viewport.height)}px`;

      const visibleContext = currentCanvas.getContext("2d");
      if (visibleContext) {
        visibleContext.drawImage(offscreen, 0, 0);
      }
    } catch (err) {
      const msg = (err as Error)?.message || "";
      if (msg.toLowerCase().includes("cancel")) {
        aborted = true;
      } else {
        setError(msg || "Gagal menampilkan halaman PDF.");
      }
    } finally {
      if (!aborted) {
        setRendering(false);
      }
    }
  }, [alignScrollToAnchor, applyCanvasCssDimensions, pageNumber, scale, totalPages]);

  useEffect(() => {
    if (!loading && !error && totalPages > 0) {
      renderPage();
    }
  }, [loading, error, totalPages, renderPage]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [pageNumber]);

  // Otomatis sesuaikan ulang jika ukuran layar berubah (mis. rotasi portrait <-> landscape) pada mode Fit
  useEffect(() => {
    const container = containerRef.current;
    if (!container || scale !== "fit" || loading || error || totalPages <= 0) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        renderPage();
      }, 120);
    });
    observer.observe(container);

    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [error, loading, renderPage, scale, totalPages]);

  // Event listener sentuh (2-finger Pinch-to-Zoom + 1-finger Double-Tap Zoom) & Trackpad Ctrl+Wheel
  useEffect(() => {
    const container = containerRef.current;
    if (!container || loading || error || totalPages <= 0) return;

    const getMinAllowedScale = () => Math.min(MIN_PDF_SCALE, fitScaleRef.current * 0.75);

    const startPinch = (t1: Touch, t2: Touch) => {
      const wrapper = canvasWrapperRef.current;
      if (!wrapper) return;
      const dist = Math.max(getTouchDistance(t1, t2), 12);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const wrapperRect = wrapper.getBoundingClientRect();
      const startScale = effectiveScaleRef.current;

      gestureHadMultiTouchRef.current = true;
      tapCandidateRef.current = null;
      pinchStateRef.current = {
        active: true,
        initialDistance: dist,
        startScale,
        liveScale: startScale,
        pdfFocusX: (midX - wrapperRect.left) / Math.max(0.01, startScale),
        pdfFocusY: (midY - wrapperRect.top) / Math.max(0.01, startScale),
      };
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        if (event.cancelable) event.preventDefault();
        startPinch(event.touches[0], event.touches[1]);
        return;
      }

      if (event.touches.length === 1 && !pinchStateRef.current.active) {
        gestureHadMultiTouchRef.current = false;
        const touch = event.touches[0];
        tapCandidateRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          time: Date.now(),
          moved: false,
        };
      }
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length >= 2) {
        if (event.cancelable) event.preventDefault();
        if (!pinchStateRef.current.active) {
          startPinch(event.touches[0], event.touches[1]);
          return;
        }

        const t1 = event.touches[0];
        const t2 = event.touches[1];
        const currentDist = Math.max(getTouchDistance(t1, t2), 8);
        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;
        const { initialDistance, startScale, pdfFocusX, pdfFocusY } = pinchStateRef.current;

        const nextScale = clampScale(
          startScale * (currentDist / Math.max(1, initialDistance)),
          getMinAllowedScale(),
          MAX_PDF_SCALE,
        );
        pinchStateRef.current.liveScale = nextScale;
        effectiveScaleRef.current = nextScale;

        applyCanvasCssDimensions(nextScale);
        alignScrollToAnchor(pdfFocusX, pdfFocusY, midX, midY, nextScale);
        return;
      }

      if (event.touches.length === 1 && tapCandidateRef.current) {
        const touch = event.touches[0];
        if (Math.hypot(touch.clientX - tapCandidateRef.current.x, touch.clientY - tapCandidateRef.current.y) > 10) {
          tapCandidateRef.current.moved = true;
        }
      }
    };

    const finalizePinch = () => {
      if (!pinchStateRef.current.active) return;
      const finalScale = clampScale(
        Number(pinchStateRef.current.liveScale.toFixed(2)),
        getMinAllowedScale(),
        MAX_PDF_SCALE,
      );
      pinchStateRef.current.active = false;
      effectiveScaleRef.current = finalScale;

      const finalPercent = Math.max(25, Math.round((finalScale / Math.max(0.01, fitScaleRef.current)) * 100));
      setZoomPercent(finalPercent);

      // Jika sangat dekat dengan fitScale, kembalikan ke mode "fit" yang rapi
      if (Math.abs(finalScale - fitScaleRef.current) < 0.03) {
        setScale("fit");
      } else {
        setScale(finalScale);
      }
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const isCancel = event.type === "touchcancel";
      if (pinchStateRef.current.active && (event.touches.length < 2 || isCancel)) {
        finalizePinch();
      }

      if (event.touches.length === 0) {
        const candidate = tapCandidateRef.current;
        tapCandidateRef.current = null;
        const wasMultiTouch = gestureHadMultiTouchRef.current;
        gestureHadMultiTouchRef.current = false;

        if (!isCancel && !wasMultiTouch && candidate && !candidate.moved && Date.now() - candidate.time < 260) {
          const now = Date.now();
          const prev = lastTapRef.current;
          if (now - prev.time < 320 && Math.hypot(candidate.x - prev.x, candidate.y - prev.y) < 36) {
            lastTapRef.current = { time: 0, x: 0, y: 0 };
            const wrapper = canvasWrapperRef.current;
            if (wrapper) {
              const wrapperRect = wrapper.getBoundingClientRect();
              const curScale = effectiveScaleRef.current;
              const pdfX = (candidate.x - wrapperRect.left) / Math.max(0.01, curScale);
              const pdfY = (candidate.y - wrapperRect.top) / Math.max(0.01, curScale);

              const isAlreadyZoomed = curScale > fitScaleRef.current * 1.15;
              const targetNextScale = isAlreadyZoomed
                ? fitScaleRef.current
                : clampScale(Number((fitScaleRef.current * 2.0).toFixed(2)), getMinAllowedScale(), MAX_PDF_SCALE);

              pendingFocusAnchorRef.current = {
                pdfX,
                pdfY,
                clientX: candidate.x,
                clientY: candidate.y,
                targetScale: targetNextScale,
              };
              setScale(isAlreadyZoomed ? "fit" : targetNextScale);
            }
          } else {
            lastTapRef.current = { time: now, x: candidate.x, y: candidate.y };
          }
        }
      }
    };

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.cancelable) event.preventDefault();

      const wrapper = canvasWrapperRef.current;
      const curScale = effectiveScaleRef.current;
      const factor = Math.exp(-event.deltaY * 0.0025);
      const nextScale = clampScale(
        Number((curScale * factor).toFixed(2)),
        getMinAllowedScale(),
        MAX_PDF_SCALE,
      );

      if (wrapper) {
        const wrapperRect = wrapper.getBoundingClientRect();
        pendingFocusAnchorRef.current = {
          pdfX: (event.clientX - wrapperRect.left) / Math.max(0.01, curScale),
          pdfY: (event.clientY - wrapperRect.top) / Math.max(0.01, curScale),
          clientX: event.clientX,
          clientY: event.clientY,
          targetScale: nextScale,
        };
      }
      setScale(nextScale);
    };

    container.addEventListener("touchstart", handleTouchStart, { passive: false });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });
    container.addEventListener("touchcancel", handleTouchEnd, { passive: true });
    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
      container.removeEventListener("touchcancel", handleTouchEnd);
      container.removeEventListener("wheel", handleWheel);
    };
  }, [alignScrollToAnchor, applyCanvasCssDimensions, error, loading, totalPages]);

  const handleZoomOut = () => {
    const minAllowed = Math.min(MIN_PDF_SCALE, fitScaleRef.current * 0.75);
    const step = Math.max(0.15, fitScaleRef.current * 0.25);
    const next = clampScale(Number((effectiveScale - step).toFixed(2)), minAllowed, MAX_PDF_SCALE);
    setScale(next);
  };

  const handleZoomIn = () => {
    const minAllowed = Math.min(MIN_PDF_SCALE, fitScaleRef.current * 0.75);
    const step = Math.max(0.15, fitScaleRef.current * 0.25);
    const next = clampScale(Number((effectiveScale + step).toFixed(2)), minAllowed, MAX_PDF_SCALE);
    setScale(next);
  };

  return (
    <div
      onContextMenu={isGuestMode ? (e) => e.preventDefault() : undefined}
      onCopy={isGuestMode ? (e) => e.preventDefault() : undefined}
      onCut={isGuestMode ? (e) => e.preventDefault() : undefined}
      onDragStart={isGuestMode ? (e) => e.preventDefault() : undefined}
      className={`${isGuestMode ? "guest-pdf-protected select-none" : ""} flex h-full min-h-0 flex-col bg-slate-200/80`}
    >
      {/* Toolbar: Halaman X/Y, Prev/Next, Zoom Out/Fit+%/Zoom In, (Admin Download jika non-guest), Tutup */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={pageNumber <= 1 || loading}
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            aria-label="Halaman sebelumnya"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Prev</span>
          </button>
          <span className="px-1 font-mono text-[11px] font-semibold tabular-nums text-slate-700">
            Hal {totalPages > 0 ? pageNumber : 0}/{totalPages}
          </span>
          <button
            type="button"
            disabled={pageNumber >= totalPages || loading}
            onClick={() => setPageNumber((p) => Math.min(totalPages, p + 1))}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            aria-label="Halaman berikutnya"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={loading}
            onClick={handleZoomOut}
            className="inline-flex min-h-[34px] items-center justify-center rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            title="Perkecil (Zoom Out)"
            aria-label="Zoom Out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => setScale("fit")}
            className={`inline-flex min-h-[34px] items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium tabular-nums ${
              scale === "fit"
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            title="Sesuaikan lebar layar (Fit)"
          >
            <Maximize2 className="h-3 w-3" />
            <span>Fit</span>
            <span ref={zoomLabelRef} className="font-mono text-[10px] opacity-80">
              {zoomPercent}%
            </span>
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleZoomIn}
            className="inline-flex min-h-[34px] items-center justify-center rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            title="Perbesar (Zoom In)"
            aria-label="Zoom In"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>

          {!isGuestMode && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-0.5 inline-flex min-h-[34px] items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
              title="Buka atau unduh PDF asli"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="ml-0.5 inline-flex min-h-[34px] items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
            >
              <X className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Tutup</span>
            </button>
          )}
        </div>
      </div>

      {/* Peringatan Read-Only Guest atau Petunjuk Pinch Zoom Mobile */}
      {isGuestMode ? (
        <div className="flex items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-800">
          <div className="flex min-w-0 items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-600" />
            <span className="truncate">
              Mode Read-Only: Unduh &amp; cetak dinonaktifkan · Cubit layar untuk zoom.
            </span>
          </div>
        </div>
      ) : (
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-500">
          Cubit layar dengan 2 jari atau ketuk 2x untuk memperbesar / memperkecil dokumen.
        </div>
      )}

      {/* Scroll Container: mx-auto pada wrapper menggantikan justify-center agar pan kiri-kanan tidak terpotong */}
      <div
        ref={containerRef}
        className="relative flex min-h-0 flex-1 touch-pan-x touch-pan-y items-start overflow-auto overscroll-contain p-3 sm:p-4"
      >
        {loading && (
          <div className="m-auto flex items-center gap-2 text-xs font-medium text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            Memuat dokumen PDF...
          </div>
        )}

        {!loading && error && (
          <div className="m-auto max-w-sm rounded-xl border border-red-200 bg-white p-4 text-center text-xs text-red-700 shadow-sm">
            {error}
          </div>
        )}

        {!loading && !error && (
          <div
            ref={canvasWrapperRef}
            className="relative mx-auto inline-block shrink-0 overflow-hidden rounded-lg bg-white shadow-lg"
          >
            <canvas ref={canvasRef} className="block max-w-none" />

            {/* Diagonal Semi-Transparent Watermark Overlay (hanya Guest) */}
            {isGuestMode && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex flex-col items-center justify-around overflow-hidden opacity-20"
              >
                {[0, 1, 2, 3].map((rowIdx) => (
                  <div
                    key={rowIdx}
                    className="whitespace-nowrap font-mono text-[11px] font-bold tracking-wider text-slate-800"
                    style={{ transform: "rotate(-24deg)" }}
                  >
                    {watermarkLabel}
                  </div>
                ))}
              </div>
            )}

            {rendering && (
              <div className="pointer-events-none absolute right-2 top-2 rounded-md bg-white/90 px-2 py-1 text-[10px] font-medium text-slate-600 shadow">
                Memperjelas...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
