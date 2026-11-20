"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { LegalStatusBadge } from "@/components/ui/Badges";
import { formatArea } from "@/lib/thematic";
import type { ParcelFeature } from "@/lib/types";

interface ParcelTableProps {
  features: ParcelFeature[];
  selectedParcelId: string | null;
  highlightedParcelIds?: string[] | null;
  onSelectParcel: (parcelId: string) => void;
}

export default function ParcelTable({
  features,
  selectedParcelId,
  highlightedParcelIds = null,
  onSelectParcel,
}: ParcelTableProps) {
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const matchSet = useMemo(
    () => (highlightedParcelIds ? new Set(highlightedParcelIds) : null),
    [highlightedParcelIds],
  );

  const orderedFeatures = useMemo(() => {
    if (!matchSet) return features;
    const matched: ParcelFeature[] = [];
    const rest: ParcelFeature[] = [];
    for (const f of features) {
      if (matchSet.has(f.properties.id)) matched.push(f);
      else rest.push(f);
    }
    return [...matched, ...rest];
  }, [features, matchSet]);

  // Klik poligon di peta -> sorot & scroll ke baris tabel / kartu mobile yang sesuai.
  useEffect(() => {
    if (selectedParcelId) {
      rowRefs.current[selectedParcelId]?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
      cardRefs.current[selectedParcelId]?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [selectedParcelId]);

  if (!features.length) {
    return (
      <p className="p-6 text-center text-sm text-slate-500">
        Tidak ada persil yang cocok dengan filter.
      </p>
    );
  }

  return (
    <>
      <div className="divide-y divide-slate-100 bg-white md:hidden">
        {orderedFeatures.map(({ properties: p }) => {
          const selected = p.id === selectedParcelId;
          const aiMatched = matchSet?.has(p.id) ?? false;
          const discrepancy = p.area_discrepancy_m2 ?? 0;
          return (
            <button
              key={p.id}
              type="button"
              ref={(el) => {
                cardRefs.current[p.id] = el;
              }}
              onClick={() => onSelectParcel(p.id)}
              className={`block min-h-[64px] w-full p-3.5 text-left transition-colors ${
                selected
                  ? "bg-blue-50/90 ring-1 ring-inset ring-blue-500/30"
                  : aiMatched
                    ? "bg-sky-50/80 ring-1 ring-inset ring-sky-400/40 active:bg-sky-100/70"
                    : matchSet
                      ? "opacity-65 active:bg-slate-50"
                      : "active:bg-slate-50"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="font-mono text-sm font-bold text-slate-900">
                    {p.parcel_code}
                  </span>
                  {aiMatched && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                      <Sparkles className="h-2.5 w-2.5" /> AI
                    </span>
                  )}
                </div>
                <LegalStatusBadge status={p.legal_status} />
              </div>

              <p className="mt-1 truncate text-xs font-medium text-slate-700">
                {p.name ?? "-"} · {p.desa_kelurahan ?? "-"}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-slate-500">
                Pemilik: {p.current_owner_name ?? "-"} · {p.document_count} Dok
              </p>

              <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-slate-200/80 bg-slate-50/80 px-2.5 py-1.5 text-[11px]">
                <div>
                  <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    Luas Surat
                  </span>
                  <span className="font-semibold tabular-nums text-slate-800">
                    {formatArea(p.area_m2)}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    Luas GIS
                  </span>
                  <span className="font-semibold tabular-nums text-slate-800">
                    {formatArea(p.gis_area_m2)}
                  </span>
                  {Math.abs(discrepancy) > 0.5 && (
                    <span className="ml-1 font-medium text-amber-600">
                      (Δ {formatArea(discrepancy)})
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <table className="hidden w-full text-left text-xs md:table">
      <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
        <tr>
          <th className="px-3 py-2.5">Kode Persil</th>
          <th className="px-3 py-2.5">Status</th>
          <th className="px-3 py-2.5 text-right">Luas Surat</th>
          <th className="px-3 py-2.5 text-right">Luas GIS</th>
          <th className="px-3 py-2.5">Pemilik Aktif</th>
          <th className="px-3 py-2.5 text-center">Dok</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 bg-white">
        {orderedFeatures.map(({ properties: p }) => {
          const selected = p.id === selectedParcelId;
          const aiMatched = matchSet?.has(p.id) ?? false;
          const discrepancy = p.area_discrepancy_m2 ?? 0;
          return (
            <tr
              key={p.id}
              ref={(el) => {
                rowRefs.current[p.id] = el;
              }}
              onClick={() => onSelectParcel(p.id)}
              className={`cursor-pointer transition-colors ${
                selected
                  ? "bg-blue-50/90 ring-1 ring-inset ring-blue-500/30"
                  : aiMatched
                    ? "bg-sky-50/80 ring-1 ring-inset ring-sky-400/40 hover:bg-sky-100/70"
                    : matchSet
                      ? "opacity-60 hover:bg-slate-50 hover:opacity-100"
                      : "hover:bg-slate-50"
              }`}
            >
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-1.5">
                  <p className="font-mono font-semibold text-slate-900">{p.parcel_code}</p>
                  {aiMatched && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                      <Sparkles className="h-2.5 w-2.5" /> AI
                    </span>
                  )}
                </div>
                <p className="truncate text-[11px] text-slate-500">
                  {p.name ?? "-"} · {p.desa_kelurahan ?? "-"}
                </p>
              </td>
              <td className="px-3 py-2.5">
                <LegalStatusBadge status={p.legal_status} />
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                {formatArea(p.area_m2)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                {formatArea(p.gis_area_m2)}
                {Math.abs(discrepancy) > 0.5 && (
                  <p className="text-[10px] font-medium text-amber-600">
                    Δ {formatArea(discrepancy)}
                  </p>
                )}
              </td>
              <td className="px-3 py-2.5 text-slate-700">{p.current_owner_name ?? "-"}</td>
              <td className="px-3 py-2.5 text-center tabular-nums text-slate-700">
                {p.document_count}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </>
  );
}
