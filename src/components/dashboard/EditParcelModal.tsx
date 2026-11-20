"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { createOwner, deleteOwner, updateOwner } from "@/lib/api";
import { LEGAL_STATUSES, LEGAL_STATUS_META, formatArea, toNumber } from "@/lib/thematic";
import type {
  LegalStatus,
  OwnerRead,
  OwnerType,
  ParcelDetailRead,
  ParcelUpdatePayload,
} from "@/lib/types";

interface EditParcelModalProps {
  parcel: ParcelDetailRead;
  onClose: () => void;
  onSubmit: (parcelId: string, payload: ParcelUpdatePayload) => Promise<void>;
  onOwnersChanged?: () => Promise<void>;
}

const AREA_UNITS = [
  { value: "m2", label: "m² (Meter Persegi)", factor: 1 },
  { value: "Ha", label: "Ha (Hektar)", factor: 10000 },
  { value: "are", label: "Are", factor: 100 },
  { value: "bata", label: "Bata / Tumbak (14 m²)", factor: 14 },
];

const OWNER_TYPES: { value: OwnerType; label: string }[] = [
  { value: "INDIVIDU", label: "Individu" },
  { value: "KORPORASI", label: "Korporasi" },
  { value: "INSTANSI_PEMERINTAH", label: "Instansi Pemerintah" },
  { value: "BANK_INDONESIA", label: "Bank Indonesia" },
  { value: "AHLI_WARIS", label: "Ahli Waris" },
];

function normalizeUnitOption(rawUnit: string | null | undefined): string {
  const lower = (rawUnit ?? "m2").trim().toLowerCase();
  if (lower === "ha" || lower === "hektar" || lower === "hectare" || lower === "hectares") {
    return "Ha";
  }
  if (lower === "are" || lower === "a") return "are";
  if (lower === "bata" || lower === "tumbak" || lower === "ru") return "bata";
  return "m2";
}

function getUnitFactor(unit: string): number {
  const found = AREA_UNITS.find((u) => u.value.toLowerCase() === unit.toLowerCase());
  return found?.factor ?? 1;
}

export default function EditParcelModal({
  parcel,
  onClose,
  onSubmit,
  onOwnersChanged,
}: EditParcelModalProps) {
  const initialAreaValue = useMemo(() => {
    if (parcel.original_area_value !== null && parcel.original_area_value !== undefined) {
      return String(parcel.original_area_value);
    }
    if (parcel.area_m2 !== null && parcel.area_m2 !== undefined) {
      return String(parcel.area_m2);
    }
    return "";
  }, [parcel.original_area_value, parcel.area_m2]);

  const [parcelCode, setParcelCode] = useState(parcel.parcel_code);
  const [legalStatus, setLegalStatus] = useState<LegalStatus>(parcel.legal_status);
  const [name, setName] = useState(parcel.name ?? "");
  const [areaValue, setAreaValue] = useState(initialAreaValue);
  const [areaUnit, setAreaUnit] = useState(normalizeUnitOption(parcel.original_area_unit));
  const [desa, setDesa] = useState(parcel.desa_kelurahan ?? "");
  const [kecamatan, setKecamatan] = useState(parcel.kecamatan ?? "");
  const [kabupaten, setKabupaten] = useState(parcel.kabupaten_kota ?? "");
  const [provinsi, setProvinsi] = useState(parcel.provinsi ?? "DKI Jakarta");
  const [alamat, setAlamat] = useState(parcel.alamat_lengkap ?? "");
  const [notes, setNotes] = useState(parcel.notes ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State manajemen ringkas riwayat kepemilikan
  const [ownerFormOpen, setOwnerFormOpen] = useState(false);
  const [editingOwnerId, setEditingOwnerId] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [ownerType, setOwnerType] = useState<OwnerType>("INDIVIDU");
  const [acquisitionType, setAcquisitionType] = useState("");
  const [acquisitionDate, setAcquisitionDate] = useState("");
  const [sequenceOrder, setSequenceOrder] = useState(
    String((parcel.owners?.length ?? 0) + 1),
  );
  const [isCurrentOwner, setIsCurrentOwner] = useState(true);
  const [transferNotes, setTransferNotes] = useState("");
  const [ownerBusy, setOwnerBusy] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);

  const gisArea = toNumber(parcel.gis_area_m2);
  const normalizedPreviewM2 = useMemo(() => {
    const raw = areaValue.trim();
    if (!raw) return gisArea;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.round(parsed * getUnitFactor(areaUnit) * 100) / 100;
  }, [areaValue, areaUnit, gisArea]);

  const previewDelta =
    normalizedPreviewM2 !== null && gisArea !== null
      ? Math.round((normalizedPreviewM2 - gisArea) * 100) / 100
      : null;

  const openAddOwnerForm = () => {
    setEditingOwnerId(null);
    setOwnerName("");
    setOwnerType("INDIVIDU");
    setAcquisitionType("");
    setAcquisitionDate("");
    const maxSeq = parcel.owners.reduce((max, o) => Math.max(max, o.sequence_order), 0);
    setSequenceOrder(String(maxSeq + 1));
    setIsCurrentOwner(true);
    setTransferNotes("");
    setOwnerError(null);
    setOwnerFormOpen(true);
  };

  const openEditOwnerForm = (owner: OwnerRead) => {
    setEditingOwnerId(owner.id);
    setOwnerName(owner.owner_name);
    const validType = OWNER_TYPES.some((t) => t.value === owner.owner_type)
      ? (owner.owner_type as OwnerType)
      : "INDIVIDU";
    setOwnerType(validType);
    setAcquisitionType(owner.acquisition_type ?? "");
    setAcquisitionDate(owner.acquisition_date ?? "");
    setSequenceOrder(String(owner.sequence_order));
    setIsCurrentOwner(owner.is_current_owner);
    setTransferNotes(owner.transfer_notes ?? "");
    setOwnerError(null);
    setOwnerFormOpen(true);
  };

  const handleSaveOwner = async () => {
    if (!ownerName.trim()) {
      setOwnerError("Nama pemilik wajib diisi.");
      return;
    }
    const parsedOrder = Math.max(1, Number.parseInt(sequenceOrder, 10) || 1);
    setOwnerBusy(true);
    setOwnerError(null);
    try {
      if (editingOwnerId) {
        await updateOwner(editingOwnerId, {
          owner_name: ownerName.trim(),
          owner_type: ownerType,
          sequence_order: parsedOrder,
          is_current_owner: isCurrentOwner,
          acquisition_type: acquisitionType.trim() || null,
          acquisition_date: acquisitionDate.trim() || null,
          transfer_notes: transferNotes.trim() || null,
        });
      } else {
        await createOwner({
          parcel_id: parcel.id,
          owner_name: ownerName.trim(),
          owner_type: ownerType,
          sequence_order: parsedOrder,
          is_current_owner: isCurrentOwner,
          acquisition_type: acquisitionType.trim() || null,
          acquisition_date: acquisitionDate.trim() || null,
          transfer_notes: transferNotes.trim() || null,
          mark_previous_non_current: isCurrentOwner,
        });
      }
      setOwnerFormOpen(false);
      setEditingOwnerId(null);
      await onOwnersChanged?.();
    } catch (err) {
      setOwnerError((err as Error).message);
    } finally {
      setOwnerBusy(false);
    }
  };

  const handleSetCurrentOwner = async (ownerId: string) => {
    setOwnerBusy(true);
    setOwnerError(null);
    try {
      await updateOwner(ownerId, { is_current_owner: true });
      await onOwnersChanged?.();
    } catch (err) {
      setOwnerError((err as Error).message);
    } finally {
      setOwnerBusy(false);
    }
  };

  const handleDeleteOwner = async (ownerId: string) => {
    setOwnerBusy(true);
    setOwnerError(null);
    try {
      await deleteOwner(ownerId);
      if (editingOwnerId === ownerId) {
        setOwnerFormOpen(false);
        setEditingOwnerId(null);
      }
      await onOwnersChanged?.();
    } catch (err) {
      setOwnerError((err as Error).message);
    } finally {
      setOwnerBusy(false);
    }
  };

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parcelCode.trim()) return;

    setSaving(true);
    setError(null);
    try {
      await onSubmit(parcel.id, {
        parcel_code: parcelCode.trim(),
        name: name.trim() || null,
        desa_kelurahan: desa.trim() || null,
        kecamatan: kecamatan.trim() || null,
        kabupaten_kota: kabupaten.trim() || null,
        provinsi: provinsi.trim() || null,
        alamat_lengkap: alamat.trim() || null,
        legal_status: legalStatus,
        original_area_value: areaValue.trim() ? areaValue.trim() : null,
        original_area_unit: areaUnit,
        notes: notes.trim() || null,
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
      aria-labelledby="edit-parcel-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
              <Pencil className="h-4 w-4" />
            </div>
            <div>
              <h2 id="edit-parcel-modal-title" className="text-sm font-bold text-slate-900">
                Edit Info Persil Tanah
              </h2>
              <p className="text-xs text-slate-500">
                <span className="font-mono font-semibold text-slate-700">
                  {parcel.parcel_code}
                </span>
                {parcel.documents.length > 0 && (
                  <span> · {parcel.documents.length} dokumen PDF tertaut tetap aman</span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700"
            aria-label="Tutup modal edit info persil"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <form onSubmit={handleFormSubmit} className="space-y-4 overflow-y-auto p-5 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="font-medium text-slate-700">Kode Persil *</span>
              <input
                required
                value={parcelCode}
                onChange={(e) => setParcelCode(e.target.value)}
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

          <div className="space-y-2">
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
                  placeholder="Otomatis pakai luas GIS"
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

            <dl className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px]">
              <div>
                <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  Normalisasi Luas Surat
                </dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">
                  {formatArea(normalizedPreviewM2)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  Luas GIS Saat Ini
                </dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">
                  {formatArea(gisArea)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  Estimasi Selisih (Δ)
                </dt>
                <dd
                  className={`mt-0.5 font-semibold tabular-nums ${
                    previewDelta !== null && Math.abs(previewDelta) > 0.5
                      ? "text-amber-600"
                      : "text-slate-900"
                  }`}
                >
                  {formatArea(previewDelta)}
                </dd>
              </div>
            </dl>
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

          {/* Sub-seksi Riwayat Kepemilikan Tanah */}
          <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                <Users className="h-3.5 w-3.5 text-blue-600" />
                Riwayat Kepemilikan Tanah ({parcel.owners.length})
              </span>
              <button
                type="button"
                disabled={ownerBusy}
                onClick={openAddOwnerForm}
                className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-white px-2 py-1 text-[11px] font-semibold text-blue-700 shadow-sm transition-colors hover:bg-blue-50 disabled:opacity-50"
              >
                <Plus className="h-3 w-3" /> Tambah Pemilik
              </button>
            </div>

            {ownerError && (
              <p className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">
                {ownerError}
              </p>
            )}

            {parcel.owners.length > 0 ? (
              <ul className="space-y-1.5">
                {parcel.owners.map((owner) => (
                  <li
                    key={owner.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">
                        {owner.sequence_order}. {owner.owner_name}
                        {owner.is_current_owner && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Aktif
                          </span>
                        )}
                      </p>
                      <p className="truncate text-[10px] text-slate-500">
                        {owner.owner_type} · {owner.acquisition_type ?? "-"} ·{" "}
                        {owner.acquisition_date ?? "-"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {!owner.is_current_owner && (
                        <button
                          type="button"
                          disabled={ownerBusy}
                          onClick={() => handleSetCurrentOwner(owner.id)}
                          className="rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-[10px] font-medium text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
                          title="Tandai sebagai pemilik aktif"
                        >
                          <UserCheck className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={ownerBusy}
                        onClick={() => openEditOwnerForm(owner)}
                        className="rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-[10px] text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
                        title="Edit pemilik"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        disabled={ownerBusy}
                        onClick={() => handleDeleteOwner(owner.id)}
                        className="rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-[10px] text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        title="Hapus catatan pemilik"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-slate-500">Belum ada catatan riwayat kepemilikan.</p>
            )}

            {ownerFormOpen && (
              <div className="space-y-2.5 rounded-lg border border-blue-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-blue-900">
                    {editingOwnerId ? "Edit Catatan Pemilik" : "Tambah Pemilik Baru"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setOwnerFormOpen(false);
                      setEditingOwnerId(null);
                    }}
                    className="text-slate-400 hover:text-slate-700"
                    aria-label="Tutup form pemilik"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-[11px] font-medium text-slate-700">Nama Pemilik *</span>
                    <input
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      placeholder="Nama lengkap / entitas"
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-medium text-slate-700">Jenis Subjek</span>
                    <select
                      value={ownerType}
                      onChange={(e) => setOwnerType(e.target.value as OwnerType)}
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                    >
                      {OWNER_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-medium text-slate-700">Dasar Perolehan</span>
                    <input
                      value={acquisitionType}
                      onChange={(e) => setAcquisitionType(e.target.value)}
                      placeholder="mis. AJB / Waris / Hibah"
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                      <span className="text-[11px] font-medium text-slate-700">Tanggal</span>
                      <input
                        type="date"
                        value={acquisitionDate}
                        onChange={(e) => setAcquisitionDate(e.target.value)}
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-medium text-slate-700">Urutan</span>
                      <input
                        type="number"
                        min={1}
                        value={sequenceOrder}
                        onChange={(e) => setSequenceOrder(e.target.value)}
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                      />
                    </label>
                  </div>
                </div>

                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-slate-700">Catatan Peralihan</span>
                  <input
                    value={transferNotes}
                    onChange={(e) => setTransferNotes(e.target.value)}
                    placeholder="Keterangan riwayat transaksi / akta..."
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                  />
                </label>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={isCurrentOwner}
                      onChange={(e) => setIsCurrentOwner(e.target.checked)}
                      className="accent-blue-600"
                    />
                    Tandai sebagai pemilik aktif saat ini
                  </label>
                  <button
                    type="button"
                    disabled={ownerBusy || !ownerName.trim()}
                    onClick={handleSaveOwner}
                    className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    {ownerBusy && <Loader2 className="h-3 w-3 animate-spin" />}
                    {editingOwnerId ? "Simpan Pemilik" : "Tambahkan Pemilik"}
                  </button>
                </div>
              </div>
            )}
          </section>

          {error && (
            <p className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2.5 text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          <footer className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
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
              {saving ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
