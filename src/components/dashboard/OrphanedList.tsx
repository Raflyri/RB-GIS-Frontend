"use client";

import { CheckCircle2, FileText, FileUp, Link2, Loader2, Upload } from "lucide-react";
import { useState } from "react";

import { LegalStatusBadge, VerificationBadge } from "@/components/ui/Badges";
import { formatArea } from "@/lib/thematic";
import type { DocumentRead, ParcelFeature } from "@/lib/types";

interface OrphanedListProps {
  documents: DocumentRead[];
  parcels: ParcelFeature[];
  canEdit: boolean;
  onOpenDocument: (documentId: string) => void;
  onOpenUploadModal: () => void;
  onReplaceDocumentFile: (documentId: string, file: File) => Promise<void>;
  onLinkDocument: (documentId: string, parcelId: string) => Promise<void>;
}

export default function OrphanedList({
  documents,
  parcels,
  canEdit,
  onOpenDocument,
  onOpenUploadModal,
  onReplaceDocumentFile,
  onLinkDocument,
}: OrphanedListProps) {
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  return (
    <div className="bg-white">
      {canEdit && (
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/70 px-4 py-2.5 text-xs">
          <span className="text-[11px] text-slate-600">
            Unggah dokumen scan PDF baru atau ganti file dummy CSV di bawah.
          </span>
          <button
            type="button"
            onClick={onOpenUploadModal}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <FileUp className="h-3.5 w-3.5" /> + Upload PDF Baru
          </button>
        </div>
      )}

      {uploadError && (
        <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          {uploadError}
        </p>
      )}

      {!documents.length ? (
        <p className="p-6 text-center text-sm text-slate-500">
          Semua dokumen sudah tertaut ke poligon persil.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 bg-white">
          {documents.map((doc) => {
            const hasUploadedPdf = Boolean(doc.file_checksum_sha256);
            const isUploading = uploadingId === doc.id;
            return (
              <li key={doc.id} className="space-y-2.5 px-4 py-3 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono font-semibold text-slate-900">{doc.document_number}</p>
                    <p className="truncate text-slate-600">{doc.title ?? "-"}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {doc.document_type} · Luas surat {formatArea(doc.stated_area_m2)}
                      {doc.original_area_value !== null &&
                        ` (${doc.original_area_value} ${doc.original_area_unit ?? ""})`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <LegalStatusBadge status={doc.legal_status} />
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

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenDocument(doc.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                  >
                    <FileText className="h-3.5 w-3.5 text-blue-600" /> Lihat PDF &amp; OCR
                  </button>

                  {canEdit && (
                    <label
                      className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-medium text-blue-700 shadow-sm transition-colors hover:bg-blue-100 ${
                        isUploading ? "pointer-events-none opacity-50" : ""
                      }`}
                    >
                      {isUploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      {hasUploadedPdf ? "Ganti PDF" : "Upload / Ganti PDF"}
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        className="hidden"
                        disabled={isUploading}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) return;
                          setUploadingId(doc.id);
                          setUploadError(null);
                          try {
                            await onReplaceDocumentFile(doc.id, file);
                          } catch (err) {
                            setUploadError((err as Error).message);
                          } finally {
                            setUploadingId(null);
                          }
                        }}
                      />
                    </label>
                  )}

                  {canEdit && (
                    <>
                      <select
                        value={targets[doc.id] ?? ""}
                        onChange={(e) => setTargets((t) => ({ ...t, [doc.id]: e.target.value }))}
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[11px] text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
                      >
                        <option value="">— Pilih persil hasil pemetaan —</option>
                        {parcels.map((f) => (
                          <option key={f.properties.id} value={f.properties.id}>
                            {f.properties.parcel_code} · {f.properties.name ?? ""}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!targets[doc.id] || busyId === doc.id}
                        onClick={async () => {
                          setBusyId(doc.id);
                          try {
                            await onLinkDocument(doc.id, targets[doc.id]);
                          } finally {
                            setBusyId(null);
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        {busyId === doc.id ? "Menautkan..." : "Tautkan"}
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
