export type LegalStatus =
  | "CLEAR"
  | "SENGKETA"
  | "BEDA_FISIK"
  | "DISITA_BI"
  | "RAMPASAN";

export type VerificationStatus = "DRAFT_AI" | "NEEDS_REVIEW" | "VERIFIED";

export type UserRole = "ADMIN" | "AUDITOR" | "VIEWER" | "GUEST";

export type GuestRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "REVOKED";

export type OwnerType =
  | "INDIVIDU"
  | "KORPORASI"
  | "INSTANSI_PEMERINTAH"
  | "BANK_INDONESIA"
  | "AHLI_WARIS";

export interface UserRead {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  short_code?: string | null;
  session_expires_at?: string | null;
  ip_address?: string | null;
  device_summary?: string | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in_seconds: number;
  user: UserRead;
}

export interface GuestAccessRequestResponse {
  short_code: string;
  wait_token: string;
  status: GuestRequestStatus;
  request_expires_at: string;
  requested_at_wib: string;
  device_summary: string;
  ip_address: string;
}

export interface GuestAccessStatusResponse {
  status: GuestRequestStatus;
  short_code: string;
  request_expires_at: string;
  decided_at: string | null;
}

export interface GuestApprovalDetailResponse {
  short_code: string;
  guest_name: string | null;
  device_summary: string;
  ip_address: string;
  requested_at: string;
  requested_at_wib: string;
  request_expires_at: string;
  remaining_seconds: number;
  status: GuestRequestStatus;
  decided_at: string | null;
  decided_via: string | null;
  is_actionable: boolean;
}

export interface GuestApprovalActionResponse {
  short_code: string;
  status: GuestRequestStatus;
  decided_at: string;
  decided_via: string;
  message: string;
}

export type DocumentType =
  | "SHM"
  | "SHGB"
  | "AJB"
  | "GIRIK"
  | "LETTER_C"
  | "SPH"
  | "PUTUSAN_PENGADILAN"
  | "BERITA_ACARA_SITA"
  | "LAINNYA";

/** Pydantic v2 men-serialisasi Decimal sebagai string, jadi field numerik bisa string | number. */
export type NumericLike = number | string | null;

export interface GeoJSONGeometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: unknown[];
}

export interface ParcelFeatureProperties {
  id: string;
  parcel_code: string;
  name: string | null;
  desa_kelurahan: string | null;
  kecamatan: string | null;
  kabupaten_kota: string | null;
  provinsi: string | null;
  legal_status: LegalStatus;
  thematic_color: string;
  is_disputed_or_seized: boolean;
  area_m2: number | null;
  gis_area_m2: number | null;
  area_discrepancy_m2: number | null;
  current_owner_name: string | null;
  document_count: number;
  primary_document_id: string | null;
  primary_document_number: string | null;
}

export interface ParcelFeature {
  type: "Feature";
  id: string;
  geometry: GeoJSONGeometry;
  properties: ParcelFeatureProperties;
}

export interface ParcelFeatureCollection {
  type: "FeatureCollection";
  total_features: number;
  features: ParcelFeature[];
}

export interface OwnerRead {
  id: string;
  parcel_id: string | null;
  document_id: string | null;
  owner_name: string;
  owner_type: string;
  identity_number: string | null;
  sequence_order: number;
  is_current_owner: boolean;
  acquisition_type: string | null;
  acquisition_date: string | null;
  transfer_notes: string | null;
}

export interface DocumentRead {
  id: string;
  parcel_id: string | null;
  document_number: string;
  document_type: DocumentType;
  title: string | null;
  issue_date: string | null;
  issuing_office: string | null;
  legal_status: LegalStatus;
  original_area_value: NumericLike;
  original_area_unit: string | null;
  stated_area_m2: NumericLike;
  synology_file_path: string;
  file_checksum_sha256: string | null;
  verification_status: VerificationStatus;
  verified_by: string | null;
  verified_at: string | null;
  is_orphaned: boolean;
}

export interface OcrRawDataRead {
  id: string;
  document_id: string;
  ocr_engine: string;
  raw_text: string | null;
  extracted_json: Record<string, unknown>;
  reviewed_json: Record<string, unknown> | null;
  confidence_score: NumericLike;
  verification_status: VerificationStatus;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface DocumentDetailRead extends DocumentRead {
  owners: OwnerRead[];
  ocr_raw_data: OcrRawDataRead | null;
}

export interface ParcelDetailRead {
  id: string;
  parcel_code: string;
  name: string | null;
  desa_kelurahan: string | null;
  kecamatan: string | null;
  kabupaten_kota: string | null;
  provinsi: string | null;
  alamat_lengkap: string | null;
  legal_status: LegalStatus;
  area_m2: NumericLike;
  gis_area_m2: NumericLike;
  original_area_value: NumericLike;
  original_area_unit: string | null;
  notes: string | null;
  geometry: GeoJSONGeometry | null;
  documents: DocumentRead[];
  owners: OwnerRead[];
}

export interface PdfSignedUrlResponse {
  document_id: string;
  document_number: string;
  stream_url: string;
  expires_in_seconds: number;
  content_disposition: string;
}

export interface DashboardStats {
  total_parcels: number;
  total_documents: number;
  orphaned_documents: number;
  total_area_m2: number;
  parcels_by_legal_status: Record<LegalStatus, number>;
  ocr_by_verification_status: Record<VerificationStatus, number>;
}

export interface OcrVerifyPayload {
  reviewed_json: Record<string, unknown>;
  raw_text?: string | null;
  verification_status: VerificationStatus;
  review_notes?: string | null;
  reviewed_by: string;
  sync_to_document: boolean;
}

export interface ParcelCreatePayload {
  parcel_code: string;
  name?: string | null;
  desa_kelurahan?: string | null;
  kecamatan?: string | null;
  kabupaten_kota?: string | null;
  provinsi?: string | null;
  alamat_lengkap?: string | null;
  legal_status: LegalStatus;
  original_area_value?: number | string | null;
  original_area_unit?: string | null;
  notes?: string | null;
  geometry: GeoJSONGeometry;
  orphaned_document_id?: string | null;
  orphaned_document_ids?: string[];
}

export interface ParcelUpdatePayload {
  parcel_code?: string;
  name?: string | null;
  desa_kelurahan?: string | null;
  kecamatan?: string | null;
  kabupaten_kota?: string | null;
  provinsi?: string | null;
  alamat_lengkap?: string | null;
  legal_status?: LegalStatus;
  original_area_value?: number | string | null;
  original_area_unit?: string | null;
  notes?: string | null;
  geometry?: GeoJSONGeometry;
}

export interface OwnerCreatePayload {
  parcel_id?: string | null;
  document_id?: string | null;
  owner_name: string;
  owner_type?: OwnerType;
  identity_number?: string | null;
  sequence_order?: number;
  is_current_owner?: boolean;
  acquisition_type?: string | null;
  acquisition_date?: string | null;
  transfer_notes?: string | null;
  mark_previous_non_current?: boolean;
}

export interface OwnerUpdatePayload {
  owner_name?: string;
  owner_type?: OwnerType;
  identity_number?: string | null;
  sequence_order?: number;
  is_current_owner?: boolean;
  acquisition_type?: string | null;
  acquisition_date?: string | null;
  transfer_notes?: string | null;
}

export interface DocumentUploadPayload {
  file: File;
  parcel_id?: string | null;
  document_number?: string;
  document_type: DocumentType;
  title?: string;
  issuing_office?: string;
  legal_status: LegalStatus;
  original_area_value?: number | string | null;
  original_area_unit?: string;
  notes?: string;
}

export interface AISearchQueryPlan {
  legal_statuses: LegalStatus[];
  document_types: DocumentType[];
  verification_statuses: VerificationStatus[];
  location_keywords: string[];
  owner_keywords: string[];
  text_keywords: string[];
  min_area_m2: number | null;
  max_area_m2: number | null;
  area_discrepancy_only: boolean;
  explanation: string;
}

export interface AISearchParcelMatch {
  parcel_id: string;
  parcel_code: string;
  name: string | null;
  legal_status: LegalStatus;
  desa_kelurahan: string | null;
  matched_documents: string[];
  ocr_snippet: string | null;
}

export interface AISearchOrphanedMatch {
  document_id: string;
  document_number: string;
  document_type: DocumentType;
  title: string | null;
  legal_status: LegalStatus;
  ocr_snippet: string | null;
}

export interface AISearchResponse {
  query: string;
  model_used: string;
  explanation: string;
  parsed_filters: AISearchQueryPlan;
  parcel_ids: string[];
  total_matched: number;
  matches: AISearchParcelMatch[];
  orphaned_matches: AISearchOrphanedMatch[];
}

export type DuplicateStrategy = "skip" | "update" | "create_new";

export type PlannedImportAction =
  | "create"
  | "skip"
  | "update"
  | "create_new"
  | "invalid";

export interface ParcelImportFeaturePreview {
  feature_index: number;
  parcel_code: string;
  resolved_parcel_code: string;
  name: string | null;
  owner_name: string | null;
  village: string | null;
  district: string | null;
  city: string | null;
  province: string | null;
  legal_status: LegalStatus;
  certificate_area_m2: number | null;
  gis_area_m2: number | null;
  area_discrepancy_m2: number | null;
  color_group: string | null;
  raw_label: string | null;
  notes: string | null;
  is_valid: boolean;
  validation_error: string | null;
  is_duplicate: boolean;
  existing_parcel_id: string | null;
  planned_action: PlannedImportAction;
  geometry: GeoJSONGeometry | null;
}

export interface ParcelImportResponse {
  dry_run: boolean;
  duplicate_strategy: DuplicateStrategy;
  source_filename: string;
  total_features: number;
  valid_features: number;
  invalid_features: number;
  duplicate_count: number;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  total_certificate_area_m2: number;
  total_gis_area_m2: number;
  features: ParcelImportFeaturePreview[];
}

export interface ParcelImportPayload {
  file: File;
  dryRun: boolean;
  duplicateStrategy: DuplicateStrategy;
  defaultVillage?: string;
  defaultDistrict?: string;
  defaultCity?: string;
  defaultProvince?: string;
  defaultLegalStatus?: LegalStatus;
}
