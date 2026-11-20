"use client";

import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { VerificationBadge } from "@/components/ui/Badges";
import { verifyOcr } from "@/lib/api";
import { toNumber } from "@/lib/thematic";
import type { DocumentDetailRead, UserRead, VerificationStatus } from "@/lib/types";

interface OcrReviewPanelProps {
  document: DocumentDetailRead;
  currentUser: UserRead;
  canEdit: boolean;
  onVerified: () => Promise<void> | void;
}

const pretty = (value: unknown) => JSON.stringify(value ?? {}, null, 2);

export default function OcrReviewPanel({
  document,
  currentUser,
  canEdit,
  onVerified,
}: OcrReviewPanelProps) {
  const ocr = document.ocr_raw_data;
  const initialJson = useMemo(
    () => pretty(ocr?.reviewed_json ?? ocr?.extracted_json ?? {}),
    [ocr],
  );

  const reviewerIdentity = `${currentUser.full_name} (${currentUser.email})`;
  const [jsonText, setJsonText] = useState(initialJson);
  const [rawText, setRawText] = useState(ocr?.raw_text ?? "");
  const [status, setStatus] = useState<VerificationStatus>("VERIFIED");
  const [notes, setNotes] = useState(ocr?.review_notes ?? "");
  const [syncToDocument, setSyncToDocument] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  useEffect(() => {
    setJsonText(initialJson);
    setRawText(ocr?.raw_text ?? "");
    setNotes(ocr?.review_notes ?? "");
    setMessage(null);
  }, [initialJson, ocr]);

  const jsonError = useMemo(() => {
    try {
      const parsed = JSON.parse(jsonText);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return "reviewed_json harus berupa objek JSON.";
      }
      return null;
    } catch (err) {
      return `JSON tidak valid: ${(err as Error).message}`;
    }
  }, [jsonText]);

  const confidence = toNumber(ocr?.confidence_score);

  async function handleSubmit() {
    if (jsonError || !canEdit) return;
    setSaving(true);
    setMessage(null);
    try {
      await verifyOcr(document.id, {
        reviewed_json: JSON.parse(jsonText),
        raw_text: rawText || null,
        verification_status: status,
        review_notes: notes || null,
        reviewed_by: reviewerIdentity,
        sync_to_document: syncToDocument,
      });
      setMessage({ kind: "ok", text: "Hasil review OCR tersimpan & tersinkron." });
      await onVerified();
    } catch (err) {
      setMessage({ kind: "err", text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto bg-white p-4 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-slate-600">Status saat ini:</span>
        <VerificationBadge status={ocr?.verification_status ?? document.verification_status} />
        {ocr && (
          <span className="text-slate-500">
            Engine <span className="font-mono text-slate-700">{ocr.ocr_engine}</span>
            {confidence !== null && ` · confidence ${(confidence * 100).toFixed(1)}%`}
          </span>
        )}
      </div>

      {!ocr && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-amber-800">
          Dokumen belum memiliki hasil OCR AI. Anda tetap dapat mengisi data hasil review manual.
        </p>
      )}

      {ocr && (
        <details className="rounded-lg border border-slate-200 bg-slate-50">
          <summary className="cursor-pointer px-3 py-2 font-medium text-slate-700">
            Hasil ekstraksi asli Claude AI (read-only)
          </summary>
          <pre className="max-h-40 overflow-auto px-3 pb-3 font-mono text-[11px] text-slate-600">
            {pretty(ocr.extracted_json)}
          </pre>
        </details>
      )}

      <label className="space-y-1">
        <span className="flex items-center justify-between font-medium text-slate-700">
          Teks OCR mentah (koreksi tulisan pudar / tangan)
        </span>
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-slate-300 bg-white p-2 font-mono text-[11px] text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
        />
      </label>

      <label className="space-y-1">
        <span className="flex items-center justify-between font-medium text-slate-700">
          Data terstruktur hasil review (reviewed_json)
          <button
            type="button"
            onClick={() => setJsonText(initialJson)}
            className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-600"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        </span>
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          rows={10}
          spellCheck={false}
          className={`w-full rounded-lg border bg-white p-2 font-mono text-[11px] text-slate-800 shadow-sm focus:outline-none ${
            jsonError ? "border-red-500" : "border-slate-300 focus:border-blue-500"
          }`}
        />
        {jsonError ? (
          <span className="text-red-600">{jsonError}</span>
        ) : (
          <span className="text-slate-500">
            Field yang disinkronkan ke dokumen: <code>document_number</code>,{" "}
            <code>title</code>, <code>issuing_office</code>, <code>legal_status</code>,{" "}
            <code>area_value</code> + <code>area_unit</code> (otomatis dinormalisasi ke m²).
          </span>
        )}
      </label>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="space-y-1">
          <span className="font-medium text-slate-700">Status verifikasi</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as VerificationStatus)}
            className="w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="VERIFIED">VERIFIED — data valid</option>
            <option value="NEEDS_REVIEW">NEEDS_REVIEW — perlu cek lanjutan</option>
            <option value="DRAFT_AI">DRAFT_AI — kembalikan ke draft</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="font-medium text-slate-700">Reviewer (Otomatis dari Sesi Login)</span>
          <input
            value={reviewerIdentity}
            readOnly
            className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 p-2 text-slate-600 shadow-sm outline-none"
          />
        </label>
      </div>

      <label className="space-y-1">
        <span className="font-medium text-slate-700">Catatan review</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
        />
      </label>

      <label className="flex items-center gap-2 text-slate-700">
        <input
          type="checkbox"
          checked={syncToDocument}
          onChange={(e) => setSyncToDocument(e.target.checked)}
          className="accent-blue-600"
        />
        Sinkronkan field terverifikasi ke metadata dokumen
      </label>

      {message && (
        <p
          className={`flex items-center gap-1.5 rounded-lg border p-2.5 ${
            message.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.kind === "ok" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          {message.text}
        </p>
      )}

      {!canEdit && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-slate-600">
          Akun Anda memiliki peran <strong>VIEWER</strong> (hanya baca) dan tidak dapat memverifikasi OCR.
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving || !!jsonError || !canEdit}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Simpan Hasil Review
      </button>
    </div>
  );
}
