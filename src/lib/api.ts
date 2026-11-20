import type {
  AISearchResponse,
  DashboardStats,
  DocumentDetailRead,
  DocumentRead,
  DocumentUploadPayload,
  LegalStatus,
  OcrRawDataRead,
  OcrVerifyPayload,
  OwnerCreatePayload,
  OwnerRead,
  OwnerUpdatePayload,
  ParcelCreatePayload,
  ParcelDetailRead,
  ParcelFeatureCollection,
  ParcelImportPayload,
  ParcelImportResponse,
  ParcelUpdatePayload,
  PdfSignedUrlResponse,
  TokenResponse,
  UserRead,
} from "@/lib/types";

/**
 * Default ke path relatif agar request selalu melewati Next.js rewrites / Nginx
 * (same-origin -> tanpa masalah CORS, dan URL stream PDF relatif tetap valid).
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/v1";

const ACCESS_TOKEN_STORAGE_KEY = "ldkh_gis_access_token";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) {
      window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    }
  } catch {
    /* ignore storage errors */
  }
}

async function parseErrorDetail(response: Response): Promise<string> {
  let detail = `${response.status} ${response.statusText}`;
  try {
    const body = await response.json();
    if (body?.detail) {
      detail =
        typeof body.detail === "string"
          ? body.detail
          : JSON.stringify(body.detail);
    }
  } catch {
    /* body bukan JSON */
  }
  return detail;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const isFormData =
    typeof FormData !== "undefined" && init?.body instanceof FormData;

  const headers: Record<string, string> = {};
  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (init?.headers) {
    Object.assign(headers, init.headers as Record<string, string>);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    credentials: "include",
    ...init,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login") {
      setStoredToken(null);
    }
    const detail = await parseErrorDetail(response);
    throw new ApiError(detail, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  synology_mount: Record<string, unknown>;
}

export const loginWithPassword = async (email: string, password: string) => {
  const data = await request<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setStoredToken(data.access_token);
  return data;
};

export const logoutSession = async () => {
  try {
    await request<void>("/auth/logout", { method: "POST" });
  } finally {
    setStoredToken(null);
  }
};

export const fetchCurrentUser = () => request<UserRead>("/auth/me");

export const fetchBackendHealth = () => request<HealthResponse>("/health");

export const fetchStats = () => request<DashboardStats>("/stats");

export function fetchParcelsGeoJSON(params: {
  legalStatus?: LegalStatus | null;
  search?: string;
}) {
  const qs = new URLSearchParams();
  if (params.legalStatus) qs.set("legal_status", params.legalStatus);
  if (params.search?.trim()) qs.set("search", params.search.trim());
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<ParcelFeatureCollection>(`/parcels/geojson${suffix}`);
}

export const fetchParcelDetail = (parcelId: string) =>
  request<ParcelDetailRead>(`/parcels/${parcelId}`);

export const createParcel = (payload: ParcelCreatePayload) =>
  request<ParcelDetailRead>("/parcels", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateParcel = (parcelId: string, payload: ParcelUpdatePayload) =>
  request<ParcelDetailRead>(`/parcels/${parcelId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const deleteParcel = (parcelId: string) =>
  request<void>(`/parcels/${parcelId}`, {
    method: "DELETE",
  });

export const createOwner = (payload: OwnerCreatePayload) =>
  request<OwnerRead>("/owners", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateOwner = (ownerId: string, payload: OwnerUpdatePayload) =>
  request<OwnerRead>(`/owners/${ownerId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const deleteOwner = (ownerId: string) =>
  request<void>(`/owners/${ownerId}`, {
    method: "DELETE",
  });

export const fetchOrphanedDocuments = () =>
  request<DocumentRead[]>("/documents/orphaned");

export const fetchDocumentDetail = (documentId: string) =>
  request<DocumentDetailRead>(`/documents/${documentId}`);

export const linkDocumentToParcel = (documentId: string, parcelId: string) =>
  request<DocumentDetailRead>(`/documents/${documentId}`, {
    method: "PATCH",
    body: JSON.stringify({ parcel_id: parcelId }),
  });

export const unlinkDocumentFromParcel = (documentId: string) =>
  request<DocumentDetailRead>(`/documents/${documentId}`, {
    method: "PATCH",
    body: JSON.stringify({ parcel_id: null }),
  });

export const uploadDocumentPdf = (payload: DocumentUploadPayload) => {
  const form = new FormData();
  form.append("file", payload.file);
  if (payload.parcel_id) form.append("parcel_id", payload.parcel_id);
  if (payload.document_number?.trim()) {
    form.append("document_number", payload.document_number.trim());
  }
  form.append("document_type", payload.document_type);
  if (payload.title?.trim()) form.append("title", payload.title.trim());
  if (payload.issuing_office?.trim()) {
    form.append("issuing_office", payload.issuing_office.trim());
  }
  form.append("legal_status", payload.legal_status);
  if (
    payload.original_area_value !== undefined &&
    payload.original_area_value !== null &&
    String(payload.original_area_value).trim() !== ""
  ) {
    form.append("original_area_value", String(payload.original_area_value));
  }
  if (payload.original_area_unit) {
    form.append("original_area_unit", payload.original_area_unit);
  }
  if (payload.notes?.trim()) form.append("notes", payload.notes.trim());

  return request<DocumentDetailRead>("/documents/upload", {
    method: "POST",
    body: form,
  });
};

export const replaceDocumentPdf = (
  documentId: string,
  file: File,
  title?: string,
) => {
  const form = new FormData();
  form.append("file", file);
  if (title?.trim()) {
    form.append("title", title.trim());
  }
  return request<DocumentDetailRead>(`/documents/${documentId}/file`, {
    method: "PUT",
    body: form,
  });
};

export const fetchSignedPdfUrl = (documentId: string) =>
  request<PdfSignedUrlResponse>(`/documents/${documentId}/pdf-url`);

export const verifyOcr = (documentId: string, payload: OcrVerifyPayload) =>
  request<OcrRawDataRead>(`/ocr/document/${documentId}/verify`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const searchParcelsWithAI = (query: string) =>
  request<AISearchResponse>("/search/ai", {
    method: "POST",
    body: JSON.stringify({ query }),
  });

export const importParcels = (payload: ParcelImportPayload) => {
  const form = new FormData();
  form.append("file", payload.file);
  form.append("dry_run", String(payload.dryRun));
  form.append("duplicate_strategy", payload.duplicateStrategy);
  if (payload.defaultVillage?.trim()) {
    form.append("default_village", payload.defaultVillage.trim());
  }
  if (payload.defaultDistrict?.trim()) {
    form.append("default_district", payload.defaultDistrict.trim());
  }
  if (payload.defaultCity?.trim()) {
    form.append("default_city", payload.defaultCity.trim());
  }
  if (payload.defaultProvince?.trim()) {
    form.append("default_province", payload.defaultProvince.trim());
  }
  if (payload.defaultLegalStatus) {
    form.append("default_legal_status", payload.defaultLegalStatus);
  }
  return request<ParcelImportResponse>("/parcels/import", {
    method: "POST",
    body: form,
  });
};
