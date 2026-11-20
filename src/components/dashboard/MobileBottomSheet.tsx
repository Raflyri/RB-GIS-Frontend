"use client";

import {
  ChevronDown,
  ChevronUp,
  FileText,
  FileUp,
  FileWarning,
  Loader2,
  Maximize2,
  Pencil,
  Pentagon,
  Table2,
  X,
} from "lucide-react";
import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { LegalStatusBadge } from "@/components/ui/Badges";
import { formatArea, toNumber } from "@/lib/thematic";
import type {
  DashboardStats,
  ParcelDetailRead,
  ParcelFeature,
} from "@/lib/types";

export type BottomSheetSnap = "peek" | "half" | "expanded";

interface MobileBottomSheetProps {
  snap: BottomSheetSnap;
  onSnapChange: (snap: BottomSheetSnap) => void;
  stats: DashboardStats | null;
  parcelCount: number;
  orphanedCount: number;
  selectedFeature: ParcelFeature | null;
  parcelDetail: ParcelDetailRead | null;
  detailLoading: boolean;
  detailError: string | null;
  canEdit: boolean;
  canDelete: boolean;
  isEditingGeometry: boolean;
  onOpenPrimaryPdf: () => void;
  onOpenEditModal: () => void;
  onStartEditGeometry: () => void;
  onClearSelection: () => void;
  dataTab: "parcels" | "orphaned";
  onDataTabChange: (tab: "parcels" | "orphaned") => void;
  children: ReactNode;
}

const SNAP_VH: Record<BottomSheetSnap, number> = {
  peek: 14,
  half: 46,
  expanded: 90,
};

const MIN_SHEET_PX = 88;

export default function MobileBottomSheet({
  snap,
  onSnapChange,
  stats,
  parcelCount,
  orphanedCount,
  selectedFeature,
  parcelDetail,
  detailLoading,
  detailError,
  canEdit,
  canDelete,
  isEditingGeometry,
  onOpenPrimaryPdf,
  onOpenEditModal,
  onStartEditGeometry,
  onClearSelection,
  dataTab,
  onDataTabChange,
  children,
}: MobileBottomSheetProps) {
  const dragStartYRef = useRef<number | null>(null);
  const dragStartHeightRef = useRef<number>(0);
  const dragStartTimeRef = useRef<number>(0);
  const movedRef = useRef(false);

  const [dragHeightPx, setDragHeightPx] = useState<number | null>(null);

  const activeSnapVh = SNAP_VH[snap];

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const viewportH = window.innerHeight || 720;
    dragStartYRef.current = e.clientY;
    dragStartHeightRef.current = Math.max(
      MIN_SHEET_PX,
      (viewportH * activeSnapVh) / 100,
    );
    dragStartTimeRef.current = performance.now();
    movedRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStartYRef.current === null) return;
    const deltaY = dragStartYRef.current - e.clientY;
    if (Math.abs(deltaY) > 6) {
      movedRef.current = true;
    }
    const viewportH = window.innerHeight || 720;
    const maxPx = viewportH * 0.92;
    const clamped = Math.max(
      MIN_SHEET_PX,
      Math.min(maxPx, dragStartHeightRef.current + deltaY),
    );
    setDragHeightPx(clamped);
  };

  const finishDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStartYRef.current === null) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const startY = dragStartYRef.current;
    const endY = e.clientY;
    const deltaY = startY - endY;
    const elapsed = Math.max(1, performance.now() - dragStartTimeRef.current);
    const velocity = deltaY / elapsed; // px/ms, positive = swipe up

    dragStartYRef.current = null;
    const currentPx = dragHeightPx;
    setDragHeightPx(null);

    if (!movedRef.current) {
      // Tap on handle cycles: peek -> half -> expanded -> peek
      if (snap === "peek") onSnapChange("half");
      else if (snap === "half") onSnapChange("expanded");
      else onSnapChange("peek");
      return;
    }

    const viewportH = window.innerHeight || 720;
    const finalRatio =
      currentPx !== null ? currentPx / viewportH : activeSnapVh / 100;

    // Velocity-assisted snap
    if (velocity > 0.45) {
      if (snap === "peek") {
        onSnapChange(finalRatio > 0.62 ? "expanded" : "half");
      } else {
        onSnapChange("expanded");
      }
      return;
    }
    if (velocity < -0.45) {
      if (snap === "expanded") {
        onSnapChange(finalRatio < 0.28 ? "peek" : "half");
      } else {
        onSnapChange("peek");
      }
      return;
    }

    // Distance/position-based snap
    if (finalRatio < 0.28) {
      onSnapChange("peek");
    } else if (finalRatio < 0.68) {
      onSnapChange("half");
    } else {
      onSnapChange("expanded");
    }
  };

  const totalParcels = stats?.total_parcels ?? parcelCount;
  const totalArea = stats?.total_area_m2 ?? 0;
  const totalOrphaned = stats?.orphaned_documents ?? orphanedCount;
  const ocrNeedsReview = stats
    ? stats.ocr_by_verification_status.DRAFT_AI +
      stats.ocr_by_verification_status.NEEDS_REVIEW
    : 0;

  const hasSelection = Boolean(parcelDetail || selectedFeature);
  const displayCode =
    parcelDetail?.parcel_code ?? selectedFeature?.properties.parcel_code ?? "";
  const displayStatus =
    parcelDetail?.legal_status ?? selectedFeature?.properties.legal_status;
  const displayName =
    parcelDetail?.name ?? selectedFeature?.properties.name ?? null;
  const displayLocation = parcelDetail
    ? [parcelDetail.desa_kelurahan, parcelDetail.kecamatan]
        .filter(Boolean)
        .join(", ")
    : [
        selectedFeature?.properties.desa_kelurahan,
        selectedFeature?.properties.kecamatan,
      ]
        .filter(Boolean)
        .join(", ");

  const areaDoc = toNumber(
    parcelDetail?.area_m2 ?? selectedFeature?.properties.area_m2,
  );
  const areaGis = toNumber(
    parcelDetail?.gis_area_m2 ?? selectedFeature?.properties.gis_area_m2,
  );
  const delta =
    areaDoc !== null && areaGis !== null ? areaDoc - areaGis : null;
  const docCount = parcelDetail
    ? parcelDetail.documents.length
    : (selectedFeature?.properties.document_count ?? 0);
  const hasGeometry = Boolean(
    parcelDetail?.geometry ?? selectedFeature?.geometry,
  );

  const sheetStyle =
    dragHeightPx !== null
      ? { height: `${dragHeightPx}px` }
      : { height: `${activeSnapVh}dvh` };

  return (
    <section
      aria-label="Panel data LDKH mobile"
      style={sheetStyle}
      className={`fixed inset-x-0 bottom-0 z-30 flex min-h-[88px] flex-col overflow-hidden rounded-t-2xl border-t border-slate-200/90 bg-white shadow-[0_-10px_30px_-10px_rgba(15,23,42,0.22)] md:hidden ${
        dragHeightPx === null ? "transition-[height] duration-300 ease-out" : ""
      }`}
    >
      {/* Drag Handle + 1-Baris Ringkasan */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        className="shrink-0 cursor-grab select-none touch-none border-b border-slate-100 bg-white px-4 pb-2.5 pt-2 active:cursor-grabbing"
      >
        <div className="mx-auto mb-2 h-1.5 w-11 rounded-full bg-slate-300" />
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-800">
              {totalParcels} Persil · {formatArea(totalArea)} · {totalOrphaned}{" "}
              Belum Dipetakan
            </p>
          </div>
          <div
            className="flex shrink-0 items-center gap-1"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {snap !== "peek" && (
              <button
                type="button"
                onClick={() => onSnapChange("peek")}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 active:bg-slate-100"
                aria-label="Ciutkan panel bawah"
              >
                <ChevronDown className="h-3.5 w-3.5" />
                Ciutkan
              </button>
            )}
            {snap !== "expanded" && (
              <button
                type="button"
                onClick={() =>
                  onSnapChange(snap === "peek" ? "half" : "expanded")
                }
                className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 active:bg-blue-100"
                aria-label="Perluas panel bawah"
              >
                <ChevronUp className="h-3.5 w-3.5" />
                {snap === "peek" ? "Buka" : "Perluas"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Konten Sheet saat Half atau Expanded */}
      {snap !== "peek" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50/40">
          {/* Quick Selected Parcel Card */}
          {hasSelection && (
            <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-sm font-bold text-slate-900">
                      {displayCode}
                    </span>
                    {displayStatus && (
                      <LegalStatusBadge status={displayStatus} />
                    )}
                    {detailLoading && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                    )}
                  </div>
                  {(displayName || displayLocation) && (
                    <p className="mt-0.5 truncate text-[11px] text-slate-600">
                      {displayName ?? "-"}
                      {displayLocation ? ` · ${displayLocation}` : ""}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClearSelection}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Tutup persil terpilih"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {detailError && (
                <p className="mt-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
                  {detailError}
                </p>
              )}

              <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px]">
                <div>
                  <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    Luas Surat
                  </span>
                  <span className="font-semibold tabular-nums text-slate-900">
                    {formatArea(areaDoc)}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    Luas GIS
                  </span>
                  <span className="font-semibold tabular-nums text-slate-900">
                    {formatArea(areaGis)}
                  </span>
                  {delta !== null && Math.abs(delta) > 0.5 && (
                    <span className="ml-1 font-medium text-amber-600">
                      (Δ {formatArea(delta)})
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={docCount === 0 && !canEdit}
                  onClick={onOpenPrimaryPdf}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm active:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {docCount > 0 ? (
                    <>
                      <FileText className="h-4 w-4" />
                      Lihat PDF ({docCount})
                    </>
                  ) : (
                    <>
                      <FileUp className="h-4 w-4" />
                      {canEdit ? "Upload PDF" : "Belum Ada PDF"}
                    </>
                  )}
                </button>

                {canDelete && (
                  <>
                    <button
                      type="button"
                      onClick={onOpenEditModal}
                      disabled={!parcelDetail}
                      className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 active:bg-blue-100 disabled:opacity-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit Info
                    </button>
                    <button
                      type="button"
                      onClick={onStartEditGeometry}
                      disabled={!parcelDetail || !hasGeometry}
                      className={`inline-flex min-h-[44px] items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${
                        isEditingGeometry
                          ? "border-amber-300 bg-amber-100 text-amber-800"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700 active:bg-emerald-100"
                      }`}
                    >
                      <Pentagon className="h-3.5 w-3.5" />
                      Edit Peta
                    </button>
                  </>
                )}

                {snap === "half" && (
                  <button
                    type="button"
                    onClick={() => onSnapChange("expanded")}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 active:bg-slate-50"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    Detail Lengkap
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Tab Switcher di Sheet */}
          <div className="flex shrink-0 items-center gap-1 border-b border-slate-200 bg-slate-50 px-3 pt-2 text-xs">
            <button
              type="button"
              onClick={() => onDataTabChange("parcels")}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-t-lg px-3 py-2 font-medium transition-colors ${
                dataTab === "parcels"
                  ? "border border-b-0 border-slate-200 bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Table2 className="h-3.5 w-3.5" /> Tabel Persil ({parcelCount})
            </button>
            <button
              type="button"
              onClick={() => onDataTabChange("orphaned")}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-t-lg px-3 py-2 font-medium transition-colors ${
                dataTab === "orphaned"
                  ? "border border-b-0 border-slate-200 bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <FileWarning className="h-3.5 w-3.5" /> Belum Dipetakan (
              {orphanedCount})
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white pb-safe">
            {snap === "expanded" && stats && (
              <dl className="grid grid-cols-2 gap-2 border-b border-slate-200 bg-slate-50/70 p-3 text-xs sm:grid-cols-5">
                <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                  <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    Persil
                  </dt>
                  <dd className="mt-0.5 font-semibold text-slate-900">
                    {stats.total_parcels}
                  </dd>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                  <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    Total Luas
                  </dt>
                  <dd className="mt-0.5 font-semibold text-slate-900">
                    {formatArea(stats.total_area_m2)}
                  </dd>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                  <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    Dokumen
                  </dt>
                  <dd className="mt-0.5 font-semibold text-slate-900">
                    {stats.total_documents}
                  </dd>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                  <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    Orphaned
                  </dt>
                  <dd className="mt-0.5 font-semibold text-purple-600">
                    {stats.orphaned_documents}
                  </dd>
                </div>
                <div className="col-span-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 sm:col-span-1">
                  <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    Perlu Review OCR
                  </dt>
                  <dd className="mt-0.5 font-semibold text-amber-600">
                    {ocrNeedsReview}
                  </dd>
                </div>
              </dl>
            )}
            {children}
          </div>
        </div>
      )}
    </section>
  );
}
