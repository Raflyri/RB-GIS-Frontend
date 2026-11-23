"use client";

import {
  AlertTriangle,
  Clock,
  Eye,
  EyeOff,
  Layers,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  ShieldCheck,
  UserCheck,
  X,
  XCircle,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import {
  exchangeGuestToken,
  fetchGuestAccessStatus,
  loginWithPassword,
  requestGuestAccess,
} from "@/lib/api";
import type { GuestRequestStatus, UserRead } from "@/lib/types";

interface LoginPageProps {
  onLoginSuccess: (user: UserRead) => void;
  initialError?: string | null;
}

interface GuestWaitState {
  shortCode: string;
  waitToken: string;
  requestExpiresAt: string;
  requestedAtWib: string;
  deviceSummary: string;
  ipAddress: string;
  status: GuestRequestStatus;
}

const GUEST_WAIT_STORAGE_KEY = "ldkh_guest_wait_state";

function formatCountdownMMSS(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function LoginPage({ onLoginSuccess, initialError }: LoginPageProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  const [guestDialogOpen, setGuestDialogOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestSubmitting, setGuestSubmitting] = useState(false);
  const [guestRequestError, setGuestRequestError] = useState<string | null>(null);
  const [waitState, setWaitState] = useState<GuestWaitState | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const [exchanging, setExchanging] = useState(false);

  useEffect(() => {
    setError(initialError ?? null);
  }, [initialError]);

  const clearSavedWaitState = useCallback(() => {
    setWaitState(null);
    setRedirectCountdown(null);
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(GUEST_WAIT_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Pulihkan state Waiting Room jika browser sempat me-refresh saat menunggu persetujuan
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(GUEST_WAIT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as GuestWaitState;
      if (!parsed?.waitToken || !parsed?.requestExpiresAt) return;
      if (new Date(parsed.requestExpiresAt).getTime() <= Date.now()) {
        window.sessionStorage.removeItem(GUEST_WAIT_STORAGE_KEY);
        return;
      }
      setWaitState(parsed);
    } catch {
      /* ignore */
    }
  }, []);

  // Hitung mundur masa tunggu permintaan Guest (maksimal 30 menit)
  useEffect(() => {
    if (!waitState) return;
    const updateRemaining = () => {
      const diffSec = Math.max(
        0,
        Math.floor((new Date(waitState.requestExpiresAt).getTime() - Date.now()) / 1000),
      );
      setRemainingSeconds(diffSec);
      if (diffSec <= 0 && waitState.status === "PENDING") {
        setWaitState((prev) => (prev ? { ...prev, status: "EXPIRED" } : null));
      }
    };
    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);
    return () => clearInterval(interval);
  }, [waitState]);

  // Polling status permintaan setiap 3 detik selama masih PENDING
  useEffect(() => {
    if (!waitState || waitState.status !== "PENDING") return;
    let active = true;

    const pollStatus = async () => {
      try {
        const res = await fetchGuestAccessStatus(waitState.waitToken);
        if (!active) return;
        if (res.status === "APPROVED") {
          setWaitState((prev) => (prev ? { ...prev, status: "APPROVED" } : null));
          setExchanging(true);
          try {
            const tokenRes = await exchangeGuestToken(waitState.waitToken);
            if (!active) return;
            clearSavedWaitState();
            onLoginSuccess(tokenRes.user);
          } catch (err) {
            if (!active) return;
            setExchanging(false);
            setError((err as Error).message);
            clearSavedWaitState();
          }
        } else if (
          res.status === "REJECTED" ||
          res.status === "EXPIRED" ||
          res.status === "REVOKED"
        ) {
          setWaitState((prev) => (prev ? { ...prev, status: res.status } : null));
        }
      } catch (err) {
        if (!active) return;
        const statusErr = err as { status?: number; message?: string };
        if (statusErr?.status === 404) {
          clearSavedWaitState();
        }
      }
    };

    pollStatus();
    const timer = setInterval(pollStatus, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [waitState, clearSavedWaitState, onLoginSuccess]);

  // Countdown 5 detik otomatis kembali ke /login saat REJECTED atau EXPIRED
  useEffect(() => {
    if (
      !waitState ||
      (waitState.status !== "REJECTED" &&
        waitState.status !== "EXPIRED" &&
        waitState.status !== "REVOKED")
    ) {
      return;
    }

    setRedirectCountdown(5);
    let current = 5;
    const timer = setInterval(() => {
      current -= 1;
      if (current <= 0) {
        clearInterval(timer);
        const msg =
          waitState.status === "REJECTED"
            ? "Permintaan akses Anda ditolak oleh Administrator."
            : "Permintaan akses Guest telah kedaluwarsa.";
        clearSavedWaitState();
        setError(msg);
        if (pathname !== "/login") {
          router.replace("/login");
        }
      } else {
        setRedirectCountdown(current);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [waitState, clearSavedWaitState, pathname, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) return;

    setLoading(true);
    setError(null);
    try {
      const response = await loginWithPassword(email.trim(), password);
      onLoginSuccess(response.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGuestRequestSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGuestSubmitting(true);
    setGuestRequestError(null);
    try {
      const res = await requestGuestAccess(guestName);
      const nextState: GuestWaitState = {
        shortCode: res.short_code,
        waitToken: res.wait_token,
        requestExpiresAt: res.request_expires_at,
        requestedAtWib: res.requested_at_wib,
        deviceSummary: res.device_summary,
        ipAddress: res.ip_address,
        status: res.status,
      };
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem(
            GUEST_WAIT_STORAGE_KEY,
            JSON.stringify(nextState),
          );
        } catch {
          /* ignore */
        }
      }
      setWaitState(nextState);
      setGuestDialogOpen(false);
      setGuestName("");
    } catch (err) {
      setGuestRequestError((err as Error).message);
    } finally {
      setGuestSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-50 px-4 py-10 text-slate-800">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-200 bg-slate-50/80 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-900">
                Web GIS Digitalisasi Tanah LDKH
              </h1>
              <p className="text-xs text-slate-500">
                Sistem Manajemen Arsip Legal &amp; Spasial PostGIS
              </p>
            </div>
          </div>
        </div>

        {waitState ? (
          <div className="space-y-4 p-6 text-xs">
            {waitState.status === "PENDING" && (
              <>
                <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">
                      Kode Permintaan Guest
                    </p>
                    <p className="font-mono text-xl font-extrabold tracking-wide text-slate-900">
                      #{waitState.shortCode}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Berlaku Hingga
                    </p>
                    <p className="inline-flex items-center gap-1 font-mono text-sm font-bold tabular-nums text-blue-700">
                      <Clock className="h-3.5 w-3.5" />
                      {formatCountdownMMSS(remainingSeconds)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-6 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                    {exchanging ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <MessageSquare className="h-6 w-6 animate-pulse" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-900">
                      {exchanging
                        ? "Permintaan disetujui! Menyiapkan sesi Read-Only..."
                        : "Menunggu persetujuan Administrator melalui WhatsApp..."}
                    </p>
                    <p className="leading-relaxed text-slate-500">
                      Notifikasi telah dikirim ke Administrator. Halaman ini akan otomatis masuk ke
                      Web GIS segera setelah disetujui (akses Read-Only berlaku 3 jam).
                    </p>
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-3 text-[11px]">
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Perangkat
                    </dt>
                    <dd className="mt-0.5 truncate font-medium text-slate-700">
                      {waitState.deviceSummary}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Alamat IP
                    </dt>
                    <dd className="mt-0.5 truncate font-mono font-medium text-slate-700">
                      {waitState.ipAddress}
                    </dd>
                  </div>
                </dl>

                <button
                  type="button"
                  onClick={clearSavedWaitState}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Batalkan &amp; Kembali ke Login
                </button>
              </>
            )}

            {(waitState.status === "REJECTED" ||
              waitState.status === "EXPIRED" ||
              waitState.status === "REVOKED") && (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
                    {waitState.status === "REJECTED" ? (
                      <XCircle className="h-6 w-6" />
                    ) : (
                      <AlertTriangle className="h-6 w-6" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-red-800">
                      {waitState.status === "REJECTED"
                        ? "Permintaan akses Anda ditolak oleh Administrator"
                        : "Permintaan akses kedaluwarsa"}
                    </p>
                    <p className="text-xs text-red-700">
                      Kode Permintaan:{" "}
                      <span className="font-mono font-bold">#{waitState.shortCode}</span>
                    </p>
                    <p className="pt-1 font-medium text-slate-600">
                      Mengalihkan ke halaman login dalam{" "}
                      <span className="font-mono font-bold text-red-700">
                        {redirectCountdown ?? 5}
                      </span>{" "}
                      detik...
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    clearSavedWaitState();
                    if (pathname !== "/login") {
                      router.replace("/login");
                    }
                  }}
                  className="inline-flex w-full items-center justify-center rounded-lg bg-slate-800 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-slate-900"
                >
                  Kembali ke Halaman Login Sekarang
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 text-xs">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-blue-900">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <p className="leading-relaxed">
                  Akses API, penghapusan persil, upload dokumen PDF, dan verifikasi OCR dilindungi
                  oleh autentikasi sesi &amp; kontrol peran (RBAC).
                </p>
              </div>

              <label className="block space-y-1.5">
                <span className="font-semibold text-slate-700">Email</span>
                <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@rbeverything.com"
                    className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  />
                </div>
              </label>

              <label className="block space-y-1.5">
                <span className="font-semibold text-slate-700">Password</span>
                <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
                  <Lock className="h-4 w-4 text-slate-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan password"
                    className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="text-slate-400 hover:text-slate-700"
                    aria-label={showPassword ? "Sembunyikan password" : "Lihat password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 font-medium text-red-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim() || !password}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                {loading ? "Memverifikasi..." : "Masuk ke Web GIS LDKH"}
              </button>
            </form>

            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                atau
              </span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <button
              type="button"
              onClick={() => {
                setGuestRequestError(null);
                setGuestDialogOpen(true);
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/70 hover:text-blue-700"
            >
              <UserCheck className="h-4 w-4 text-blue-600" />
              Login as Guest
            </button>
            <p className="mt-2 text-center text-[11px] text-slate-500">
              Akses sementara Read-Only (3 jam) dengan persetujuan Administrator via WhatsApp.
            </p>
          </div>
        )}
      </div>

      {guestDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="guest-request-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                  <UserCheck className="h-4 w-4" />
                </div>
                <div>
                  <h2 id="guest-request-dialog-title" className="text-sm font-bold text-slate-900">
                    Permintaan Akses Guest (Read-Only)
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Memerlukan konfirmasi Administrator melalui WhatsApp
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={guestSubmitting}
                onClick={() => setGuestDialogOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
                aria-label="Tutup dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleGuestRequestSubmit} className="space-y-4 p-5 text-xs">
              <label className="block space-y-1.5">
                <span className="font-semibold text-slate-700">
                  Nama / Instansi <span className="font-normal text-slate-400">(opsional)</span>
                </span>
                <input
                  type="text"
                  maxLength={100}
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Contoh: BPN Bogor / Konsultan Pertanahan"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>

              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
                Informasi perangkat dan alamat IP Anda akan dikirimkan ke Administrator. Jika
                disetujui, sesi Guest bersifat <strong>Read-Only</strong> selama 3 jam.
              </p>

              {guestRequestError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-medium text-red-700">
                  {guestRequestError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={guestSubmitting}
                  onClick={() => setGuestDialogOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={guestSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {guestSubmitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MessageSquare className="h-3.5 w-3.5" />
                  )}
                  {guestSubmitting ? "Mengirim..." : "Kirim Permintaan Akses"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
