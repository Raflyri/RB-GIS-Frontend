"use client";

import { AlertTriangle, FileUp, Loader2, Upload, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { uploadDocumentPdf } from "@/lib/api";
import { LEGAL_STATUSES, LEGAL_STATUS_META } from "@/lib/thematic";
import type { DocumentType, LegalStatus } from "@/lib/types";

interface UploadDocumentModalProps {
  parcelId?: string | null;
  parcelLabel?: string | null;
  defaultLegalStatus?: LegalStatus;
  onClose: () => void;
  onUploaded: () => Promise<void> | void;
}

const DOCUMENT_TYPES: DocumentType[] = [
  "GIRIK",
  "SHM",
  "SHGB",
  "AJB",
  "LETTER_C",
  "SPH",
  "PUTUSAN_PENGADILAN",
  "BERITA_ACARA_SITA",
  "LAINNYA",
];

const AREA_UNITS = [
  { value: "m2", label: "m² (Meter Persegi)" },
  { value: "Ha", label: "Ha (Hektar)" },
  { value: "are", label: "Are" },
  { value: "bata", label: "Bata / Tumbak (14 m²)" },
];

export default function UploadDocumentModal({
  parcelId = null,
  parcelLabel = null,
  defaultLegalStatus = "CLEAR",
  onClose,
  onUploaded,
}: UploadDocumentModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [documentNumber, setDocumentNumber] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType>("GIRIK");
  const [title, setTitle] = useState("");
  const [issuingOffice, setIssuingOffice] = useState("");
  const [legalStatus, setLegalStatus] = useState<LegalStatus>(defaultLegalStatus);
  const [areaValue, setAreaValue] = useState("");
  const [areaUnit, setAreaUnit] = useState("m2");
  const [notes, setNotes] = useState("");

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!files.length) return;

    setUploading(true);
    setError(null);
    try {
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        setProgress(`Mengunggah ${i + 1}/${files.length}: ${file.name}...`);

        const baseNumber = documentNumber.trim();
        const computedNumber =
          baseNumber && files.length > 1
            ? `${baseNumber}-${String(i + 1).padStart(2, "0")}`
            : baseNumber || undefined;

        const baseTitle = title.trim();
        const computedTitle =
          baseTitle && files.length > 1
            ? `${baseTitle} (${file.name.replace(/\.pdf$/i, "")})`
            : baseTitle || undefined;

        await uploadDocumentPdf({
          file,
          parcel_id: parcelId ?? null,
          document_number: computedNumber,
          document_type: documentType,
          title: computedTitle,
          issuing_office: issuingOffice.trim() || undefined,
          legal_status: legalStatus,
          original_area_value: areaValue.trim() || null,
          original_area_unit: areaUnit,
          notes: notes.trim() || undefined,
        });
      }
      await onUploaded();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setUploading(false);
      setProgress(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-pdf-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
    >
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
              <FileUp className="h-4 w-4" />
            </div>
            <div>
              <h2 id="upload-pdf-modal-title" className="text-sm font-bold text-slate-900">
                {parcelId ? "Upload PDF Referensi Bidang Tanah" : "Upload Dokumen PDF Baru (Orphaned)"}
              </h2>
              <p className="text-xs text-slate-500">
                {parcelLabel
                  ? `Target persil: ${parcelLabel} (mendukung banyak file PDF sekaligus)`
                  : "Pilih satu atau beberapa file PDF legal untuk didaftarkan ke database"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700"
            aria-label="Tutup modal upload PDF"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto p-5 text-xs">
          <label className="block space-y-1.5 rounded-xl border border-dashed border-blue-300 bg-blue-50/50 p-4">
            <span className="flex items-center gap-1.5 font-semibold text-blue-900">
              <Upload className="h-4 w-4 text-blue-600" />
              Pilih File PDF (bisa pilih lebih dari 1 file sekaligus) *
            </span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              multiple
              required
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="block w-full cursor-pointer text-xs text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-blue-700"
            />
            {files.length > 0 && (
              <ul className="mt-2 space-y-1 rounded-lg border border-blue-200 bg-white p-2 text-[11px] text-slate-700">
                {files.map((f) => (
                  <li key={`${f.name}-${f.size}`} className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono">{f.name}</span>
                    <span className="shrink-0 text-slate-500">
                      {(f.size / 1024).toFixed(1)} KB
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="font-medium text-slate-700">Jenis Dokumen *</span>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value as DocumentType)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
              >
                {DOCUMENT_TYPES.map((dt) => (
                  <option key={dt} value={dt}>
                    {dt}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700">Status Hukum *</span>
              <select
                value={legalStatus}
                onChange={(e) => setLegalStatus(e.target.value as LegalStatus)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
              >
                {LEGAL_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {LEGAL_STATUS_META[status].label} ({status})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="font-medium text-slate-700">
                Nomor Dokumen (opsional)
              </span>
              <input
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                placeholder="Otomatis jika dikosongkan"
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700">Instansi / Penerbit</span>
              <input
                value={issuingOffice}
                onChange={(e) => setIssuingOffice(e.target.value)}
                placeholder="mis. BPN / PPAT / Kelurahan"
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="font-medium text-slate-700">Judul / Keterangan Dokumen</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Otomatis dari nama file PDF jika dikosongkan"
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="font-medium text-slate-700">Luas Tercantum (opsional)</span>
              <input
                type="number"
                step="any"
                min="0"
                value={areaValue}
                onChange={(e) => setAreaValue(e.target.value)}
                placeholder="mis. 2500"
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700">Satuan Luas</span>
              <select
                value={areaUnit}
                onChange={(e) => setAreaUnit(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
              >
                {AREA_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-1">
            <span className="font-medium text-slate-700">Catatan Tambahan</span>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="mis. Lampiran gambar situasi, kwitansi jual beli, dll."
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
            />
          </label>

          {progress && (
            <p className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-blue-700">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              {progress}
            </p>
          )}

          {error && (
            <p className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2.5 text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          <footer className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
            <button
              type="button"
              disabled={uploading}
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={uploading || !files.length}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="h-4 w-4" />
              )}
              {uploading ? "Mengunggah..." : `Upload ${files.length || ""} PDF`}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
