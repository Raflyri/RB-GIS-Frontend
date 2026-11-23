"use client";

import { FileSearch, FileText, Loader2, RefreshCw, Upload, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import OcrReviewPanel from "@/components/ocr/OcrReviewPanel";
import GuestCanvasPdfViewer from "@/components/pdf/GuestCanvasPdfViewer";
import { LegalStatusBadge, VerificationBadge } from "@/components/ui/Badges";
import { fetchDocumentDetail, fetchSignedPdfUrl, replaceDocumentPdf } from "@/lib/api";
import type { DocumentDetailRead, UserRead } from "@/lib/types";

interface DocumentViewerPanelProps {
  documentId: string;
  currentUser: UserRead;
  canEdit: boolean;
  refreshSignal?: number;
  onClose: () => void;
  onDataChanged: () => Promise<void> | void;
}

type Tab = "pdf" | "ocr";

/**
 * Split-pane PDF Viewer terintegrasi (tidak membuka tab baru).
 * PDF ditarik melalui signed token URL (skill Nextcloud-Synology-Linker).
 */
export default function DocumentViewerPanel({
  documentId,
  currentUser,
  canEdit,
  refreshSignal = 0,
  onClose,
  onDataChanged,
}: DocumentViewerPanelProps) {
  const [tab, setTab] = useState<Tab>("pdf");
  const [document, setDocument] = useState<DocumentDetailRead | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const syncViewport = () => setIsMobileViewport(media.matches);
    syncViewport();
    media.addEventListener("change", syncViewport);
    return () => media.removeEventListener("change", syncViewport);
  }, []);

  const loadDocument = useCallback(async () => {
    const detail = await fetchDocumentDetail(documentId);
    setDocument(detail);
  }, [documentId]);

  const refreshPdfUrl = useCallback(async () => {
    const signed = await fetchSignedPdfUrl(documentId);
    setPdfUrl(`${signed.stream_url}&_v=${Date.now()}`);
    setExpiresAt(Date.now() + signed.expires_in_seconds * 1000);
  }, [documentId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdfUrl(null);
    Promise.all([loadDocument(), refreshPdfUrl()])
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [loadDocument, refreshPdfUrl, refreshSignal]);

  // Perbarui token sebelum kedaluwarsa agar viewer tetap bisa dimuat ulang.
  useEffect(() => {
    if (!expiresAt) return;
    const ms = Math.max(expiresAt - Date.now() - 30_000, 5_000);
    const timer = setTimeout(() => {
      refreshPdfUrl().catch(() => undefined);
    }, ms);
    return () => clearTimeout(timer);
  }, [expiresAt, refreshPdfUrl]);

  const handleVerified = async () => {
    await loadDocument();
    await onDataChanged();
  };

  const handleReplacePdf = async (file: File) => {
    setReplacing(true);
    setError(null);
    try {
      await replaceDocumentPdf(documentId, file);
      await Promise.all([loadDocument(), refreshPdfUrl()]);
      await onDataChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setReplacing(false);
    }
  };

  const isGuest = currentUser.role === "GUEST";

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-start justify-between gap-2 border-b border-slate-200 bg-slate-50/70 px-4 py-3">
        <div className="min-w-0 text-xs">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <FileText className="h-3.5 w-3.5 text-blue-600" /> Dokumen Legal
          </p>
          <p className="truncate font-mono text-sm font-bold text-slate-900">
            {document?.document_number ?? "Memuat..."}
          </p>
          {document && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <LegalStatusBadge status={document.legal_status} />
              <VerificationBadge status={document.verification_status} />
              {document.is_orphaned && (
                <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700">
                  Orphaned
                </span>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-700"
          aria-label="Tutup viewer dokumen"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <nav className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50/50 px-3 pt-2 text-xs">
        {(
          isGuest
            ? ([["pdf", "PDF Viewer (Read-Only)", FileText]] as const)
            : ([
                ["pdf", "PDF Viewer", FileText],
                ["ocr", "Verifikasi OCR (HITL)", FileSearch],
              ] as const)
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 rounded-t-lg px-3 py-2 font-medium transition-colors ${
              tab === key
                ? "border border-b-0 border-slate-200 bg-white text-blue-600 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
        {tab === "pdf" && (
          <div className="ml-auto flex items-center gap-2">
            {canEdit && (
              <label
                className={`inline-flex cursor-pointer items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 ${
                  replacing ? "pointer-events-none opacity-50" : ""
                }`}
              >
                {replacing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Upload className="h-3 w-3" />
                )}
                {document?.file_checksum_sha256 ? "Ganti PDF" : "Upload PDF Asli"}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  disabled={replacing}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) {
                      handleReplacePdf(file);
                    }
                  }}
                />
              </label>
            )}
            <button
              type="button"
              onClick={() => refreshPdfUrl().catch((e: Error) => setError(e.message))}
              className="inline-flex items-center gap-1 px-2 text-[11px] font-medium text-slate-500 hover:text-blue-600"
              title="Perbarui token akses PDF"
            >
              <RefreshCw className="h-3 w-3" /> Muat ulang
            </button>
          </div>
        )}
      </nav>

      {!loading && document && !document.file_checksum_sha256 && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-[11px] text-amber-800">
          Menampilkan PDF placeholder dari data CSV/seed. Gunakan tombol{" "}
          <strong>Upload PDF Asli</strong> di atas untuk menggantinya dengan scan PDF fisik.
        </div>
      )}

      <div className="min-h-0 flex-1 bg-white">
        {loading && (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> Memuat dokumen...
          </div>
        )}
        {!loading && error && (
          <p className="p-4 text-sm text-red-600">Gagal memuat dokumen: {error}</p>
        )}
        {!loading && !error && tab === "pdf" && pdfUrl && (
          isGuest || isMobileViewport ? (
            <GuestCanvasPdfViewer
              pdfUrl={pdfUrl}
              currentUser={currentUser}
              readOnlyGuest={isGuest}
              onClose={onClose}
            />
          ) : (
            <iframe
              key={pdfUrl}
              src={pdfUrl}
              title={`PDF ${document?.document_number ?? ""}`}
              className="h-full w-full bg-slate-100"
            />
          )
        )}
        {!loading && !error && tab === "ocr" && document && !isGuest && (
          <OcrReviewPanel
            document={document}
            currentUser={currentUser}
            canEdit={canEdit}
            onVerified={handleVerified}
          />
        )}
      </div>

      {document && !isGuest && (
        <footer className="truncate border-t border-slate-200 bg-slate-50 px-4 py-2 font-mono text-[10px] text-slate-500">
          /mnt/synology/LDKH-Documents/{document.synology_file_path}
        </footer>
      )}
    </aside>
  );
}
