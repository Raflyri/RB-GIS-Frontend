"use client";

import { AlertTriangle, Loader2, MapPin, Save, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { LEGAL_STATUSES, LEGAL_STATUS_META, formatArea } from "@/lib/thematic";
import type {
  DocumentRead,
  GeoJSONGeometry,
  LegalStatus,
  ParcelCreatePayload,
} from "@/lib/types";

interface NewParcelModalProps {
  geometry: GeoJSONGeometry;
  orphanedDocuments: DocumentRead[];
  existingParcelCount: number;
  onClose: () => void;
  onSubmit: (payload: ParcelCreatePayload) => Promise<void>;
}

const AREA_UNITS = [
  { value: "m2", label: "m² (Meter Persegi)" },
  { value: "Ha", label: "Ha (Hektar)" },
  { value: "are", label: "Are" },
  { value: "bata", label: "Bata / Tumbak (14 m²)" },
];

export default function NewParcelModal({
  geometry,
  orphanedDocuments,
  existingParcelCount,
  onClose,
  onSubmit,
}: NewParcelModalProps) {
  const suggestedCode = useMemo(
    () => `LDKH-SKH-${String(existingParcelCount + 1).padStart(3, "0")}`,
    [existingParcelCount],
  );

  const vertexCount = useMemo(() => {
    const outerRing = geometry.coordinates?.[0];
    if (!Array.isArray(outerRing)) return 0;
    return Math.max(0, outerRing.length - 1);
  }, [geometry]);

  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [docSearch, setDocSearch] = useState("");
  const [parcelCode, setParcelCode] = useState(suggestedCode);
  const [name, setName] = useState("");
  const [legalStatus, setLegalStatus] = useState<LegalStatus>("CLEAR");
  const [areaValue, setAreaValue] = useState("");
  const [areaUnit, setAreaUnit] = useState("m2");
  const [desa, setDesa] = useState("Tegal Alur");
  const [kecamatan, setKecamatan] = useState("Kalideres");
  const [kabupaten, setKabupaten] = useState("Jakarta Barat");
  const [provinsi, setProvinsi] = useState("DKI Jakarta");
  const [alamat, setAlamat] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredOrphanedDocs = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    if (!q) return orphanedDocuments;
    return orphanedDocuments.filter(
      (doc) =>
        doc.document_number.toLowerCase().includes(q) ||
        (doc.title ?? "").toLowerCase().includes(q) ||
        doc.document_type.toLowerCase().includes(q),
    );
  }, [orphanedDocuments, docSearch]);

  const handleToggleOrphaned = (docId: string) => {
    setSelectedDocIds((prev) => {
      const exists = prev.includes(docId);
      const next = exists ? prev.filter((id) => id !== docId) : [...prev, docId];
      if (!exists && prev.length === 0) {
        const doc = orphanedDocuments.find((item) => item.id === docId);
        if (doc) {
          setLegalStatus(doc.legal_status);
          if (!name.trim()) {
            setName(doc.title || doc.document_number);
          }
          if (doc.original_area_value !== null && doc.original_area_value !== undefined) {
            setAreaValue(String(doc.original_area_value));
          }
          if (doc.original_area_unit) {
            setAreaUnit(doc.original_area_unit);
          }
        }
      }
      return next;
    });
  };

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parcelCode.trim()) return;

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        parcel_code: parcelCode.trim(),
        name: name.trim() || null,
        desa_kelurahan: desa.trim() || null,
        kecamatan: kecamatan.trim() || null,
        kabupaten_kota: kabupaten.trim() || null,
        provinsi: provinsi.trim() || "DKI Jakarta",
        alamat_lengkap: alamat.trim() || null,
        legal_status: legalStatus,
        original_area_value: areaValue.trim() ? areaValue.trim() : null,
        original_area_unit: areaUnit,
        notes: notes.trim() || null,
        geometry,
        orphaned_document_id: selectedDocIds[0] ?? null,
        orphaned_document_ids: selectedDocIds,
      });
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-parcel-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
    >
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
              <MapPin className="h-4 w-4" />
            </div>
            <div>
              <h2 id="new-parcel-modal-title" className="text-sm font-bold text-slate-900">
                Simpan Lokasi Tanah Baru
              </h2>
              <p className="text-xs text-slate-500">
                Poligon berhasil digambar ({vertexCount} titik sudut · SRID 4326)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700"
            aria-label="Tutup modal tambah lokasi"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <form onSubmit={handleFormSubmit} className="space-y-4 overflow-y-auto p-5 text-xs">
          <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-blue-900">
                Tautkan Orphaned Document (Bisa pilih &gt; 1 file)
              </span>
              {selectedDocIds.length > 0 && (
                <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                  {selectedDocIds.length} dipilih
                </span>
              )}
            </div>
            <input
              type="text"
              value={docSearch}
              onChange={(e) => setDocSearch(e.target.value)}
              placeholder="Cari nomor dokumen / persil / pemilik..."
              className="w-full rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
            />
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-blue-200 bg-white p-1.5">
              {filteredOrphanedDocs.map((doc) => {
                const checked = selectedDocIds.includes(doc.id);
                return (
                  <label
                    key={doc.id}
                    className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-[11px] transition-colors ${
                      checked ? "bg-blue-50 text-blue-950" : "hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggleOrphaned(doc.id)}
                      className="mt-0.5 accent-blue-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-mono font-semibold">{doc.document_number}</span> ·{" "}
                      <span>{doc.document_type}</span> ({formatArea(doc.stated_area_m2)})
                      {doc.title && (
                        <span className="block truncate text-[10px] text-slate-500">{doc.title}</span>
                      )}
                    </span>
                  </label>
                );
              })}
              {!filteredOrphanedDocs.length && (
                <p className="p-2 text-center text-[11px] text-slate-500">
                  Tidak ada dokumen orphaned yang cocok.
                </p>
              )}
            </div>
            <span className="block text-[11px] text-blue-700">
              Dokumen yang dicentang beserta riwayat pemiliknya akan otomatis tertaut ke poligon baru
              ini (relasi 1-to-Many).
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="font-medium text-slate-700">Kode Persil *</span>
              <input
                required
                value={parcelCode}
                onChange={(e) => setParcelCode(e.target.value)}
                placeholder="mis. LDKH-SKH-004"
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none"
              />
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

          <label className="block space-y-1">
            <span className="font-medium text-slate-700">Nama / Deskripsi Persil</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="mis. Lahan Girik C No. 1147 Blok Timur"
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="font-medium text-slate-700">
                Luas Surat (kosongkan = pakai luas GIS)
              </span>
              <input
                type="number"
                step="any"
                min="0"
                value={areaValue}
                onChange={(e) => setAreaValue(e.target.value)}
                placeholder="Otomatis dari dokumen/GIS"
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700">Satuan Asal</span>
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

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="font-medium text-slate-700">Desa / Kelurahan</span>
              <input
                value={desa}
                onChange={(e) => setDesa(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700">Kecamatan</span>
              <input
                value={kecamatan}
                onChange={(e) => setKecamatan(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700">Kabupaten / Kota</span>
              <input
                value={kabupaten}
                onChange={(e) => setKabupaten(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700">Provinsi</span>
              <input
                value={provinsi}
                onChange={(e) => setProvinsi(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="font-medium text-slate-700">Alamat Lengkap</span>
            <input
              value={alamat}
              onChange={(e) => setAlamat(e.target.value)}
              placeholder="Blok / Kampung / RT-RW..."
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
            />
          </label>

          <label className="block space-y-1">
            <span className="font-medium text-slate-700">Catatan Survei / Pemetaan</span>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
            />
          </label>

          {error && (
            <p className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2.5 text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          <footer className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving || !parcelCode.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "Menyimpan..." : "Simpan Lokasi ke PostGIS"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
