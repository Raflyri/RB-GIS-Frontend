"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Globe,
  Layers,
  Loader2,
  MonitorSmartphone,
  ShieldAlert,
  User,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { fetchGuestApprovalDetail, submitGuestApprovalDecision } from "@/lib/api";
import type { GuestApprovalDetailResponse } from "@/lib/types";

function formatRemainingMMSS(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function GuestApprovalPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === "string" ? params.token : "";

  const [detail, setDetail] = useState<GuestApprovalDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"APPROVE" | "REJECT" | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  const loadDetail = useCallback(async () => {
    if (!token) {
      setError("Token persetujuan tidak ditemukan di URL.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchGuestApprovalDetail(token);
      setDetail(res);
      setRemainingSeconds(res.remaining_seconds);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (!detail || detail.status !== "PENDING") return;
    const timer = setInterval(() => {
      const diff = Math.max(
        0,
        Math.floor((new Date(detail.request_expires_at).getTime() - Date.now()) / 1000),
      );
      setRemainingSeconds(diff);
      if (diff <= 0) {
        setDetail((prev) =>
          prev ? { ...prev, status: "EXPIRED", is_actionable: false } : null,
        );
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [detail]);

  async function handleDecision(action: "APPROVE" | "REJECT") {
    if (!token || submitting) return;
    setSubmitting(action);
    setError(null);
    try {
      const res = await submitGuestApprovalDecision(token, action);
      setActionResult(res.message);
      await loadDetail();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-50 px-4 py-8 text-slate-800">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <header className="border-b border-slate-200 bg-slate-50/80 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900">
                Konfirmasi Akses Guest Web GIS
              </h1>
              <p className="text-[11px] text-slate-500">
                Otorisasi Just-in-Time Administrator LDKH
              </p>
            </div>
          </div>
        </header>

        <main className="space-y-4 p-5 text-xs">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <p>Memuat detail permintaan akses...</p>
            </div>
          )}

          {!loading && error && !detail && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-900">
                  Tautan Tidak Valid atau Kedaluwarsa
                </p>
                <p className="text-slate-600">{error}</p>
              </div>
              <Link
                href="/"
                className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Buka Halaman Utama Web GIS
              </Link>
            </div>
          )}

          {!loading && detail && (
            <>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Kode Permintaan
                  </p>
                  <p className="font-mono text-xl font-extrabold text-slate-900">
                    #{detail.short_code}
                  </p>
                </div>

                {detail.status === "PENDING" ? (
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                      Sisa Waktu (30 mnt)
                    </p>
                    <p className="inline-flex items-center gap-1 font-mono text-sm font-bold tabular-nums text-amber-700">
                      <Clock className="h-3.5 w-3.5" />
                      {formatRemainingMMSS(remainingSeconds)}
                    </p>
                  </div>
                ) : (
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                      detail.status === "APPROVED"
                        ? "bg-emerald-100 text-emerald-700"
                        : detail.status === "REJECTED"
                          ? "bg-red-100 text-red-700"
                          : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {detail.status}
                  </span>
                )}
              </div>

              <dl className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-4">
                {detail.guest_name && (
                  <div className="flex items-start gap-2.5">
                    <User className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Nama / Instansi
                      </dt>
                      <dd className="font-semibold text-slate-900">{detail.guest_name}</dd>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-2.5">
                  <MonitorSmartphone className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Perangkat
                    </dt>
                    <dd className="font-semibold text-slate-900">{detail.device_summary}</dd>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <Globe className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Alamat IP Publik
                    </dt>
                    <dd className="font-mono font-semibold text-slate-900">{detail.ip_address}</dd>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Waktu Permintaan (WIB)
                    </dt>
                    <dd className="font-medium text-slate-800">{detail.requested_at_wib} WIB</dd>
                  </div>
                </div>
              </dl>

              {actionResult && (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <p className="font-medium leading-relaxed">{actionResult}</p>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="font-medium leading-relaxed">{error}</p>
                </div>
              )}

              {detail.is_actionable ? (
                <div className="grid grid-cols-1 gap-2.5 pt-1 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={submitting !== null}
                    onClick={() => handleDecision("APPROVE")}
                    className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50"
                  >
                    {submitting === "APPROVE" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Izinkan Masuk (Yes)
                  </button>
                  <button
                    type="button"
                    disabled={submitting !== null}
                    onClick={() => handleDecision("REJECT")}
                    className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-red-700 active:bg-red-800 disabled:opacity-50"
                  >
                    {submitting === "REJECT" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    Tolak (No)
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-slate-600">
                  {detail.status === "EXPIRED" ? (
                    <p className="font-medium text-amber-800">
                      Tautan persetujuan ini telah kedaluwarsa karena melewati batas waktu 30 menit.
                    </p>
                  ) : (
                    <p className="font-medium">
                      Tautan persetujuan ini sudah digunakan (Status:{" "}
                      <strong>{detail.status}</strong>
                      {detail.decided_via ? ` via ${detail.decided_via}` : ""}).
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
