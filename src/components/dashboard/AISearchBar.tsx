"use client";

import { AlertCircle, FileText, Loader2, Sparkles, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import type { AISearchResponse } from "@/lib/types";

interface AISearchBarProps {
  loading: boolean;
  result: AISearchResponse | null;
  error: string | null;
  onSearch: (query: string) => Promise<void>;
  onClear: () => void;
  onOpenDocument?: (documentId: string) => void;
}

const SAMPLE_PROMPTS = [
  "Tanah di Sukaharja yang disita BI",
  "Persil sengketa atau beda fisik luas",
  "Sertifikat SHM atas nama Lee Darmawan",
];

export default function AISearchBar({
  loading,
  result,
  error,
  onSearch,
  onClear,
  onOpenDocument,
}: AISearchBarProps) {
  const [prompt, setPrompt] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (trimmed.length < 2 || loading) return;
    await onSearch(trimmed);
  }

  function handleClearClick() {
    setPrompt("");
    onClear();
  }

  async function handleSampleClick(sample: string) {
    setPrompt(sample);
    await onSearch(sample);
  }

  return (
    <div className="space-y-2 border-b border-slate-200 bg-gradient-to-b from-blue-50/60 to-white p-3">
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 rounded-full border border-slate-300 bg-white py-1 pl-3.5 pr-1.5 shadow-sm transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-blue-600" />
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='AI Search OCR: mis. "Tanah di Sukaharja yang disita BI"'
          className="min-w-0 flex-1 bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400"
          aria-label="Pencarian dokumen cerdas AI"
        />
        {(prompt || result) && (
          <button
            type="button"
            onClick={handleClearClick}
            className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            title="Hapus pencarian AI"
            aria-label="Hapus pencarian AI"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="submit"
          disabled={loading || prompt.trim().length < 2}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Mencari...
            </>
          ) : (
            "Cari AI"
          )}
        </button>
      </form>

      {!result && !error && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
            Contoh:
          </span>
          {SAMPLE_PROMPTS.map((sample) => (
            <button
              key={sample}
              type="button"
              disabled={loading}
              onClick={() => handleSampleClick(sample)}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
            >
              {sample}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">AI Search tidak dapat diproses</p>
            <p className="text-red-600">{error}</p>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-1.5 rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-2 text-[11px]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-blue-900">
                {result.total_matched > 0
                  ? `${result.total_matched} persil disorot di peta`
                  : "Belum ada poligon persil yang cocok"}
              </p>
              <p className="text-slate-700">{result.explanation}</p>
            </div>
            <button
              type="button"
              onClick={handleClearClick}
              className="shrink-0 rounded-md border border-blue-200 bg-white px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-100"
            >
              Reset
            </button>
          </div>

          {result.orphaned_matches.length > 0 && (
            <div className="border-t border-blue-200/70 pt-1.5">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-purple-700">
                Dokumen Orphaned Cocok ({result.orphaned_matches.length}):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {result.orphaned_matches.map((doc) => (
                  <button
                    key={doc.document_id}
                    type="button"
                    onClick={() => onOpenDocument?.(doc.document_id)}
                    className="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-white px-2 py-0.5 font-mono text-[10px] font-medium text-purple-800 shadow-sm hover:bg-purple-50"
                  >
                    <FileText className="h-3 w-3 text-purple-600" />
                    {doc.document_number}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
