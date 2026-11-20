"use client";

import { FileWarning, Layers, Loader2, LogOut, Search, Shield, Table2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";

import LoginPage from "@/components/auth/LoginPage";
import AISearchBar from "@/components/dashboard/AISearchBar";
import EditParcelModal from "@/components/dashboard/EditParcelModal";
import ImportParcelModal from "@/components/dashboard/ImportParcelModal";
import NewParcelModal from "@/components/dashboard/NewParcelModal";
import OrphanedList from "@/components/dashboard/OrphanedList";
import ParcelDetailPanel from "@/components/dashboard/ParcelDetailPanel";
import ParcelTable from "@/components/dashboard/ParcelTable";
import DocumentViewerPanel from "@/components/pdf/DocumentViewerPanel";
import UploadDocumentModal from "@/components/pdf/UploadDocumentModal";
import {
  ApiError,
  createParcel,
  deleteParcel,
  fetchCurrentUser,
  fetchOrphanedDocuments,
  fetchParcelDetail,
  fetchParcelsGeoJSON,
  fetchStats,
  linkDocumentToParcel,
  logoutSession,
  replaceDocumentPdf,
  searchParcelsWithAI,
  unlinkDocumentFromParcel,
  updateParcel,
} from "@/lib/api";
import { LEGAL_STATUSES, LEGAL_STATUS_META, formatArea } from "@/lib/thematic";
import type {
  AISearchResponse,
  DashboardStats,
  DocumentRead,
  GeoJSONGeometry,
  LegalStatus,
  ParcelCreatePayload,
  ParcelDetailRead,
  ParcelFeatureCollection,
  ParcelImportFeaturePreview,
  ParcelUpdatePayload,
  UserRead,
} from "@/lib/types";

// MapLibre membutuhkan `window` -> render hanya di client.
const ParcelMap = dynamic(() => import("@/components/map/ParcelMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center gap-2 bg-slate-50 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> Memuat peta...
    </div>
  ),
});

type DataTab = "parcels" | "orphaned";

interface UploadModalTarget {
  parcelId: string | null;
  parcelLabel: string | null;
  defaultLegalStatus: LegalStatus;
}

export default function Dashboard() {
  const [currentUser, setCurrentUser] = useState<UserRead | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<LegalStatus | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [geojson, setGeojson] = useState<ParcelFeatureCollection | null>(null);
  const [allParcels, setAllParcels] = useState<ParcelFeatureCollection | null>(null);
  const [orphaned, setOrphaned] = useState<DocumentRead[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dataTab, setDataTab] = useState<DataTab>("parcels");
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  const [parcelDetail, setParcelDetail] = useState<ParcelDetailRead | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [viewerRefreshSignal, setViewerRefreshSignal] = useState(0);
  const [uploadTarget, setUploadTarget] = useState<UploadModalTarget | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importPreviewFeatures, setImportPreviewFeatures] = useState<
    ParcelImportFeaturePreview[] | null
  >(null);
  const [editingGeometryParcel, setEditingGeometryParcel] = useState<ParcelDetailRead | null>(null);
  const [drawnGeometry, setDrawnGeometry] = useState<GeoJSONGeometry | null>(null);
  const [clearDraftSignal, setClearDraftSignal] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(480);
  const [viewerWidth, setViewerWidth] = useState(520);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AISearchResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleApiFailure = useCallback((err: unknown, setter: (msg: string) => void) => {
    if (err instanceof ApiError && err.status === 401) {
      setCurrentUser(null);
      setAuthError("Sesi login Anda telah berakhir. Silakan masuk kembali.");
      return;
    }
    setter((err as Error).message);
  }, []);

  useEffect(() => {
    let active = true;
    fetchCurrentUser()
      .then((user) => {
        if (!active) return;
        setCurrentUser(user);
        setAuthError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setCurrentUser(null);
        if (err instanceof ApiError && err.status !== 401) {
          setAuthError(err.message);
        }
      })
      .finally(() => {
        if (active) setAuthChecked(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const startResize = useCallback(
    (kind: "sidebar" | "viewer", event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const initialWidth = kind === "sidebar" ? sidebarWidth : viewerWidth;
      const min = kind === "sidebar" ? 340 : 360;
      const max = kind === "sidebar" ? 760 : 780;

      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const nextWidth = Math.min(max, Math.max(min, initialWidth - deltaX));
        if (kind === "sidebar") {
          setSidebarWidth(nextWidth);
        } else {
          setViewerWidth(nextWidth);
        }
      };

      const handleMouseUp = () => {
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [sidebarWidth, viewerWidth],
  );

  // Debounce pencarian.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadMapData = useCallback(async () => {
    const data = await fetchParcelsGeoJSON({ legalStatus: statusFilter, search });
    setGeojson(data);
  }, [statusFilter, search]);

  const loadGlobal = useCallback(async () => {
    const [all, orphanDocs, dashboardStats] = await Promise.all([
      fetchParcelsGeoJSON({}),
      fetchOrphanedDocuments(),
      fetchStats(),
    ]);
    setAllParcels(all);
    setOrphaned(orphanDocs);
    setStats(dashboardStats);
  }, []);

  const loadDetail = useCallback(
    async (parcelId: string) => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        setParcelDetail(await fetchParcelDetail(parcelId));
      } catch (err) {
        handleApiFailure(err, setDetailError);
      } finally {
        setDetailLoading(false);
      }
    },
    [handleApiFailure],
  );

  useEffect(() => {
    if (!currentUser) return;
    loadMapData()
      .then(() => setLoadError(null))
      .catch((err: unknown) => handleApiFailure(err, setLoadError));
  }, [currentUser, loadMapData, handleApiFailure]);

  useEffect(() => {
    if (!currentUser) return;
    loadGlobal().catch((err: unknown) => handleApiFailure(err, setLoadError));
  }, [currentUser, loadGlobal, handleApiFailure]);

  useEffect(() => {
    if (!currentUser) return;
    if (selectedParcelId) {
      loadDetail(selectedParcelId);
    } else {
      setParcelDetail(null);
    }
  }, [currentUser, selectedParcelId, loadDetail]);

  const handleSelectParcel = useCallback((parcelId: string | null) => {
    setSelectedParcelId(parcelId);
    setEditingGeometryParcel((prev) => (prev && prev.id === parcelId ? prev : null));
    if (parcelId) setDataTab("parcels");
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadMapData(),
      loadGlobal(),
      selectedParcelId ? loadDetail(selectedParcelId) : Promise.resolve(),
    ]);
  }, [loadMapData, loadGlobal, loadDetail, selectedParcelId]);

  const handleLinkDocument = useCallback(
    async (documentId: string, parcelId: string) => {
      try {
        await linkDocumentToParcel(documentId, parcelId);
        await refreshAll();
        setSelectedParcelId(parcelId);
      } catch (err) {
        handleApiFailure(err, setLoadError);
      }
    },
    [refreshAll, handleApiFailure],
  );

  const handleUnlinkDocument = useCallback(
    async (documentId: string) => {
      await unlinkDocumentFromParcel(documentId);
      await refreshAll();
    },
    [refreshAll],
  );

  const handleReplaceDocumentFile = useCallback(
    async (documentId: string, file: File) => {
      await replaceDocumentPdf(documentId, file);
      await refreshAll();
      if (activeDocumentId === documentId) {
        setViewerRefreshSignal((s) => s + 1);
      }
    },
    [refreshAll, activeDocumentId],
  );

  const handleCloseNewParcelModal = useCallback(() => {
    setDrawnGeometry(null);
    setClearDraftSignal((s) => s + 1);
  }, []);

  const handleCreateParcel = useCallback(
    async (payload: ParcelCreatePayload) => {
      const created = await createParcel(payload);
      setDrawnGeometry(null);
      setClearDraftSignal((s) => s + 1);
      await refreshAll();
      setDataTab("parcels");
      setSelectedParcelId(created.id);
    },
    [refreshAll],
  );

  const handleUpdateParcel = useCallback(
    async (parcelId: string, payload: ParcelUpdatePayload) => {
      await updateParcel(parcelId, payload);
      setEditModalOpen(false);
      await refreshAll();
    },
    [refreshAll],
  );

  const handleSaveEditedGeometry = useCallback(
    async (parcelId: string, geometry: GeoJSONGeometry) => {
      await updateParcel(parcelId, { geometry });
      await refreshAll();
      setEditingGeometryParcel(null);
    },
    [refreshAll],
  );

  const handleDeleteParcel = useCallback(
    async (parcelId: string) => {
      await deleteParcel(parcelId);
      setEditModalOpen(false);
      setEditingGeometryParcel(null);
      setSelectedParcelId(null);
      setParcelDetail(null);
      await Promise.all([loadMapData(), loadGlobal()]);
    },
    [loadMapData, loadGlobal],
  );

  const handleAISearch = useCallback(
    async (query: string) => {
      setAiLoading(true);
      setAiError(null);
      try {
        const response = await searchParcelsWithAI(query);
        setAiResult(response);
        setDataTab("parcels");
        setStatusFilter(null);
        setSearchInput("");
        setSearch("");
        if (response.parcel_ids.length === 1) {
          setSelectedParcelId(response.parcel_ids[0]);
        }
      } catch (err) {
        handleApiFailure(err, setAiError);
        setAiResult(null);
      } finally {
        setAiLoading(false);
      }
    },
    [handleApiFailure],
  );

  const handleClearAISearch = useCallback(() => {
    setAiResult(null);
    setAiError(null);
  }, []);

  const handleLogout = useCallback(async () => {
    await logoutSession();
    setCurrentUser(null);
    setGeojson(null);
    setAllParcels(null);
    setOrphaned([]);
    setStats(null);
    setEditingGeometryParcel(null);
    setEditModalOpen(false);
    setImportModalOpen(false);
    setImportPreviewFeatures(null);
    setSelectedParcelId(null);
    setParcelDetail(null);
    setActiveDocumentId(null);
    setAiResult(null);
  }, []);

  const highlightedParcelIds = useMemo(
    () => (aiResult ? aiResult.parcel_ids : null),
    [aiResult],
  );

  const features = useMemo(() => geojson?.features ?? [], [geojson]);

  if (!authChecked) {
    return (
      <div className="flex h-screen items-center justify-center gap-2 bg-slate-50 text-sm text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
        Memeriksa sesi autentikasi Web GIS LDKH...
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginPage
        initialError={authError}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setAuthError(null);
          setLoadError(null);
        }}
      />
    );
  }

  const canEdit = currentUser.role === "ADMIN" || currentUser.role === "AUDITOR";
  const canDelete = currentUser.role === "ADMIN";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 text-slate-800">
      {/* Header: judul, statistik, filter tematik, sesi pengguna */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/90 bg-white px-5 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <Layers className="h-5 w-5" />
          </div>
          <h1 className="text-base font-bold tracking-tight text-slate-900">
            Web GIS Digitalisasi Tanah LDKH
          </h1>
        </div>

        {stats && (
          <dl className="flex flex-wrap items-center divide-x divide-slate-200 rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-xs">
            <div className="px-3">
              <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Persil</dt>
              <dd className="font-semibold text-slate-900">{stats.total_parcels}</dd>
            </div>
            <div className="px-3">
              <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Total Luas</dt>
              <dd className="font-semibold text-slate-900">{formatArea(stats.total_area_m2)}</dd>
            </div>
            <div className="px-3">
              <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Dokumen</dt>
              <dd className="font-semibold text-slate-900">{stats.total_documents}</dd>
            </div>
            <div className="px-3">
              <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Orphaned</dt>
              <dd className="font-semibold text-purple-600">{stats.orphaned_documents}</dd>
            </div>
            <div className="px-3">
              <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Perlu Review OCR</dt>
              <dd className="font-semibold text-amber-600">
                {stats.ocr_by_verification_status.DRAFT_AI +
                  stats.ocr_by_verification_status.NEEDS_REVIEW}
              </dd>
            </div>
          </dl>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setStatusFilter(null)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === null
                ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            Semua
          </button>
          {LEGAL_STATUSES.map((status) => {
            const meta = LEGAL_STATUS_META[status];
            const active = statusFilter === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(active ? null : status)}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                style={{
                  borderColor: active ? meta.color : "#CBD5E1",
                  backgroundColor: active ? `${meta.color}22` : "#FFFFFF",
                }}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
                {meta.label}
                {stats && (
                  <span className="text-slate-500">
                    ({stats.parcels_by_legal_status[status] ?? 0})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs">
          <Shield className="h-3.5 w-3.5 text-blue-600" />
          <div className="leading-tight">
            <p className="font-semibold text-slate-800">{currentUser.full_name}</p>
            <p className="text-[10px] text-slate-500">
              {currentUser.email} · <span className="font-mono font-semibold text-blue-700">{currentUser.role}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="ml-1 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
            title="Keluar dari sesi Web GIS"
          >
            <LogOut className="h-3 w-3" /> Keluar
          </button>
        </div>
      </header>

      {loadError && (
        <p className="border-b border-red-200 bg-red-50 px-5 py-2 text-xs font-medium text-red-700">
          Gagal memuat data dari Backend API: {loadError}
        </p>
      )}

      {/* Layout responsif: Peta (kiri/atas) | Tabel & detail (kanan/bawah) | Viewer PDF (opsional) */}
      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-slate-50 p-3.5 lg:flex-row lg:overflow-hidden">
        <section className="relative min-h-[340px] min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm lg:min-h-0">
          <ParcelMap
            data={geojson}
            selectedParcelId={selectedParcelId}
            highlightedParcelIds={highlightedParcelIds}
            isAdmin={currentUser.role === "ADMIN"}
            canEdit={canEdit}
            importPreviewFeatures={importPreviewFeatures}
            onOpenImportModal={() => setImportModalOpen(true)}
            onSelectParcel={handleSelectParcel}
            onPolygonDrawn={(geom) => {
              if (!canEdit) {
                setLoadError("Peran VIEWER tidak memiliki izin membuat persil baru.");
                setClearDraftSignal((s) => s + 1);
                return;
              }
              setDrawnGeometry(geom);
            }}
            clearDraftSignal={clearDraftSignal}
            editingParcel={editingGeometryParcel}
            onSaveEditedGeometry={handleSaveEditedGeometry}
            onCancelEditGeometry={() => setEditingGeometryParcel(null)}
          />
        </section>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Ubah lebar panel tabel"
          onMouseDown={(e) => startResize("sidebar", e)}
          title="Geser untuk mengubah lebar panel"
          className="hidden w-1.5 shrink-0 cursor-col-resize rounded-full bg-slate-200/80 transition-colors hover:bg-blue-400 active:bg-blue-600 lg:block"
        />

        <section
          style={{ ["--sidebar-w" as string]: `${sidebarWidth}px` }}
          className="flex h-[460px] min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm lg:h-auto lg:w-[var(--sidebar-w)]"
        >
          <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50/70 px-3 pt-2 text-xs">
            <button
              type="button"
              onClick={() => setDataTab("parcels")}
              className={`inline-flex items-center gap-1.5 rounded-t-lg px-3 py-2 font-medium transition-colors ${
                dataTab === "parcels"
                  ? "border border-b-0 border-slate-200 bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Table2 className="h-3.5 w-3.5" /> Tabel Persil ({features.length})
            </button>
            <button
              type="button"
              onClick={() => setDataTab("orphaned")}
              className={`inline-flex items-center gap-1.5 rounded-t-lg px-3 py-2 font-medium transition-colors ${
                dataTab === "orphaned"
                  ? "border border-b-0 border-slate-200 bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <FileWarning className="h-3.5 w-3.5" /> Belum Dipetakan ({orphaned.length})
            </button>
          </div>

          {dataTab === "parcels" && (
            <>
              <AISearchBar
                loading={aiLoading}
                result={aiResult}
                error={aiError}
                onSearch={handleAISearch}
                onClear={handleClearAISearch}
                onOpenDocument={setActiveDocumentId}
              />
              <div className="border-b border-slate-200 bg-white px-3 py-2">
                <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/20">
                  <Search className="h-3.5 w-3.5 text-slate-400" />
                  <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Filter cepat kode persil, nama, alamat, desa..."
                    className="w-full bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400"
                  />
                </label>
              </div>
            </>
          )}

          <div
            className={`min-h-0 overflow-y-auto ${
              selectedParcelId && dataTab === "parcels" ? "h-[38%] shrink-0" : "flex-1"
            }`}
          >
            {dataTab === "parcels" ? (
              <ParcelTable
                features={features}
                selectedParcelId={selectedParcelId}
                highlightedParcelIds={highlightedParcelIds}
                onSelectParcel={handleSelectParcel}
              />
            ) : (
              <OrphanedList
                documents={orphaned}
                parcels={allParcels?.features ?? []}
                canEdit={canEdit}
                onOpenDocument={setActiveDocumentId}
                onOpenUploadModal={() =>
                  setUploadTarget({
                    parcelId: null,
                    parcelLabel: null,
                    defaultLegalStatus: "CLEAR",
                  })
                }
                onReplaceDocumentFile={handleReplaceDocumentFile}
                onLinkDocument={handleLinkDocument}
              />
            )}
          </div>

          {selectedParcelId && dataTab === "parcels" && (
            <div className="min-h-0 flex-1 overflow-y-auto border-t border-slate-200 bg-slate-50/40">
              <ParcelDetailPanel
                parcel={parcelDetail}
                loading={detailLoading}
                error={detailError}
                activeDocumentId={activeDocumentId}
                canEdit={canEdit}
                canDelete={canDelete}
                isEditingGeometry={
                  editingGeometryParcel?.id === parcelDetail?.id && Boolean(parcelDetail)
                }
                onOpenDocument={setActiveDocumentId}
                onOpenUploadModal={() => {
                  if (!parcelDetail) return;
                  setUploadTarget({
                    parcelId: parcelDetail.id,
                    parcelLabel: `${parcelDetail.parcel_code}${parcelDetail.name ? ` · ${parcelDetail.name}` : ""}`,
                    defaultLegalStatus: parcelDetail.legal_status,
                  });
                }}
                onOpenEditModal={() => setEditModalOpen(true)}
                onStartEditGeometry={() => {
                  if (!parcelDetail) return;
                  setEditingGeometryParcel((prev) =>
                    prev?.id === parcelDetail.id ? null : parcelDetail,
                  );
                }}
                onReplaceDocumentFile={handleReplaceDocumentFile}
                onUnlinkDocument={handleUnlinkDocument}
                onDeleteParcel={handleDeleteParcel}
                onClose={() => handleSelectParcel(null)}
              />
            </div>
          )}
        </section>

        {activeDocumentId && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Ubah lebar panel PDF viewer"
              onMouseDown={(e) => startResize("viewer", e)}
              title="Geser untuk mengubah lebar panel PDF"
              className="hidden w-1.5 shrink-0 cursor-col-resize rounded-full bg-slate-200/80 transition-colors hover:bg-blue-400 active:bg-blue-600 lg:block"
            />
            <section
              style={{ ["--viewer-w" as string]: `${viewerWidth}px` }}
              className="h-[520px] min-h-0 w-full shrink-0 lg:h-auto lg:w-[var(--viewer-w)]"
            >
              <DocumentViewerPanel
                documentId={activeDocumentId}
                currentUser={currentUser}
                canEdit={canEdit}
                refreshSignal={viewerRefreshSignal}
                onClose={() => setActiveDocumentId(null)}
                onDataChanged={refreshAll}
              />
            </section>
          </>
        )}
      </main>

      {drawnGeometry && canEdit && (
        <NewParcelModal
          geometry={drawnGeometry}
          orphanedDocuments={orphaned}
          existingParcelCount={allParcels?.total_features ?? features.length}
          onClose={handleCloseNewParcelModal}
          onSubmit={handleCreateParcel}
        />
      )}

      {editModalOpen && parcelDetail && canDelete && (
        <EditParcelModal
          parcel={parcelDetail}
          onClose={() => setEditModalOpen(false)}
          onSubmit={handleUpdateParcel}
          onOwnersChanged={refreshAll}
        />
      )}

      {uploadTarget && canEdit && (
        <UploadDocumentModal
          parcelId={uploadTarget.parcelId}
          parcelLabel={uploadTarget.parcelLabel}
          defaultLegalStatus={uploadTarget.defaultLegalStatus}
          onClose={() => setUploadTarget(null)}
          onUploaded={refreshAll}
        />
      )}

      {importModalOpen && canDelete && (
        <ImportParcelModal
          onClose={() => {
            setImportModalOpen(false);
            setImportPreviewFeatures(null);
          }}
          onPreviewFeaturesChange={setImportPreviewFeatures}
          onImported={refreshAll}
        />
      )}
    </div>
  );
}
