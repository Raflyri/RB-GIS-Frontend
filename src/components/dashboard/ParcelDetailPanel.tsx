"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  FileUp,
  Loader2,
  MapPin,
  Pencil,
  Pentagon,
  Trash2,
  Unlink,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { LegalStatusBadge, VerificationBadge } from "@/components/ui/Badges";
import { formatArea, toNumber } from "@/lib/thematic";
import type { ParcelDetailRead } from "@/lib/types";

interface ParcelDetailPanelProps {
  parcel: ParcelDetailRead | null;
  loading: boolean;
  error: string | null;
  activeDocumentId: string | null;
  canEdit: boolean;
  canDelete: boolean;
  isEditingGeometry?: boolean;
  onOpenDocument: (documentId: string) => void;
  onOpenUploadModal: () => void;
  onOpenEditModal: () => void;
  onStartEditGeometry: () => void;
  onReplaceDocumentFile: (documentId: string, file: File) => Promise<void>;
  onUnlinkDocument: (documentId: string) => Promise<void>;
  onDeleteParcel: (parcelId: string) => Promise<void>;
  onClose: () => void;
}

export default function ParcelDetailPanel({
  parcel,
  loading,
  error,
  activeDocumentId,
  canEdit,
  canDelete,
  isEditingGeometry = false,
  onOpenDocument,
  onOpenUploadModal,
  onOpenEditModal,
  onStartEditGeometry,
  onReplaceDocumentFile,
  onUnlinkDocument,
  onDeleteParcel,
  onClose,
}: ParcelDetailPanelProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [docActionError, setDocActionError] = useState<string | null>(null);

  useEffect(() => {
    setConfirmOpen(false);
    setDeleting(false);
    setDeleteError(null);
    setBusyDocId(null);
    setDocActionError(null);
  }, [parcel?.id]);
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> Memuat detail persil...
      </div>
    );
  }
  if (error) {
    return <p className="p-4 text-sm text-red-600">Gagal memuat detail: {error}</p>;
  }
  if (!parcel) return null;

  const areaDoc = toNumber(parcel.area_m2);
  const areaGis = toNumber(parcel.gis_area_m2);
  const delta = areaDoc !== null && areaGis !== null ? areaDoc - areaGis : null;

  return (
    <div className="space-y-4 bg-white p-4 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-blue-600" />
            <h3 className="font-mono text-sm font-bold text-slate-900">{parcel.parcel_code}</h3>
            <LegalStatusBadge status={parcel.legal_status} />
          </div>
          <p className="mt-1 font-medium text-slate-700">{parcel.name ?? "-"}</p>
          <p className="text-slate-500">
            {[parcel.desa_kelurahan, parcel.kecamatan, parcel.kabupaten_kota, parcel.provinsi]
              .filter(Boolean)
              .join(", ")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {canDelete && (
            <>
              <button
                type="button"
                onClick={onOpenEditModal}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-100"
                title="Edit atribut tabular, status hukum, dan luas surat persil"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Info
              </button>
              <button
                type="button"
                onClick={onStartEditGeometry}
                disabled={!parcel.geometry}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  isEditingGeometry
                    ? "border-amber-300 bg-amber-100 text-amber-800"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100"
                }`}
                title="Edit titik sudut (vertex) poligon persil ini langsung di peta"
              >
                <Pentagon className="h-3.5 w-3.5" />
                {isEditingGeometry ? "Mode Edit Peta" : "Edit Peta"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteError(null);
                  setConfirmOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 shadow-sm transition-colors hover:border-red-300 hover:bg-red-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Hapus Persil
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Tutup detail persil"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2.5">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 shadow-sm">
          <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Luas Surat
          </dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">
            {formatArea(areaDoc)}
          </dd>
          {parcel.original_area_value !== null && (
            <dd className="text-[10px] text-slate-500">
              asli: {parcel.original_area_value} {parcel.original_area_unit}
            </dd>
          )}
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 shadow-sm">
          <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Luas GIS
          </dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">
            {formatArea(areaGis)}
          </dd>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 shadow-sm">
          <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Selisih
          </dt>
          <dd
            className={`mt-0.5 font-semibold tabular-nums ${
              delta !== null && Math.abs(delta) > 0.5 ? "text-amber-600" : "text-slate-900"
            }`}
          >
            {formatArea(delta)}
          </dd>
        </div>
      </dl>

      {parcel.notes && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-slate-700">
          {parcel.notes}
        </p>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Dokumen Legal ({parcel.documents.length})
          </h4>
          {canEdit && (
            <button
              type="button"
              onClick={onOpenUploadModal}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <FileUp className="h-3.5 w-3.5" /> + Upload PDF Referensi
            </button>
          )}
        </div>
        {docActionError && (
          <p className="mb-2 rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">
            {docActionError}
          </p>
        )}
        <ul className="space-y-2">
          {parcel.documents.map((doc) => {
            const hasUploadedPdf = Boolean(doc.file_checksum_sha256);
            const isBusy = busyDocId === doc.id;
            return (
              <li
                key={doc.id}
                className={`rounded-lg border p-2.5 shadow-sm transition-colors ${
                  doc.id === activeDocumentId
                    ? "border-blue-500 bg-blue-50/70"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenDocument(doc.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-blue-700"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-blue-600" />
                    <span className="min-w-0">
                      <span className="block truncate font-mono font-semibold text-slate-900">
                        {doc.document_number}
                      </span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {doc.document_type} · {doc.title ?? "-"}
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <VerificationBadge status={doc.verification_status} />
                    {hasUploadedPdf ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" /> PDF Terunggah
                      </span>
                    ) : (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        Dummy / Placeholder
                      </span>
                    )}
                  </div>
                </div>

                {canEdit && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
                    <button
                      type="button"
                      onClick={() => onOpenDocument(doc.id)}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Buka Viewer
                    </button>
                    <label
                      className={`inline-flex cursor-pointer items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700 hover:bg-blue-100 ${
                        isBusy ? "pointer-events-none opacity-50" : ""
                      }`}
                    >
                      {isBusy ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Upload className="h-3 w-3" />
                      )}
                      {hasUploadedPdf ? "Ganti PDF" : "Upload PDF Asli"}
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        className="hidden"
                        disabled={isBusy}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) return;
                          setBusyDocId(doc.id);
                          setDocActionError(null);
                          try {
                            await onReplaceDocumentFile(doc.id, file);
                          } catch (err) {
                            setDocActionError((err as Error).message);
                          } finally {
                            setBusyDocId(null);
                          }
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={async () => {
                        setBusyDocId(doc.id);
                        setDocActionError(null);
                        try {
                          await onUnlinkDocument(doc.id);
                        } catch (err) {
                          setDocActionError((err as Error).message);
                        } finally {
                          setBusyDocId(null);
                        }
                      }}
                      className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
                      title="Lepas tautan dokumen dari persil ini tanpa menghapus file"
                    >
                      <Unlink className="h-3 w-3" /> Lepas
                    </button>
                  </div>
                )}
              </li>
            );
          })}
          {!parcel.documents.length && (
            <li className="text-slate-500">Belum ada dokumen tertaut.</li>
          )}
        </ul>
      </section>

      <section>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Riwayat Kepemilikan
        </h4>
        <ol className="relative space-y-2.5 border-l-2 border-slate-200 pl-4">
          {parcel.owners.map((owner) => (
            <li key={owner.id} className="relative">
              <span
                className={`absolute -left-[22px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                  owner.is_current_owner ? "bg-blue-600" : "bg-slate-400"
                }`}
              />
              <p className="font-semibold text-slate-900">
                {owner.sequence_order}. {owner.owner_name}
                {owner.is_current_owner && (
                  <span className="ml-1.5 text-[10px] font-medium text-blue-600">(aktif)</span>
                )}
              </p>
              <p className="text-[11px] text-slate-500">
                {owner.owner_type} · {owner.acquisition_type ?? "-"} ·{" "}
                {owner.acquisition_date ?? "-"}
              </p>
              {owner.transfer_notes && (
                <p className="text-[11px] text-slate-600">{owner.transfer_notes}</p>
              )}
            </li>
          ))}
          {!parcel.owners.length && <li className="text-slate-500">Belum ada data.</li>}
        </ol>
      </section>

      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-parcel-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start gap-3 border-b border-slate-200 bg-red-50/70 px-5 py-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white shadow-sm">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 id="delete-parcel-title" className="text-sm font-bold text-slate-900">
                  Konfirmasi Hapus Persil
                </h3>
                <p className="mt-0.5 font-mono text-xs font-semibold text-red-700">
                  {parcel.parcel_code}
                  {parcel.name ? ` · ${parcel.name}` : ""}
                </p>
              </div>
            </div>

            <div className="space-y-3 p-5 text-xs">
              <p className="leading-relaxed text-slate-700">
                Apakah Anda yakin ingin menghapus data persil ini? Peringatan: Tindakan ini hanya
                menghapus data peta dan tabular, dokumen fisik PDF tetap aman di dalam Vault.
              </p>

              {deleteError && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-red-700">
                  Gagal menghapus persil: {deleteError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-100 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  setDeleteError(null);
                  try {
                    await onDeleteParcel(parcel.id);
                    setConfirmOpen(false);
                  } catch (err) {
                    setDeleteError((err as Error).message);
                  } finally {
                    setDeleting(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                {deleting ? "Menghapus..." : "Ya, Hapus Persil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
