"use client";

import {
  AlertTriangle,
  Check,
  FileUp,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useRef, useState, type ChangeEvent } from "react";

import { importParcels } from "@/lib/api";
import { LEGAL_STATUSES, LEGAL_STATUS_META, formatArea } from "@/lib/thematic";
import type {
  DuplicateStrategy,
  LegalStatus,
  ParcelImportFeaturePreview,
  ParcelImportResponse,
  PlannedImportAction,
} from "@/lib/types";

interface ImportParcelModalProps {
  onClose: () => void;
  onPreviewFeaturesChange: (features: ParcelImportFeaturePreview[] | null) => void;
  onImported: () => Promise<void> | void;
}

const DUPLICATE_STRATEGY_OPTIONS: Array<{
  value: DuplicateStrategy;
  label: string;
  description: string;
}> = [
  {
    value: "skip",
    label: "Lewati duplikat",
    description: "Persil dengan kode yang sudah ada tidak diubah.",
  },
  {
    value: "update",
    label: "Timpa geometri & data",
    description: "Perbarui poligon & atribut tanpa menyentuh relasi PDF Vault.",
  },
  {
    value: "create_new",
    label: "Tetap buat baru",
    description: "Tambahkan akhiran angka (-2, -3) agar tetap tersimpan.",
  },
];

function ActionBadge({ feature }: { feature: ParcelImportFeaturePreview }) {
  const styles: Record<PlannedImportAction, { label: string; className: string }> = {
    create: {
      label: "Baru",
      className: "border-sky-200 bg-sky-50 text-sky-700",
    },
    skip: {
      label: "Duplikat · Lewati",
      className: "border-amber-200 bg-amber-50 text-amber-800",
    },
    update: {
      label: "Duplikat · Timpa",
      className: "border-orange-200 bg-orange-50 text-orange-800",
    },
    create_new: {
      label: "Duplikat · Buat Baru",
      className: "border-indigo-200 bg-indigo-50 text-indigo-700",
    },
    invalid: {
      label: "Invalid",
      className: "border-red-200 bg-red-50 text-red-700",
    },
  };
  const meta = styles[feature.planned_action];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

export default function ImportParcelModal({
  onClose,
  onPreviewFeaturesChange,
  onImported,
}: ImportParcelModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>("skip");
  const [defaultVillage, setDefaultVillage] = useState("");
  const [defaultDistrict, setDefaultDistrict] = useState("");
  const [defaultCity, setDefaultCity] = useState("");
  const [defaultProvince, setDefaultProvince] = useState("");
  const [defaultLegalStatus, setDefaultLegalStatus] = useState<LegalStatus>("CLEAR");

  const [previewLoading, setPreviewLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [previewResult, setPreviewResult] = useState<ParcelImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runPreview = useCallback(
    async (
      file: File,
      strategy: DuplicateStrategy,
      defaults: {
        village: string;
        district: string;
        city: string;
        province: string;
        legalStatus: LegalStatus;
      },
    ) => {
      setPreviewLoading(true);
      setError(null);
      try {
        const res = await importParcels({
          file,
          dryRun: true,
          duplicateStrategy: strategy,
          defaultVillage: defaults.village || undefined,
          defaultDistrict: defaults.district || undefined,
          defaultCity: defaults.city || undefined,
          defaultProvince: defaults.province || undefined,
          defaultLegalStatus: defaults.legalStatus,
        });
        setPreviewResult(res);
        onPreviewFeaturesChange(res.features);
      } catch (err) {
        setPreviewResult(null);
        onPreviewFeaturesChange(null);
        setError((err as Error).message || "Gagal memproses pratinjau file impor.");
      } finally {
        setPreviewLoading(false);
      }
    },
    [onPreviewFeaturesChange],
  );

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setSelectedFile(file);
    void runPreview(file, duplicateStrategy, {
      village: defaultVillage,
      district: defaultDistrict,
      city: defaultCity,
      province: defaultProvince,
      legalStatus: defaultLegalStatus,
    });
  };

  const handleStrategyChange = (strategy: DuplicateStrategy) => {
    setDuplicateStrategy(strategy);
    if (selectedFile) {
      void runPreview(selectedFile, strategy, {
        village: defaultVillage,
        district: defaultDistrict,
        city: defaultCity,
        province: defaultProvince,
        legalStatus: defaultLegalStatus,
      });
    }
  };

  const handleRefreshPreview = () => {
    if (!selectedFile || previewLoading || committing) return;
    void runPreview(selectedFile, duplicateStrategy, {
      village: defaultVillage,
      district: defaultDistrict,
      city: defaultCity,
      province: defaultProvince,
      legalStatus: defaultLegalStatus,
    });
  };

  const handleClose = () => {
    if (committing) return;
    onPreviewFeaturesChange(null);
    onClose();
  };

  const handleCommitImport = async () => {
    if (!selectedFile || !previewResult || previewResult.valid_features === 0) return;
    setCommitting(true);
    setError(null);
    try {
      await importParcels({
        file: selectedFile,
        dryRun: false,
        duplicateStrategy,
        defaultVillage: defaultVillage || undefined,
        defaultDistrict: defaultDistrict || undefined,
        defaultCity: defaultCity || undefined,
        defaultProvince: defaultProvince || undefined,
        defaultLegalStatus,
      });
      onPreviewFeaturesChange(null);
      await onImported();
      onClose();
    } catch (err) {
      setError((err as Error).message || "Gagal menyimpan persil ke database.");
    } finally {
      setCommitting(false);
    }
  };

  const actionableCount = previewResult
    ? previewResult.features.filter(
        (f) => f.is_valid && f.planned_action !== "skip",
      ).length
    : 0;

  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-xl border border-indigo-200 bg-white/95 px-4 py-2.5 shadow-xl backdrop-blur-sm">
        <div className="flex items-center gap-2 text-xs">
          <FileUp className="h-4 w-4 text-indigo-600" />
          <div>
            <p className="font-bold text-slate-900">
              Preview Impor Peta{selectedFile ? `: ${selectedFile.name}` : ""}
            </p>
            {previewResult && (
              <p className="text-[11px] text-slate-500">
                {previewResult.valid_features} valid · {previewResult.duplicate_count} duplikat
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Buka Panel
        </button>
        <button
          type="button"
          onClick={handleClose}
          disabled={committing}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Tutup panel impor"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex justify-end bg-slate-900/20 p-3 backdrop-blur-[1px]">
      <div className="pointer-events-auto flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <FileUp className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Import Peta Massal (GeoJSON / KML / KMZ)
              </h2>
              <p className="text-[11px] text-slate-500">
                Pratinjau poligon langsung di peta (biru: baru, oranye: duplikat) sebelum disimpan ke PostGIS.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMinimized(true)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/70 hover:text-slate-700"
              title="Perkecil panel agar peta terlihat penuh"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={committing}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/70 hover:text-slate-700 disabled:opacity-50"
              title="Tutup"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 text-xs">
          <input
            ref={fileInputRef}
            type="file"
            accept=".geojson,.json,.kml,.kmz,application/geo+json,application/json,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* File Picker */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 p-3.5">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-800">
                {selectedFile ? selectedFile.name : "Pilih file spasial (.geojson, .json, .kml, .kmz)"}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {selectedFile
                  ? `${(selectedFile.size / 1024).toFixed(1)} KB · Sistem otomatis memvalidasi ke EPSG:4326 2D`
                  : "Mendukung GeoJSON hasil ekstraksi PDF Citra 5 maupun ekspor Google Earth KML/KMZ."}
              </p>
            </div>
            <button
              type="button"
              disabled={previewLoading || committing}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {previewLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {selectedFile ? "Ganti File" : "Pilih File"}
            </button>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Default Location & Duplicate Strategy */}
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 sm:grid-cols-2">
            <div className="sm:col-span-2 flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Nilai Default untuk Field Kosong
              </h3>
              {selectedFile && (
                <button
                  type="button"
                  disabled={previewLoading || committing}
                  onClick={handleRefreshPreview}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${previewLoading ? "animate-spin" : ""}`} />
                  Terapkan ke Preview
                </button>
              )}
            </div>

            <label className="space-y-1">
              <span className="text-[11px] font-medium text-slate-600">Desa / Kelurahan</span>
              <input
                value={defaultVillage}
                onChange={(e) => setDefaultVillage(e.target.value)}
                placeholder="cth: Tegal Alur"
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-500"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-slate-600">Kecamatan</span>
              <input
                value={defaultDistrict}
                onChange={(e) => setDefaultDistrict(e.target.value)}
                placeholder="cth: Kalideres"
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-500"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-slate-600">Kabupaten / Kota</span>
              <input
                value={defaultCity}
                onChange={(e) => setDefaultCity(e.target.value)}
                placeholder="cth: Jakarta Barat"
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-500"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-slate-600">Status Hukum Default</span>
              <select
                value={defaultLegalStatus}
                onChange={(e) => setDefaultLegalStatus(e.target.value as LegalStatus)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-500"
              >
                {LEGAL_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {LEGAL_STATUS_META[status].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-[11px] font-medium text-slate-600">Provinsi</span>
              <input
                value={defaultProvince}
                onChange={(e) => setDefaultProvince(e.target.value)}
                placeholder="Kosongkan untuk default Jawa Barat, atau isi cth: DKI Jakarta"
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-500"
              />
            </label>
          </div>

          {/* Duplicate Strategy */}
          <div className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Penanganan Kode Persil Duplikat
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {DUPLICATE_STRATEGY_OPTIONS.map((opt) => {
                const active = duplicateStrategy === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={previewLoading || committing}
                    onClick={() => handleStrategyChange(opt.value)}
                    className={`rounded-xl border p-2.5 text-left transition-colors ${
                      active
                        ? "border-indigo-500 bg-indigo-50/80 ring-1 ring-indigo-500"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <p className="font-semibold text-slate-900">{opt.label}</p>
                    <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
                      {opt.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preview Summary & Table */}
          {previewLoading && (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-8 text-xs text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
              Memvalidasi geometri & mengecek duplikat...
            </div>
          )}

          {!previewLoading && previewResult && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[10px] font-medium uppercase text-slate-500">Fitur Valid</p>
                  <p className="text-sm font-bold text-emerald-700">
                    {previewResult.valid_features}{" "}
                    <span className="text-xs font-normal text-slate-500">
                      / {previewResult.total_features}
                    </span>
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[10px] font-medium uppercase text-slate-500">Invalid</p>
                  <p
                    className={`text-sm font-bold ${
                      previewResult.invalid_features > 0 ? "text-red-600" : "text-slate-700"
                    }`}
                  >
                    {previewResult.invalid_features}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[10px] font-medium uppercase text-slate-500">Duplikat</p>
                  <p
                    className={`text-sm font-bold ${
                      previewResult.duplicate_count > 0 ? "text-orange-600" : "text-slate-700"
                    }`}
                  >
                    {previewResult.duplicate_count}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[10px] font-medium uppercase text-slate-500">Total Luas GIS</p>
                  <p className="text-sm font-bold text-slate-900">
                    {formatArea(previewResult.total_gis_area_m2)}
                  </p>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="max-h-72 overflow-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-[11px]">
                    <thead className="sticky top-0 bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      <tr>
                        <th className="px-2.5 py-2">#</th>
                        <th className="px-2.5 py-2">Kode Persil</th>
                        <th className="px-2.5 py-2">Nama / Pemilik</th>
                        <th className="px-2.5 py-2 text-right">Luas Surat</th>
                        <th className="px-2.5 py-2 text-right">Luas GIS</th>
                        <th className="px-2.5 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {previewResult.features.map((feat) => (
                        <tr
                          key={feat.feature_index}
                          className={!feat.is_valid ? "bg-red-50/50" : "hover:bg-slate-50"}
                        >
                          <td className="px-2.5 py-2 font-mono text-slate-400">
                            {feat.feature_index}
                          </td>
                          <td className="px-2.5 py-2">
                            <p className="font-mono font-semibold text-slate-900">
                              {feat.resolved_parcel_code}
                            </p>
                            {feat.resolved_parcel_code !== feat.parcel_code && (
                              <p className="text-[10px] text-slate-400">
                                asal: {feat.parcel_code}
                              </p>
                            )}
                          </td>
                          <td className="max-w-[160px] px-2.5 py-2">
                            <p className="truncate font-medium text-slate-800">
                              {feat.name || "-"}
                            </p>
                            {feat.owner_name && (
                              <p className="truncate text-[10px] text-slate-500">
                                {feat.owner_name}
                              </p>
                            )}
                            {feat.validation_error && (
                              <p className="mt-0.5 text-[10px] font-medium text-red-600">
                                {feat.validation_error}
                              </p>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums text-slate-700">
                            {formatArea(feat.certificate_area_m2)}
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums text-slate-700">
                            {formatArea(feat.gis_area_m2)}
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-2">
                            <ActionBadge feature={feat} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/90 px-5 py-3">
          <p className="text-[11px] text-slate-500">
            {previewResult
              ? `${actionableCount} fitur siap ditulis ke database PostGIS.`
              : "Unggah file untuk melihat pratinjau poligon di peta."}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={committing}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={
                !previewResult ||
                previewLoading ||
                committing ||
                actionableCount === 0
              }
              onClick={handleCommitImport}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {committing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {committing ? "Menyimpan..." : "Simpan Semua ke Database"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
