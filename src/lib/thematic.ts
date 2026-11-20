import type { ExpressionSpecification } from "maplibre-gl";

import type { LegalStatus, NumericLike, VerificationStatus } from "@/lib/types";

/** Palet tematik resmi (skill MapLibre-Thematic-Renderer). */
export const LEGAL_STATUS_META: Record<
  LegalStatus,
  {
    label: string;
    color: string;
    group: "clear" | "dispute" | "seized";
    badgeClass: string;
  }
> = {
  CLEAR: {
    label: "Clear",
    color: "#22C55E",
    group: "clear",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  SENGKETA: {
    label: "Sengketa",
    color: "#EAB308",
    group: "dispute",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-800",
  },
  BEDA_FISIK: {
    label: "Beda Fisik",
    color: "#EAB308",
    group: "dispute",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-800",
  },
  DISITA_BI: {
    label: "Disita BI",
    color: "#EF4444",
    group: "seized",
    badgeClass: "border-red-200 bg-red-50 text-red-700",
  },
  RAMPASAN: {
    label: "Rampasan",
    color: "#EF4444",
    group: "seized",
    badgeClass: "border-red-200 bg-red-50 text-red-700",
  },
};

export const LEGAL_STATUSES = Object.keys(LEGAL_STATUS_META) as LegalStatus[];

/** Ekspresi MapLibre `match` untuk data-driven styling berbasis legal_status. */
export const LEGAL_STATUS_COLOR_EXPRESSION: ExpressionSpecification = [
  "match",
  ["get", "legal_status"],
  "DISITA_BI",
  "#EF4444",
  "RAMPASAN",
  "#EF4444",
  "SENGKETA",
  "#EAB308",
  "BEDA_FISIK",
  "#EAB308",
  "CLEAR",
  "#22C55E",
  "#64748B",
];

export const VERIFICATION_META: Record<
  VerificationStatus,
  { label: string; className: string }
> = {
  DRAFT_AI: {
    label: "Draft AI",
    className: "border-sky-200 bg-sky-50 text-sky-700",
  },
  NEEDS_REVIEW: {
    label: "Perlu Review",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  VERIFIED: {
    label: "Terverifikasi",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
};

export function toNumber(value: NumericLike | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function formatArea(value: NumericLike | undefined): string {
  const n = toNumber(value);
  if (n === null) return "-";
  return `${n.toLocaleString("id-ID", { maximumFractionDigits: 2 })} m²`;
}
