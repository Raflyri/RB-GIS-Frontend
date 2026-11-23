"use client";

import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import LoginPage from "@/components/auth/LoginPage";
import { fetchCurrentUser } from "@/lib/api";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const [checking, setChecking] = useState(true);

  const initialError =
    reason === "guest_expired"
      ? "Sesi akses Guest 3 jam telah berakhir. Silakan ajukan permintaan masuk kembali."
      : reason === "session_expired"
        ? "Sesi login Anda telah berakhir. Silakan masuk kembali."
        : null;

  useEffect(() => {
    let active = true;
    fetchCurrentUser()
      .then(() => {
        if (active) {
          router.replace("/");
        }
      })
      .catch(() => {
        if (active) {
          setChecking(false);
        }
      });
    return () => {
      active = false;
    };
  }, [router]);

  if (checking) {
    return (
      <div className="flex h-[100dvh] items-center justify-center gap-2 bg-slate-50 text-sm text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
        Memeriksa sesi autentikasi Web GIS LDKH...
      </div>
    );
  }

  return (
    <LoginPage
      initialError={initialError}
      onLoginSuccess={() => {
        router.replace("/");
      }}
    />
  );
}

export default function LoginRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[100dvh] items-center justify-center gap-2 bg-slate-50 text-sm text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          Memuat halaman login...
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
