"use client";

import MapboxDraw from "@mapbox/mapbox-gl-draw";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Crosshair,
  FileText,
  FileUp,
  ImagePlus,
  Layers,
  Loader2,
  LocateFixed,
  Lock,
  LockOpen,
  Map as MapIcon,
  Navigation,
  Pentagon,
  Plus,
  RefreshCw,
  RotateCcw,
  Satellite,
  Trash2,
  X,
} from "lucide-react";
import maplibregl, {
  type GeoJSONSource,
  type ImageSource,
  type LngLatBoundsLike,
  type Map as MapLibreMap,
  type MapGeoJSONFeature,
  type StyleSpecification,
} from "maplibre-gl";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { LEGAL_STATUS_COLOR_EXPRESSION, formatArea, toNumber } from "@/lib/thematic";
import type {
  GeoJSONGeometry,
  ParcelDetailRead,
  ParcelFeature,
  ParcelFeatureCollection,
  ParcelImportFeaturePreview,
} from "@/lib/types";

const SOURCE_ID = "ldkh-parcels";
const FILL_LAYER = "ldkh-parcels-fill";
const AI_GLOW_LAYER = "ldkh-parcels-ai-glow";
const LINE_LAYER = "ldkh-parcels-outline";
const LABEL_LAYER = "ldkh-parcels-label";

const IMPORT_PREVIEW_SOURCE_ID = "ldkh-import-preview";
const IMPORT_PREVIEW_FILL_LAYER = "ldkh-import-preview-fill";
const IMPORT_PREVIEW_LINE_LAYER = "ldkh-import-preview-line";
const IMPORT_PREVIEW_LABEL_LAYER = "ldkh-import-preview-label";

const OVERLAY_SOURCE_ID = "ldkh-image-overlay";
const OVERLAY_LAYER_ID = "ldkh-image-overlay-layer";
const OVERLAY_FRAME_SOURCE_ID = "ldkh-image-overlay-frame";
const OVERLAY_FRAME_LAYER_ID = "ldkh-image-overlay-frame-layer";

const GPS_ACCURACY_SOURCE_ID = "ldkh-gps-accuracy";
const GPS_ACCURACY_FILL_LAYER = "ldkh-gps-accuracy-fill";
const GPS_ACCURACY_LINE_LAYER = "ldkh-gps-accuracy-line";

const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const BASEMAP_LAYER_IDS = {
  road: "basemap-osm",
  satellite: "basemap-satellite",
  hybridRoads: "basemap-hybrid-roads",
  hybridLabels: "basemap-hybrid-labels",
} as const;

type BasemapMode = "road" | "satellite" | "hybrid";
type GpsState = "idle" | "locating" | "tracking";
interface GpsPosition {
  lng: number;
  lat: number;
  accuracy: number;
  heading: number | null;
}
type LngLatTuple = [number, number];
type OverlayCorners = [LngLatTuple, LngLatTuple, LngLatTuple, LngLatTuple];

interface OverlayImageData {
  dataUrl: string;
  width: number;
  height: number;
  fileName: string;
}

const CORNER_LABELS = ["TL", "TR", "BR", "BL"] as const;
const CORNER_TITLES = [
  "Sudut Kiri-Atas (Top-Left)",
  "Sudut Kanan-Atas (Top-Right)",
  "Sudut Kanan-Bawah (Bottom-Right)",
  "Sudut Kiri-Bawah (Bottom-Left)",
] as const;

const BASEMAP_OPTIONS: Array<{
  id: BasemapMode;
  label: string;
  Icon: typeof MapIcon;
}> = [
  { id: "road", label: "Peta Jalan", Icon: MapIcon },
  { id: "satellite", label: "Satelit", Icon: Satellite },
  { id: "hybrid", label: "Hybrid", Icon: Layers },
];

/** Default view: Desa Sukaharja, Kec. Sukamakmur, Kab. Bogor. */
const DEFAULT_CENTER: [number, number] = [106.9525, -6.5808];
const DEFAULT_ZOOM = 15;

/** Multi-basemap style (OSM + Esri World Imagery + Hybrid Reference) agar pergantian basemap tidak mereset layer LDKH/Draw. */
const BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap contributors",
    },
    "esri-satellite": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Tiles © Esri",
    },
    "esri-hybrid-roads": {
      type: "raster",
      tiles: [
        "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
    },
    "esri-hybrid-labels": {
      type: "raster",
      tiles: [
        "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: BASEMAP_LAYER_IDS.road,
      type: "raster",
      source: "osm",
      layout: { visibility: "visible" },
    },
    {
      id: BASEMAP_LAYER_IDS.satellite,
      type: "raster",
      source: "esri-satellite",
      layout: { visibility: "none" },
    },
    {
      id: BASEMAP_LAYER_IDS.hybridRoads,
      type: "raster",
      source: "esri-hybrid-roads",
      layout: { visibility: "none" },
    },
    {
      id: BASEMAP_LAYER_IDS.hybridLabels,
      type: "raster",
      source: "esri-hybrid-labels",
      layout: { visibility: "none" },
    },
  ],
};

const EMPTY_COLLECTION: ParcelFeatureCollection = {
  type: "FeatureCollection",
  total_features: 0,
  features: [],
};

function collectCoordinates(geometry: GeoJSONGeometry): [number, number][] {
  const out: [number, number][] = [];
  const walk = (node: unknown) => {
    if (
      Array.isArray(node) &&
      node.length >= 2 &&
      typeof node[0] === "number" &&
      typeof node[1] === "number"
    ) {
      out.push([node[0], node[1]]);
      return;
    }
    if (Array.isArray(node)) node.forEach(walk);
  };
  walk(geometry.coordinates);
  return out;
}

function geometryBounds(geometry: GeoJSONGeometry): LngLatBoundsLike | null {
  const coords = collectCoordinates(geometry);
  if (!coords.length) return null;
  const bounds = new maplibregl.LngLatBounds(coords[0], coords[0]);
  coords.forEach((c) => bounds.extend(c));
  return bounds;
}

const WGS84_RADIUS = 6378137;

function rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function buildAccuracyCircleGeoJSON(
  lng: number,
  lat: number,
  accuracyMeters: number,
): GeoJSON.FeatureCollection {
  const radius = Math.max(accuracyMeters, 2);
  const steps = 64;
  const latRad = rad(lat);
  const dLat = (radius / WGS84_RADIUS) * (180 / Math.PI);
  const cosLat = Math.max(0.01, Math.cos(latRad));
  const dLng = dLat / cosLat;

  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(theta), lat + dLat * Math.sin(theta)]);
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [ring],
        },
      },
    ],
  };
}

function createGpsUserMarkerElements(): {
  container: HTMLDivElement;
  headingEl: HTMLDivElement;
} {
  const container = document.createElement("div");
  container.className = "pointer-events-none relative flex h-8 w-8 items-center justify-center";

  const pulse = document.createElement("div");
  pulse.className = "absolute h-7 w-7 animate-ping rounded-full bg-blue-500/35";
  container.appendChild(pulse);

  const headingEl = document.createElement("div");
  headingEl.className = "absolute inset-0 hidden items-start justify-center";
  headingEl.innerHTML =
    '<div style="width:0;height:0;margin-top:-2px;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:9px solid #1D4ED8;"></div>';
  container.appendChild(headingEl);

  const dot = document.createElement("div");
  dot.className =
    "relative h-4 w-4 rounded-full border-2 border-white bg-blue-600 shadow-md ring-2 ring-blue-500/30";
  container.appendChild(dot);

  return { container, headingEl };
}

function ringAreaM2(coords: number[][]): number {
  if (!Array.isArray(coords) || coords.length < 4) return 0;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[(i + 2) % (coords.length - 1)];
    if (!p1 || !p2 || !p3) continue;
    total += (rad(p3[0]) - rad(p1[0])) * Math.sin(rad(p2[1]));
  }
  return Math.abs((total * WGS84_RADIUS * WGS84_RADIUS) / 2);
}

function polygonCoordsAreaM2(rings: number[][][]): number {
  if (!Array.isArray(rings) || !rings.length) return 0;
  let area = ringAreaM2(rings[0]);
  for (let i = 1; i < rings.length; i++) {
    area -= ringAreaM2(rings[i]);
  }
  return Math.max(0, area);
}

function computeGeometryAreaM2(geometry: GeoJSONGeometry | null): number | null {
  if (!geometry) return null;
  if (geometry.type === "Polygon") {
    return Math.round(polygonCoordsAreaM2(geometry.coordinates as number[][][]) * 100) / 100;
  }
  if (geometry.type === "MultiPolygon") {
    const polys = geometry.coordinates as number[][][][];
    const sum = polys.reduce((acc, poly) => acc + polygonCoordsAreaM2(poly), 0);
    return Math.round(sum * 100) / 100;
  }
  return null;
}

function toEditableDrawGeometry(geometry: GeoJSONGeometry): GeoJSONGeometry {
  if (
    geometry.type === "MultiPolygon" &&
    Array.isArray(geometry.coordinates) &&
    geometry.coordinates.length === 1
  ) {
    return {
      type: "Polygon",
      coordinates: geometry.coordinates[0] as unknown[],
    };
  }
  return geometry;
}

function populateDrawWithParcel(
  draw: MapboxDraw,
  map: MapLibreMap,
  parcel: ParcelDetailRead,
  shouldFit: boolean,
): GeoJSONGeometry | null {
  if (!parcel.geometry) return null;
  const editableGeom = toEditableDrawGeometry(parcel.geometry);
  draw.deleteAll();
  const featureIds = draw.add({
    type: "Feature",
    properties: { parcel_id: parcel.id },
    geometry: editableGeom as GeoJSON.Polygon | GeoJSON.MultiPolygon,
  } as GeoJSON.Feature);
  const featureId = featureIds[0];
  if (featureId) {
    if (editableGeom.type === "Polygon") {
      draw.changeMode("direct_select", { featureId });
    } else {
      draw.changeMode("simple_select", { featureIds: [featureId] });
    }
  }
  if (shouldFit) {
    const bounds = geometryBounds(parcel.geometry);
    if (bounds) {
      map.fitBounds(bounds, { padding: 120, maxZoom: 19, duration: 600 });
    }
  }
  return editableGeom;
}

function syncHighlightState(
  map: MapLibreMap,
  collection: ParcelFeatureCollection | null,
  highlightIds: string[] | null,
) {
  if (!collection) return;
  const active = highlightIds !== null;
  const matchSet = new Set(highlightIds ?? []);
  for (const feature of collection.features) {
    const id = feature.properties.id;
    map.setFeatureState(
      { source: SOURCE_ID, id },
      {
        aiMatch: active && matchSet.has(id),
        aiDimmed: active && !matchSet.has(id),
      },
    );
  }
}

function applyMapData(
  map: MapLibreMap,
  collection: ParcelFeatureCollection | null,
  selectedId: string | null,
  highlightIds: string[] | null,
  didFitRef: { current: boolean },
  hiddenParcelId: string | null = null,
) {
  const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  if (!source) return;
  const filteredCollection =
    collection && hiddenParcelId
      ? {
          ...collection,
          features: collection.features.filter((f) => f.properties.id !== hiddenParcelId),
        }
      : collection;
  source.setData((filteredCollection ?? EMPTY_COLLECTION) as GeoJSON.FeatureCollection);

  if (selectedId && selectedId !== hiddenParcelId) {
    map.setFeatureState({ source: SOURCE_ID, id: selectedId }, { selected: true });
  }
  syncHighlightState(map, filteredCollection ?? null, highlightIds);

  // Auto-fit ke seluruh persil pada pemuatan data pertama.
  if (!didFitRef.current && collection && collection.features.length) {
    const all = collection.features.flatMap((f) => collectCoordinates(f.geometry));
    if (all.length) {
      const bounds = new maplibregl.LngLatBounds(all[0], all[0]);
      all.forEach((c) => bounds.extend(c));
      map.fitBounds(bounds, { padding: 60, duration: 0, maxZoom: 17 });
      didFitRef.current = true;
    }
  }
}

function applyBasemapVisibility(map: MapLibreMap, mode: BasemapMode) {
  const visibilityByLayer: Record<string, "visible" | "none"> = {
    [BASEMAP_LAYER_IDS.road]: mode === "road" ? "visible" : "none",
    [BASEMAP_LAYER_IDS.satellite]: mode === "satellite" || mode === "hybrid" ? "visible" : "none",
    [BASEMAP_LAYER_IDS.hybridRoads]: mode === "hybrid" ? "visible" : "none",
    [BASEMAP_LAYER_IDS.hybridLabels]: mode === "hybrid" ? "visible" : "none",
  };
  for (const [layerId, visibility] of Object.entries(visibilityByLayer)) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibility);
    }
  }
  if (map.getLayer(LABEL_LAYER)) {
    const onDarkImagery = mode !== "road";
    map.setPaintProperty(LABEL_LAYER, "text-color", onDarkImagery ? "#F8FAFC" : "#0F172A");
    map.setPaintProperty(LABEL_LAYER, "text-halo-color", onDarkImagery ? "#0F172A" : "#FFFFFF");
    map.setPaintProperty(LABEL_LAYER, "text-halo-width", onDarkImagery ? 1.8 : 1.5);
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Gagal membaca file gambar."));
      }
    };
    reader.onerror = () => reject(new Error("Gagal membaca file gambar."));
    reader.readAsDataURL(file);
  });
}

function loadImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        reject(new Error("Dimensi gambar tidak valid."));
        return;
      }
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => reject(new Error("File gambar tidak dapat didekode oleh browser."));
    img.src = url;
  });
}

async function renderPdfFirstPageToImage(file: File): Promise<OverlayImageData> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;

  try {
    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const maxDim = Math.max(baseViewport.width, baseViewport.height);
    const targetMaxDim = 2200;
    const scale = maxDim > 0 ? Math.min(3, targetMaxDim / maxDim) : 1.5;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context tidak tersedia di browser.");
    }

    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL("image/png");
    return {
      dataUrl,
      width: canvas.width,
      height: canvas.height,
      fileName: file.name,
    };
  } finally {
    await pdf.destroy();
  }
}

async function loadOverlayFile(file: File): Promise<OverlayImageData> {
  const lowerName = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || lowerName.endsWith(".pdf");
  if (isPdf) {
    return renderPdfFirstPageToImage(file);
  }

  const isSupportedImage =
    file.type.startsWith("image/") ||
    [".png", ".jpg", ".jpeg", ".webp"].some((ext) => lowerName.endsWith(ext));
  if (!isSupportedImage) {
    throw new Error("Format file tidak didukung. Gunakan PNG, JPG, WEBP, atau PDF.");
  }

  const dataUrl = await readFileAsDataUrl(file);
  const { width, height } = await loadImageDimensions(dataUrl);
  return { dataUrl, width, height, fileName: file.name };
}

function computeInitialOverlayCorners(
  map: MapLibreMap,
  width: number,
  height: number,
): OverlayCorners {
  const canvas = map.getCanvas();
  const clientW = canvas.clientWidth || 800;
  const clientH = canvas.clientHeight || 600;

  const maxW = clientW * 0.62;
  const maxH = clientH * 0.62;
  const fitScale = Math.min(maxW / Math.max(1, width), maxH / Math.max(1, height));
  const boxW = Math.max(80, width * fitScale);
  const boxH = Math.max(80, height * fitScale);

  const cx = clientW / 2;
  const cy = clientH / 2;

  const tl = map.unproject([cx - boxW / 2, cy - boxH / 2]);
  const tr = map.unproject([cx + boxW / 2, cy - boxH / 2]);
  const br = map.unproject([cx + boxW / 2, cy + boxH / 2]);
  const bl = map.unproject([cx - boxW / 2, cy + boxH / 2]);

  return [
    [tl.lng, tl.lat],
    [tr.lng, tr.lat],
    [br.lng, br.lat],
    [bl.lng, bl.lat],
  ];
}

function buildOverlayFrameFeatureCollection(
  corners: OverlayCorners,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [[corners[0], corners[1], corners[2], corners[3], corners[0]]],
        },
      },
    ],
  };
}

function createCornerMarkerElement(label: string, title: string): HTMLDivElement {
  const el = document.createElement("div");
  el.title = title;
  el.className =
    "flex h-6 w-6 cursor-grab items-center justify-center rounded-full border-2 border-sky-600 bg-white text-[9px] font-extrabold tracking-tight text-sky-700 shadow-md ring-2 ring-white/90 transition-transform hover:scale-110 active:cursor-grabbing";
  el.textContent = label;
  el.addEventListener("click", (ev) => ev.stopPropagation());
  return el;
}

function syncOverlaySourcesOnMap(
  map: MapLibreMap,
  image: OverlayImageData,
  corners: OverlayCorners,
  opacityPercent: number,
  locked: boolean,
) {
  const beforeLayer = map.getLayer(FILL_LAYER) ? FILL_LAYER : undefined;
  const existingSource = map.getSource(OVERLAY_SOURCE_ID) as ImageSource | undefined;
  if (existingSource) {
    existingSource.updateImage({ url: image.dataUrl, coordinates: corners });
  } else {
    map.addSource(OVERLAY_SOURCE_ID, {
      type: "image",
      url: image.dataUrl,
      coordinates: corners,
    });
  }

  if (!map.getLayer(OVERLAY_LAYER_ID)) {
    map.addLayer(
      {
        id: OVERLAY_LAYER_ID,
        type: "raster",
        source: OVERLAY_SOURCE_ID,
        paint: {
          "raster-opacity": opacityPercent / 100,
          "raster-fade-duration": 0,
        },
      },
      beforeLayer,
    );
  } else {
    map.setPaintProperty(OVERLAY_LAYER_ID, "raster-opacity", opacityPercent / 100);
  }

  const frameData = buildOverlayFrameFeatureCollection(corners);
  const existingFrameSource = map.getSource(OVERLAY_FRAME_SOURCE_ID) as GeoJSONSource | undefined;
  if (existingFrameSource) {
    existingFrameSource.setData(frameData);
  } else {
    map.addSource(OVERLAY_FRAME_SOURCE_ID, {
      type: "geojson",
      data: frameData,
    });
  }

  if (!map.getLayer(OVERLAY_FRAME_LAYER_ID)) {
    map.addLayer(
      {
        id: OVERLAY_FRAME_LAYER_ID,
        type: "line",
        source: OVERLAY_FRAME_SOURCE_ID,
        paint: {
          "line-color": "#0284C7",
          "line-width": 2,
          "line-dasharray": [3, 2],
          "line-opacity": locked ? 0.4 : 0.9,
        },
      },
      beforeLayer,
    );
  } else {
    map.setPaintProperty(OVERLAY_FRAME_LAYER_ID, "line-opacity", locked ? 0.4 : 0.9);
  }
}

function clearOverlayMarkers(markers: maplibregl.Marker[]) {
  markers.forEach((m) => m.remove());
  markers.length = 0;
}

function removeOverlayFromMap(map: MapLibreMap | null, markers: maplibregl.Marker[]) {
  clearOverlayMarkers(markers);
  if (!map) return;
  try {
    if (map.getLayer(OVERLAY_FRAME_LAYER_ID)) map.removeLayer(OVERLAY_FRAME_LAYER_ID);
    if (map.getSource(OVERLAY_FRAME_SOURCE_ID)) map.removeSource(OVERLAY_FRAME_SOURCE_ID);
    if (map.getLayer(OVERLAY_LAYER_ID)) map.removeLayer(OVERLAY_LAYER_ID);
    if (map.getSource(OVERLAY_SOURCE_ID)) map.removeSource(OVERLAY_SOURCE_ID);
  } catch {
    /* abaikan bila style map sudah dilepas */
  }
}

function buildGcpJsonPayload(image: OverlayImageData, corners: OverlayCorners): string {
  return JSON.stringify(
    {
      mode: "corners",
      source_file: image.fileName,
      image_size: { width: image.width, height: image.height },
      corners: {
        top_left: corners[0],
        top_right: corners[1],
        bottom_right: corners[2],
        bottom_left: corners[3],
      },
      coordinates: corners,
    },
    null,
    2,
  );
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!ok) {
    throw new Error("Browser menolak akses clipboard.");
  }
}

function buildImportPreviewCollection(
  features: ParcelImportFeaturePreview[] | null | undefined,
): GeoJSON.FeatureCollection {
  if (!features || !features.length) {
    return { type: "FeatureCollection", features: [] };
  }
  return {
    type: "FeatureCollection",
    features: features
      .filter((item) => item.is_valid && item.geometry)
      .map((item) => ({
        type: "Feature",
        properties: {
          parcel_code: item.parcel_code,
          resolved_parcel_code: item.resolved_parcel_code,
          is_duplicate: item.is_duplicate,
          planned_action: item.planned_action,
        },
        geometry: item.geometry as unknown as GeoJSON.Polygon | GeoJSON.MultiPolygon,
      })),
  };
}

function applyImportPreviewData(
  map: MapLibreMap,
  features: ParcelImportFeaturePreview[] | null | undefined,
  shouldFit: boolean,
) {
  const source = map.getSource(IMPORT_PREVIEW_SOURCE_ID) as GeoJSONSource | undefined;
  if (!source) return;
  const collection = buildImportPreviewCollection(features);
  source.setData(collection);

  if (shouldFit && features && features.length) {
    const coords = features
      .filter((item) => item.is_valid && item.geometry)
      .flatMap((item) => collectCoordinates(item.geometry!));
    if (coords.length) {
      const bounds = new maplibregl.LngLatBounds(coords[0], coords[0]);
      coords.forEach((c) => bounds.extend(c));
      map.fitBounds(bounds, { padding: 80, maxZoom: 18, duration: 700 });
    }
  }
}

interface ParcelMapProps {
  data: ParcelFeatureCollection | null;
  allParcels?: ParcelFeatureCollection | null;
  selectedParcelId: string | null;
  highlightedParcelIds?: string[] | null;
  isAdmin?: boolean;
  canEdit?: boolean;
  importPreviewFeatures?: ParcelImportFeaturePreview[] | null;
  onOpenImportModal?: () => void;
  onOpenDocument?: (documentId: string) => void;
  onSelectParcel: (parcelId: string | null) => void;
  onPolygonDrawn?: (geometry: GeoJSONGeometry) => void;
  clearDraftSignal?: number;
  editingParcel?: ParcelDetailRead | null;
  onSaveEditedGeometry?: (parcelId: string, geometry: GeoJSONGeometry) => Promise<void>;
  onCancelEditGeometry?: () => void;
  onFocusModeChange?: (active: boolean) => void;
}

export default function ParcelMap({
  data,
  allParcels = null,
  selectedParcelId,
  highlightedParcelIds = null,
  isAdmin = false,
  canEdit = true,
  importPreviewFeatures = null,
  onOpenImportModal,
  onOpenDocument,
  onSelectParcel,
  onPolygonDrawn,
  clearDraftSignal,
  editingParcel = null,
  onSaveEditedGeometry,
  onCancelEditGeometry,
  onFocusModeChange,
}: ParcelMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const loadedRef = useRef(false);
  const hoveredIdRef = useRef<string | number | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const editingParcelIdRef = useRef<string | null>(null);
  const highlightedIdsRef = useRef<string[] | null>(highlightedParcelIds);
  const isDrawingRef = useRef(false);
  const onSelectRef = useRef(onSelectParcel);
  const onPolygonDrawnRef = useRef(onPolygonDrawn);
  const onFocusModeChangeRef = useRef(onFocusModeChange);
  const undoDrawVertexRef = useRef<(() => void) | null>(null);
  const dataRef = useRef<ParcelFeatureCollection | null>(data);
  const importPreviewRef = useRef<ParcelImportFeaturePreview[] | null>(importPreviewFeatures);
  const didFitRef = useRef(false);

  const overlayFileInputRef = useRef<HTMLInputElement>(null);
  const overlayMarkersRef = useRef<maplibregl.Marker[]>([]);
  const overlayCornersRef = useRef<OverlayCorners | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [basemapMode, setBasemapMode] = useState<BasemapMode>("road");
  const basemapModeRef = useRef<BasemapMode>("road");

  const [overlayImage, setOverlayImage] = useState<OverlayImageData | null>(null);
  const [overlayCorners, setOverlayCorners] = useState<OverlayCorners | null>(null);
  const [overlayOpacity, setOverlayOpacity] = useState(75);
  const [overlayLocked, setOverlayLocked] = useState(false);
  const [overlayPanelMinimized, setOverlayPanelMinimized] = useState(false);
  const [overlayLoading, setOverlayLoading] = useState(false);
  const [overlayError, setOverlayError] = useState<string | null>(null);
  const [copiedGcp, setCopiedGcp] = useState(false);

  const overlayOpacityRef = useRef(overlayOpacity);
  const overlayLockedRef = useRef(overlayLocked);
  overlayOpacityRef.current = overlayOpacity;
  overlayLockedRef.current = overlayLocked;
  basemapModeRef.current = basemapMode;
  importPreviewRef.current = importPreviewFeatures;

  const [drawReady, setDrawReady] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDraftPolygon, setHasDraftPolygon] = useState(false);
  const [editedGeometry, setEditedGeometry] = useState<GeoJSONGeometry | null>(null);
  const [savingGeometry, setSavingGeometry] = useState(false);
  const [editGeometryError, setEditGeometryError] = useState<string | null>(null);
  const [mobileFabOpen, setMobileFabOpen] = useState(false);

  const [gpsState, setGpsState] = useState<GpsState>("idle");
  const [gpsPosition, setGpsPosition] = useState<GpsPosition | null>(null);
  const [gpsFollow, setGpsFollow] = useState(true);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [copiedGpsCoord, setCopiedGpsCoord] = useState(false);
  const gpsWatchIdRef = useRef<number | null>(null);
  const gpsMarkerRef = useRef<maplibregl.Marker | null>(null);
  const gpsHeadingElRef = useRef<HTMLDivElement | null>(null);
  const gpsPositionRef = useRef<GpsPosition | null>(null);
  const gpsFollowRef = useRef(true);
  const gpsFirstFixRef = useRef(false);
  const gpsErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gpsCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  onSelectRef.current = onSelectParcel;
  onPolygonDrawnRef.current = onPolygonDrawn;
  onFocusModeChangeRef.current = onFocusModeChange;
  dataRef.current = data;
  highlightedIdsRef.current = highlightedParcelIds;

  const isFocusMode =
    isDrawing || Boolean(editingParcel) || (Boolean(overlayImage) && !overlayLocked);

  useEffect(() => {
    onFocusModeChangeRef.current?.(isFocusMode);
    if (isFocusMode) {
      setMobileFabOpen(false);
    }
  }, [isFocusMode]);

  // Inisialisasi peta (sekali).
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const mapContainer = containerRef.current;
    const map = new maplibregl.Map({
      container: mapContainer,
      style: BASEMAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    let orientationTimer: ReturnType<typeof setTimeout> | null = null;
    const handleOrientationChange = () => {
      if (orientationTimer) clearTimeout(orientationTimer);
      orientationTimer = setTimeout(() => {
        mapRef.current?.resize();
      }, 150);
    };
    window.addEventListener("orientationchange", handleOrientationChange);

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            mapRef.current?.resize();
          })
        : null;
    resizeObserver?.observe(mapContainer);

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", () => {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: (dataRef.current ?? EMPTY_COLLECTION) as GeoJSON.FeatureCollection,
        promoteId: "id",
      });

      map.addLayer({
        id: FILL_LAYER,
        type: "fill",
        source: SOURCE_ID,
        paint: {
          "fill-color": LEGAL_STATUS_COLOR_EXPRESSION,
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.78,
            ["boolean", ["feature-state", "aiMatch"], false],
            0.75,
            ["boolean", ["feature-state", "aiDimmed"], false],
            0.12,
            ["boolean", ["feature-state", "hover"], false],
            0.55,
            0.35,
          ],
        },
      });

      map.addLayer({
        id: AI_GLOW_LAYER,
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": "#0EA5E9",
          "line-width": [
            "case",
            ["boolean", ["feature-state", "aiMatch"], false],
            7,
            0,
          ],
          "line-opacity": [
            "case",
            ["boolean", ["feature-state", "aiMatch"], false],
            0.5,
            0,
          ],
        },
      });

      map.addLayer({
        id: LINE_LAYER,
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "#0F172A",
            ["boolean", ["feature-state", "aiMatch"], false],
            "#1D4ED8",
            LEGAL_STATUS_COLOR_EXPRESSION,
          ],
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            3.5,
            ["boolean", ["feature-state", "aiMatch"], false],
            3,
            ["boolean", ["feature-state", "hover"], false],
            2.5,
            1.5,
          ],
          "line-opacity": [
            "case",
            ["boolean", ["feature-state", "aiDimmed"], false],
            0.28,
            1,
          ],
        },
      });

      map.addLayer({
        id: LABEL_LAYER,
        type: "symbol",
        source: SOURCE_ID,
        minzoom: 14,
        layout: {
          "text-field": ["get", "parcel_code"],
          "text-size": 11,
          "text-font": ["Open Sans Semibold"],
        },
        paint: {
          "text-color": "#0F172A",
          "text-halo-color": "#FFFFFF",
          "text-halo-width": 1.5,
        },
      });

      map.addSource(IMPORT_PREVIEW_SOURCE_ID, {
        type: "geojson",
        data: buildImportPreviewCollection(importPreviewRef.current),
      });

      map.addLayer({
        id: IMPORT_PREVIEW_FILL_LAYER,
        type: "fill",
        source: IMPORT_PREVIEW_SOURCE_ID,
        paint: {
          "fill-color": [
            "case",
            ["boolean", ["get", "is_duplicate"], false],
            "#F97316",
            "#0EA5E9",
          ],
          "fill-opacity": 0.22,
        },
      });

      map.addLayer({
        id: IMPORT_PREVIEW_LINE_LAYER,
        type: "line",
        source: IMPORT_PREVIEW_SOURCE_ID,
        paint: {
          "line-color": [
            "case",
            ["boolean", ["get", "is_duplicate"], false],
            "#EA580C",
            "#0284C7",
          ],
          "line-width": 2.5,
          "line-dasharray": [3, 2],
        },
      });

      map.addLayer({
        id: IMPORT_PREVIEW_LABEL_LAYER,
        type: "symbol",
        source: IMPORT_PREVIEW_SOURCE_ID,
        layout: {
          "text-field": ["get", "resolved_parcel_code"],
          "text-size": 11,
          "text-font": ["Open Sans Semibold"],
        },
        paint: {
          "text-color": [
            "case",
            ["boolean", ["get", "is_duplicate"], false],
            "#9A3412",
            "#075985",
          ],
          "text-halo-color": "#FFFFFF",
          "text-halo-width": 1.6,
        },
      });

      map.addSource(GPS_ACCURACY_SOURCE_ID, {
        type: "geojson",
        data: EMPTY_FEATURE_COLLECTION,
      });

      map.addLayer({
        id: GPS_ACCURACY_FILL_LAYER,
        type: "fill",
        source: GPS_ACCURACY_SOURCE_ID,
        paint: {
          "fill-color": "#3B82F6",
          "fill-opacity": 0.16,
        },
      });

      map.addLayer({
        id: GPS_ACCURACY_LINE_LAYER,
        type: "line",
        source: GPS_ACCURACY_SOURCE_ID,
        paint: {
          "line-color": "#2563EB",
          "line-width": 1.5,
          "line-dasharray": [2, 2],
          "line-opacity": 0.7,
        },
      });

      map.on("dragstart", (e) => {
        if (e.originalEvent && gpsWatchIdRef.current !== null) {
          gpsFollowRef.current = false;
          setGpsFollow(false);
        }
      });

      map.on("mousemove", FILL_LAYER, (e) => {
        if (isDrawingRef.current || editingParcelIdRef.current !== null) return;
        const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
        if (!feature || feature.id === undefined) return;
        if (hoveredIdRef.current !== null && hoveredIdRef.current !== feature.id) {
          map.setFeatureState(
            { source: SOURCE_ID, id: hoveredIdRef.current },
            { hover: false },
          );
        }
        hoveredIdRef.current = feature.id;
        map.setFeatureState({ source: SOURCE_ID, id: feature.id }, { hover: true });
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", FILL_LAYER, () => {
        if (hoveredIdRef.current !== null) {
          map.setFeatureState(
            { source: SOURCE_ID, id: hoveredIdRef.current },
            { hover: false },
          );
        }
        hoveredIdRef.current = null;
        if (!isDrawingRef.current && editingParcelIdRef.current === null) {
          map.getCanvas().style.cursor = "";
        }
      });

      // onClick poligon -> buka sidebar detail tanah (nonaktif saat mode digitasi / edit poligon).
      map.on("click", (e) => {
        if (isDrawingRef.current || editingParcelIdRef.current !== null) return;
        const features = map.queryRenderedFeatures(e.point, { layers: [FILL_LAYER] });
        const clicked = features[0];
        onSelectRef.current(clicked ? String(clicked.properties?.id ?? clicked.id) : null);
      });

      // Konfigurasi kelas kontrol agar @mapbox/mapbox-gl-draw kompatibel dengan MapLibre GL JS.
      const drawClasses = (
        MapboxDraw as unknown as {
          constants: {
            classes: {
              CONTROL_BASE: string;
              CONTROL_PREFIX: string;
              CONTROL_GROUP: string;
            };
          };
        }
      ).constants?.classes;
      if (drawClasses) {
        drawClasses.CONTROL_BASE = "maplibregl-ctrl";
        drawClasses.CONTROL_PREFIX = "maplibregl-ctrl-";
        drawClasses.CONTROL_GROUP = "maplibregl-ctrl-group";
      }

      const baseDrawPolygon = MapboxDraw.modes?.draw_polygon;
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
          polygon: true,
          trash: true,
        },
        defaultMode: "simple_select",
        ...(baseDrawPolygon
          ? {
              modes: {
                ...MapboxDraw.modes,
                draw_polygon: {
                  ...baseDrawPolygon,
                  onSetup(options) {
                    const state = (baseDrawPolygon.onSetup?.call(this, options) ?? {}) as {
                      polygon?: {
                        id: string;
                        removeCoordinate: (path: string) => void;
                        getCoordinate: (path: string) => number[];
                        updateCoordinate: (path: string, lng: number, lat: number) => void;
                      };
                      currentVertexPosition?: number;
                    };
                    const ctxStore = (
                      this as unknown as { _ctx?: { store?: { render?: () => void } } }
                    )._ctx?.store;

                    undoDrawVertexRef.current = () => {
                      const pos = state.currentVertexPosition ?? 0;
                      if (!state.polygon || pos <= 1) {
                        drawRef.current?.deleteAll();
                        drawRef.current?.changeMode("draw_polygon");
                        return;
                      }
                      state.polygon.removeCoordinate(`0.${pos}`);
                      const nextPos = pos - 1;
                      state.currentVertexPosition = nextPos;
                      const prev = state.polygon.getCoordinate(`0.${nextPos - 1}`);
                      if (prev && prev.length >= 2) {
                        state.polygon.updateCoordinate(`0.${nextPos}`, prev[0], prev[1]);
                      }
                      ctxStore?.render?.();
                    };
                    return state;
                  },
                  onStop(state) {
                    undoDrawVertexRef.current = null;
                    baseDrawPolygon.onStop?.call(this, state);
                  },
                },
              },
            }
          : {}),
      });

      map.addControl(draw as unknown as maplibregl.IControl, "top-right");

      map.on("draw.create", (e: { features?: GeoJSON.Feature[] }) => {
        if (editingParcelIdRef.current !== null) return;
        const created = e.features?.[0];
        if (!created || created.geometry.type !== "Polygon") return;

        const geometry: GeoJSONGeometry = {
          type: "Polygon",
          coordinates: created.geometry.coordinates,
        };

        isDrawingRef.current = false;
        setIsDrawing(false);
        setHasDraftPolygon(true);
        map.getCanvas().style.cursor = "";
        onPolygonDrawnRef.current?.(geometry);
      });

      map.on("draw.update", () => {
        if (editingParcelIdRef.current === null) return;
        const first = draw.getAll().features[0];
        if (
          first &&
          (first.geometry.type === "Polygon" || first.geometry.type === "MultiPolygon")
        ) {
          setEditedGeometry({
            type: first.geometry.type,
            coordinates: first.geometry.coordinates as unknown[],
          });
          setEditGeometryError(null);
        }
      });

      map.on("draw.delete", () => {
        const remaining = draw.getAll().features.length;
        if (remaining === 0) {
          setHasDraftPolygon(false);
          if (editingParcelIdRef.current !== null) {
            setEditedGeometry(null);
          }
        }
      });

      map.on("draw.modechange", (e: { mode?: string }) => {
        const drawingActive =
          e.mode === "draw_polygon" && editingParcelIdRef.current === null;
        isDrawingRef.current = drawingActive;
        setIsDrawing(drawingActive);
        map.getCanvas().style.cursor = drawingActive ? "crosshair" : "";
      });

      drawRef.current = draw;
      setDrawReady(true);

      loadedRef.current = true;
      applyBasemapVisibility(map, basemapModeRef.current);
      applyMapData(
        map,
        dataRef.current,
        selectedIdRef.current,
        highlightedIdsRef.current,
        didFitRef,
        editingParcelIdRef.current,
      );
      applyImportPreviewData(
        map,
        importPreviewRef.current,
        Boolean(importPreviewRef.current?.length),
      );
    });

    return () => {
      loadedRef.current = false;
      setDrawReady(false);
      undoDrawVertexRef.current = null;
      if (gpsWatchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
        gpsWatchIdRef.current = null;
      }
      gpsMarkerRef.current?.remove();
      gpsMarkerRef.current = null;
      gpsHeadingElRef.current = null;
      if (gpsErrorTimerRef.current) {
        clearTimeout(gpsErrorTimerRef.current);
        gpsErrorTimerRef.current = null;
      }
      if (gpsCopyTimerRef.current) {
        clearTimeout(gpsCopyTimerRef.current);
        gpsCopyTimerRef.current = null;
      }
      if (orientationTimer) {
        clearTimeout(orientationTimer);
        orientationTimer = null;
      }
      window.removeEventListener("orientationchange", handleOrientationChange);
      resizeObserver?.disconnect();
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
      removeOverlayFromMap(map, overlayMarkersRef.current);
      if (drawRef.current) {
        try {
          map.removeControl(drawRef.current as unknown as maplibregl.IControl);
        } catch {
          /* abaikan bila map sudah dilepas */
        }
        drawRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Sinkronisasi pergantian basemap (Peta Jalan / Satelit / Hybrid) tanpa mereset layer LDKH atau Draw.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    applyBasemapVisibility(map, basemapMode);
  }, [basemapMode]);

  // Sinkronisasi opacity image overlay.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    if (map.getLayer(OVERLAY_LAYER_ID)) {
      map.setPaintProperty(OVERLAY_LAYER_ID, "raster-opacity", overlayOpacity / 100);
    }
  }, [overlayOpacity]);

  // Sinkronisasi kunci/sembunyikan 4 pin sudut overlay agar tidak mengganggu MapLibre Draw.
  useEffect(() => {
    const map = mapRef.current;
    overlayMarkersRef.current.forEach((marker) => {
      marker.setDraggable(!overlayLocked);
      marker.getElement().style.display = overlayLocked ? "none" : "flex";
    });
    if (map && loadedRef.current && map.getLayer(OVERLAY_FRAME_LAYER_ID)) {
      map.setPaintProperty(OVERLAY_FRAME_LAYER_ID, "line-opacity", overlayLocked ? 0.4 : 0.9);
    }
  }, [overlayLocked]);

  // Sinkronisasi data GeoJSON (filter tematik) ke source.
  useEffect(() => {
    const map = mapRef.current;
    if (map && loadedRef.current) {
      applyMapData(
        map,
        data,
        selectedIdRef.current,
        highlightedIdsRef.current,
        didFitRef,
        editingParcelIdRef.current,
      );
    }
  }, [data]);

  // Sinkronisasi preview poligon hasil Bulk Import & auto-zoom ke area impor.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    applyImportPreviewData(map, importPreviewFeatures, Boolean(importPreviewFeatures?.length));
  }, [importPreviewFeatures]);

  // Sinkronisasi sorotan poligon hasil AI Search (menyalakan poligon yang cocok di peta).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    syncHighlightState(map, dataRef.current, highlightedParcelIds);

    if (highlightedParcelIds && highlightedParcelIds.length && dataRef.current) {
      const matchSet = new Set(highlightedParcelIds);
      const matchedCoords = dataRef.current.features
        .filter((f) => matchSet.has(f.properties.id))
        .flatMap((f) => collectCoordinates(f.geometry));
      if (matchedCoords.length) {
        const bounds = new maplibregl.LngLatBounds(matchedCoords[0], matchedCoords[0]);
        matchedCoords.forEach((c) => bounds.extend(c));
        map.fitBounds(bounds, { padding: 100, maxZoom: 18, duration: 800 });
      }
    }
  }, [highlightedParcelIds, data]);

  // Sinkronisasi seleksi (dari klik peta maupun klik baris tabel).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) {
      selectedIdRef.current = selectedParcelId;
      return;
    }

    if (selectedIdRef.current && selectedIdRef.current !== selectedParcelId) {
      map.setFeatureState(
        { source: SOURCE_ID, id: selectedIdRef.current },
        { selected: false },
      );
    }
    selectedIdRef.current = selectedParcelId;

    if (!selectedParcelId) return;
    map.setFeatureState({ source: SOURCE_ID, id: selectedParcelId }, { selected: true });

    const feature = dataRef.current?.features.find(
      (f) => f.properties.id === selectedParcelId,
    );
    const bounds = feature ? geometryBounds(feature.geometry) : null;
    if (bounds) {
      map.fitBounds(bounds, { padding: 120, maxZoom: 18, duration: 800 });
    }
  }, [selectedParcelId]);

  const handleStartDrawing = () => {
    const draw = drawRef.current;
    if (!draw) return;
    draw.deleteAll();
    draw.changeMode("draw_polygon");
    isDrawingRef.current = true;
    setIsDrawing(true);
    setHasDraftPolygon(false);
    if (mapRef.current) {
      mapRef.current.getCanvas().style.cursor = "crosshair";
    }
  };

  const handleCancelDrawing = () => {
    const draw = drawRef.current;
    if (!draw) return;
    draw.deleteAll();
    draw.changeMode("simple_select");
    isDrawingRef.current = false;
    setIsDrawing(false);
    setHasDraftPolygon(false);
    if (mapRef.current) {
      mapRef.current.getCanvas().style.cursor = "";
    }
  };

  const handleClearDraft = () => {
    const draw = drawRef.current;
    if (!draw) return;
    draw.deleteAll();
    draw.changeMode("simple_select");
    setHasDraftPolygon(false);
  };

  const handleUndoDrawVertex = () => {
    const draw = drawRef.current;
    if (!draw || draw.getMode() !== "draw_polygon") return;
    if (undoDrawVertexRef.current) {
      undoDrawVertexRef.current();
      return;
    }
    const first = draw.getAll().features[0];
    if (
      first?.geometry.type === "Polygon" &&
      Array.isArray(first.geometry.coordinates[0]) &&
      first.geometry.coordinates[0].length <= 3
    ) {
      draw.deleteAll();
      draw.changeMode("draw_polygon");
    }
  };

  useEffect(() => {
    if (!clearDraftSignal) return;
    if (editingParcelIdRef.current !== null) return;
    drawRef.current?.deleteAll();
    drawRef.current?.changeMode("simple_select");
    setHasDraftPolygon(false);
  }, [clearDraftSignal]);

  // Sinkronisasi mode edit geometri persil ke MapLibre Draw (direct_select) & sembunyikan layer statisnya.
  useEffect(() => {
    const map = mapRef.current;
    const draw = drawRef.current;
    if (!map || !draw || !loadedRef.current || !drawReady) return;

    if (editingParcel && editingParcel.geometry) {
      editingParcelIdRef.current = editingParcel.id;
      isDrawingRef.current = false;
      setIsDrawing(false);
      setHasDraftPolygon(false);
      map.getCanvas().style.cursor = "";
      applyMapData(
        map,
        dataRef.current,
        selectedIdRef.current,
        highlightedIdsRef.current,
        didFitRef,
        editingParcel.id,
      );
      const editableGeom = populateDrawWithParcel(draw, map, editingParcel, true);
      setEditedGeometry(editableGeom);
      setEditGeometryError(null);
      return;
    }

    if (editingParcelIdRef.current !== null) {
      editingParcelIdRef.current = null;
      setEditedGeometry(null);
      setEditGeometryError(null);
      draw.deleteAll();
      draw.changeMode("simple_select");
      applyMapData(
        map,
        dataRef.current,
        selectedIdRef.current,
        highlightedIdsRef.current,
        didFitRef,
        null,
      );
    }
  }, [editingParcel, drawReady]);

  const handleResetEditGeometry = () => {
    if (!editingParcel || !drawRef.current || !mapRef.current) return;
    const editableGeom = populateDrawWithParcel(
      drawRef.current,
      mapRef.current,
      editingParcel,
      false,
    );
    setEditedGeometry(editableGeom);
    setEditGeometryError(null);
  };

  const handleSaveEditGeometry = async () => {
    if (!editingParcel || !onSaveEditedGeometry) return;
    const first = drawRef.current?.getAll().features[0];
    let latestGeom: GeoJSONGeometry | null = null;
    if (
      first &&
      (first.geometry.type === "Polygon" || first.geometry.type === "MultiPolygon")
    ) {
      latestGeom = {
        type: first.geometry.type,
        coordinates: first.geometry.coordinates as unknown[],
      };
    } else if (editedGeometry) {
      latestGeom = editedGeometry;
    }

    if (!latestGeom) {
      setEditGeometryError(
        "Poligon tidak ditemukan. Klik 'Reset Titik' untuk memulihkan poligon.",
      );
      return;
    }

    setSavingGeometry(true);
    setEditGeometryError(null);
    try {
      await onSaveEditedGeometry(editingParcel.id, latestGeom);
    } catch (err) {
      setEditGeometryError((err as Error).message);
    } finally {
      setSavingGeometry(false);
    }
  };

  const handleCancelEditGeometry = () => {
    if (savingGeometry) return;
    drawRef.current?.deleteAll();
    drawRef.current?.changeMode("simple_select");
    setEditedGeometry(null);
    setEditGeometryError(null);
    onCancelEditGeometry?.();
  };

  const mountOverlayMarkers = (
    map: MapLibreMap,
    corners: OverlayCorners,
    locked: boolean,
  ) => {
    clearOverlayMarkers(overlayMarkersRef.current);
    overlayMarkersRef.current = corners.map((lngLat, idx) => {
      const el = createCornerMarkerElement(CORNER_LABELS[idx], CORNER_TITLES[idx]);
      el.style.display = locked ? "none" : "flex";

      const marker = new maplibregl.Marker({
        element: el,
        draggable: !locked,
      })
        .setLngLat(lngLat)
        .addTo(map);

      marker.on("drag", () => {
        const current = overlayCornersRef.current;
        if (!current) return;
        const pos = marker.getLngLat();
        const next: OverlayCorners = [...current] as OverlayCorners;
        next[idx] = [pos.lng, pos.lat];
        overlayCornersRef.current = next;

        const imgSource = map.getSource(OVERLAY_SOURCE_ID) as ImageSource | undefined;
        imgSource?.setCoordinates(next);

        const frameSource = map.getSource(OVERLAY_FRAME_SOURCE_ID) as GeoJSONSource | undefined;
        frameSource?.setData(buildOverlayFrameFeatureCollection(next));
      });

      marker.on("dragend", () => {
        if (overlayCornersRef.current) {
          setOverlayCorners([...overlayCornersRef.current] as OverlayCorners);
        }
      });

      return marker;
    });
  };

  const handleOpenOverlayPicker = () => {
    overlayFileInputRef.current?.click();
  };

  const handleOverlayFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const map = mapRef.current;
    if (!map || !loadedRef.current) {
      setOverlayError("Peta belum siap. Tunggu sebentar lalu coba lagi.");
      return;
    }

    setOverlayLoading(true);
    setOverlayError(null);
    try {
      const image = await loadOverlayFile(file);
      const initialCorners = computeInitialOverlayCorners(map, image.width, image.height);
      overlayCornersRef.current = initialCorners;
      syncOverlaySourcesOnMap(map, image, initialCorners, overlayOpacityRef.current, false);
      mountOverlayMarkers(map, initialCorners, false);
      setOverlayImage(image);
      setOverlayCorners(initialCorners);
      setOverlayLocked(false);
      setOverlayPanelMinimized(false);
    } catch (err) {
      setOverlayError((err as Error).message || "Gagal memuat gambar overlay.");
    } finally {
      setOverlayLoading(false);
    }
  };

  const handleRecenterOverlay = () => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !overlayImage) return;
    const nextCorners = computeInitialOverlayCorners(map, overlayImage.width, overlayImage.height);
    overlayCornersRef.current = nextCorners;
    setOverlayCorners(nextCorners);

    const imgSource = map.getSource(OVERLAY_SOURCE_ID) as ImageSource | undefined;
    imgSource?.setCoordinates(nextCorners);

    const frameSource = map.getSource(OVERLAY_FRAME_SOURCE_ID) as GeoJSONSource | undefined;
    frameSource?.setData(buildOverlayFrameFeatureCollection(nextCorners));

    overlayMarkersRef.current.forEach((marker, idx) => {
      marker.setLngLat(nextCorners[idx]);
    });
  };

  const handleCopyGcp = async () => {
    const activeCorners = overlayCornersRef.current ?? overlayCorners;
    if (!overlayImage || !activeCorners) return;
    try {
      const jsonText = buildGcpJsonPayload(overlayImage, activeCorners);
      await copyTextToClipboard(jsonText);
      setCopiedGcp(true);
      setOverlayError(null);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedGcp(false), 2200);
    } catch (err) {
      setOverlayError((err as Error).message || "Gagal menyalin koordinat GCP ke clipboard.");
    }
  };

  const handleCloseOverlay = () => {
    removeOverlayFromMap(mapRef.current, overlayMarkersRef.current);
    overlayCornersRef.current = null;
    setOverlayImage(null);
    setOverlayCorners(null);
    setOverlayLocked(false);
    setOverlayPanelMinimized(false);
    setOverlayError(null);
    setCopiedGcp(false);
  };

  const showGpsErrorToast = (message: string) => {
    setGpsError(message);
    if (gpsErrorTimerRef.current) clearTimeout(gpsErrorTimerRef.current);
    gpsErrorTimerRef.current = setTimeout(() => {
      setGpsError(null);
    }, 6000);
  };

  const stopGpsTracking = () => {
    if (gpsWatchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
    gpsMarkerRef.current?.remove();
    gpsMarkerRef.current = null;
    gpsHeadingElRef.current = null;
    gpsPositionRef.current = null;
    gpsFollowRef.current = true;
    gpsFirstFixRef.current = false;

    const map = mapRef.current;
    if (map && loadedRef.current) {
      const accSource = map.getSource(GPS_ACCURACY_SOURCE_ID) as GeoJSONSource | undefined;
      accSource?.setData(EMPTY_FEATURE_COLLECTION);
    }

    setGpsState("idle");
    setGpsPosition(null);
    setGpsFollow(true);
    setCopiedGpsCoord(false);
  };

  const startGpsTracking = () => {
    if (typeof window === "undefined" || typeof navigator === "undefined" || !("geolocation" in navigator)) {
      showGpsErrorToast(
        "Fitur Live GPS tidak didukung pada browser ini.",
      );
      return;
    }

    const isLoopback =
      window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (!window.isSecureContext && !isLoopback) {
      showGpsErrorToast(
        "Fitur Live GPS membutuhkan koneksi HTTPS yang aman atau browser yang mendukung Geolocation.",
      );
      return;
    }

    if (gpsWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }

    setGpsError(null);
    setGpsState("locating");
    gpsFollowRef.current = true;
    setGpsFollow(true);
    gpsFirstFixRef.current = true;

    gpsWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lng = pos.coords.longitude;
        const lat = pos.coords.latitude;
        const accuracy =
          typeof pos.coords.accuracy === "number" && Number.isFinite(pos.coords.accuracy)
            ? pos.coords.accuracy
            : 10;
        const heading =
          pos.coords.heading !== null &&
          typeof pos.coords.heading === "number" &&
          Number.isFinite(pos.coords.heading)
            ? pos.coords.heading
            : null;

        const nextPosition: GpsPosition = { lng, lat, accuracy, heading };
        gpsPositionRef.current = nextPosition;
        setGpsState("tracking");
        setGpsPosition(nextPosition);

        const map = mapRef.current;
        if (!map) return;

        if (!gpsMarkerRef.current) {
          const { container, headingEl } = createGpsUserMarkerElements();
          gpsHeadingElRef.current = headingEl;
          gpsMarkerRef.current = new maplibregl.Marker({
            element: container,
            anchor: "center",
          })
            .setLngLat([lng, lat])
            .addTo(map);
        } else {
          gpsMarkerRef.current.setLngLat([lng, lat]);
        }

        if (gpsHeadingElRef.current) {
          if (heading !== null) {
            gpsHeadingElRef.current.style.display = "flex";
            gpsHeadingElRef.current.style.transform = `rotate(${heading}deg)`;
          } else {
            gpsHeadingElRef.current.style.display = "none";
          }
        }

        if (loadedRef.current) {
          const accSource = map.getSource(GPS_ACCURACY_SOURCE_ID) as GeoJSONSource | undefined;
          accSource?.setData(buildAccuracyCircleGeoJSON(lng, lat, accuracy));
        }

        if (gpsFirstFixRef.current) {
          gpsFirstFixRef.current = false;
          map.flyTo({
            center: [lng, lat],
            zoom: Math.max(map.getZoom(), 18),
            duration: 900,
          });
        } else if (gpsFollowRef.current) {
          map.easeTo({
            center: [lng, lat],
            duration: 450,
          });
        }
      },
      (err) => {
        let message = "Gagal membaca posisi GPS perangkat Anda.";
        if (err.code === 1) {
          message =
            "Izin akses lokasi (GPS) ditolak. Aktifkan izin lokasi di pengaturan browser/perangkat Anda.";
        } else if (err.code === 2) {
          message =
            "Sinyal GPS lemah atau posisi tidak tersedia. Pastikan GPS aktif di area terbuka.";
        } else if (err.code === 3) {
          message =
            "Waktu pencarian sinyal GPS habis. Silakan coba lagi di area dengan sinyal lebih baik.";
        }
        stopGpsTracking();
        showGpsErrorToast(message);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  };

  const handleGpsButtonClick = () => {
    if (gpsState === "idle") {
      startGpsTracking();
      return;
    }
    if (gpsState === "locating") {
      stopGpsTracking();
      return;
    }
    if (!gpsFollowRef.current && gpsPosition && mapRef.current) {
      gpsFollowRef.current = true;
      setGpsFollow(true);
      mapRef.current.flyTo({
        center: [gpsPosition.lng, gpsPosition.lat],
        zoom: Math.max(mapRef.current.getZoom(), 18),
        duration: 700,
      });
      return;
    }
    stopGpsTracking();
  };

  const handleCopyGpsCoordinates = async () => {
    if (!gpsPosition) return;
    const formatted = `${gpsPosition.lat.toFixed(6)}, ${gpsPosition.lng.toFixed(6)}`;
    try {
      await copyTextToClipboard(formatted);
      setCopiedGpsCoord(true);
      if (gpsCopyTimerRef.current) clearTimeout(gpsCopyTimerRef.current);
      gpsCopyTimerRef.current = setTimeout(() => setCopiedGpsCoord(false), 2200);
    } catch (err) {
      showGpsErrorToast((err as Error).message || "Gagal menyalin koordinat GPS ke clipboard.");
    }
  };

  const matchedGpsParcel = useMemo<ParcelFeature | null>(() => {
    if (!gpsPosition) return null;
    const merged = new Map<string, ParcelFeature>();
    for (const f of allParcels?.features ?? []) {
      merged.set(f.properties.id, f);
    }
    for (const f of data?.features ?? []) {
      merged.set(f.properties.id, f);
    }
    const pt = {
      type: "Point" as const,
      coordinates: [gpsPosition.lng, gpsPosition.lat],
    };
    for (const feature of Array.from(merged.values())) {
      const geom = feature.geometry;
      if (!geom || (geom.type !== "Polygon" && geom.type !== "MultiPolygon")) {
        continue;
      }
      try {
        if (
          booleanPointInPolygon(
            pt,
            geom as unknown as GeoJSON.Polygon | GeoJSON.MultiPolygon,
          )
        ) {
          return feature;
        }
      } catch {
        /* abaikan geometri yang tidak valid */
      }
    }
    return null;
  }, [gpsPosition, data, allParcels]);

  const liveEditAreaM2 = computeGeometryAreaM2(editedGeometry);
  const docAreaM2 = toNumber(editingParcel?.area_m2);
  const liveDeltaM2 =
    liveEditAreaM2 !== null && docAreaM2 !== null
      ? Math.round((docAreaM2 - liveEditAreaM2) * 100) / 100
      : null;

  return (
    <div
      className={`ldkh-map-canvas relative h-full w-full ${
        isFocusMode ? "ldkh-map-focus" : ""
      }`}
    >
      <div ref={containerRef} className="h-full w-full" />

      {isAdmin && (
        <input
          ref={overlayFileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
          className="hidden"
          onChange={handleOverlayFileChange}
        />
      )}

      {/* Toolbar kiri-atas + floating panel Overlay Peta */}
      <div
        className={`pointer-events-none top-safe absolute left-3 right-14 z-10 flex flex-col items-start gap-2 ${
          !isFocusMode && overlayImage ? "mt-[5.25rem] md:mt-0" : ""
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {editingParcel ? (
            <div className="pointer-events-auto flex max-w-full flex-col gap-2 rounded-xl border border-emerald-200 bg-white/95 p-3 shadow-lg backdrop-blur-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    <Pentagon className="h-3.5 w-3.5 text-emerald-600" />
                    Mode Edit Peta:{" "}
                    <span className="font-mono text-emerald-700">{editingParcel.parcel_code}</span>
                  </p>
                  <p className="hidden text-[11px] text-slate-500 sm:block">
                    Geser titik sudut untuk mengubah batas, klik titik tengah untuk menambah sudut, atau
                    tekan Delete untuk menghapus titik terpilih.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                      Estimasi Luas GIS:{" "}
                    </span>
                    <span className="font-semibold tabular-nums text-slate-900">
                      {formatArea(liveEditAreaM2)}
                    </span>
                    {liveDeltaM2 !== null && (
                      <span
                        className={`ml-1.5 font-medium tabular-nums ${
                          Math.abs(liveDeltaM2) > 0.5 ? "text-amber-600" : "text-slate-500"
                        }`}
                      >
                        (Δ {formatArea(liveDeltaM2)})
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={savingGeometry}
                    onClick={handleResetEditGeometry}
                    className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
                    title="Kembalikan poligon ke bentuk awal sebelum diedit"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset Titik
                  </button>
                  <button
                    type="button"
                    disabled={savingGeometry}
                    onClick={handleCancelEditGeometry}
                    className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={savingGeometry || !editedGeometry}
                    onClick={handleSaveEditGeometry}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingGeometry ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    {savingGeometry ? "Menyimpan..." : "Simpan Perubahan Peta"}
                  </button>
                </div>
              </div>
              {editGeometryError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-700">
                  Gagal menyimpan perubahan peta: {editGeometryError}
                </p>
              )}
            </div>
          ) : !isDrawing ? (
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              {canEdit && (
                <button
                  type="button"
                  disabled={!drawReady}
                  onClick={handleStartDrawing}
                  className="pointer-events-auto inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-md transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Pentagon className="h-4 w-4" />
                  Tambah Lokasi Tanah
                </button>
              )}

              {isAdmin && (
                <button
                  type="button"
                  disabled={overlayLoading}
                  onClick={handleOpenOverlayPicker}
                  className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold shadow-md transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    overlayImage
                      ? "border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100"
                      : "border-slate-200 bg-white/95 text-slate-700 hover:bg-slate-50"
                  }`}
                  title="Unggah gambar peta situasi (PNG, JPG, WEBP, atau PDF halaman 1) untuk dijiplak di atas citra satelit"
                >
                  {overlayLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
                  ) : (
                    <ImagePlus className="h-4 w-4 text-sky-600" />
                  )}
                  {overlayLoading
                    ? "Memproses Overlay..."
                    : overlayImage
                      ? "Ganti Overlay Peta"
                      : "Overlay Peta"}
                </button>
              )}

              {isAdmin && onOpenImportModal && (
                <button
                  type="button"
                  onClick={onOpenImportModal}
                  className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold shadow-md transition-colors ${
                    importPreviewFeatures?.length
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                      : "border-slate-200 bg-white/95 text-slate-700 hover:bg-slate-50"
                  }`}
                  title="Impor massal poligon bidang tanah dari GeoJSON, KML, atau KMZ"
                >
                  <FileUp className="h-4 w-4 text-indigo-600" />
                  Import Peta
                </button>
              )}

              {hasDraftPolygon && (
                <button
                  type="button"
                  onClick={handleClearDraft}
                  className="pointer-events-auto inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-2 text-xs font-medium text-red-600 shadow-md transition-colors hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Hapus Draft Poligon
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <div className="pointer-events-auto rounded-lg border border-blue-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-md backdrop-blur-sm">
                <span className="hidden sm:inline">
                  Klik titik sudut batas tanah di peta, lalu klik titik awal atau klik dua kali untuk menutup poligon
                </span>
                <span className="sm:hidden">
                  Ketuk peta untuk tambah sudut, ketuk 2x untuk selesai
                </span>
              </div>
              <button
                type="button"
                onClick={handleUndoDrawVertex}
                className="pointer-events-auto inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-medium text-blue-700 shadow-md transition-colors hover:bg-blue-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Undo Titik
              </button>
              <button
                type="button"
                onClick={handleCancelDrawing}
                className="pointer-events-auto inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-md transition-colors hover:bg-slate-50"
              >
                <X className="h-3.5 w-3.5" />
                Batal
              </button>
            </div>
          )}
        </div>

        {isAdmin && overlayError && (
          <div className="pointer-events-auto flex max-w-md items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50/95 px-3 py-1.5 text-[11px] font-medium text-red-700 shadow-md backdrop-blur-sm">
            <span>{overlayError}</span>
            <button
              type="button"
              onClick={() => setOverlayError(null)}
              className="rounded p-0.5 text-red-500 hover:bg-red-100 hover:text-red-700"
              aria-label="Tutup pesan error overlay"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {isAdmin && overlayImage && (
          <div className="pointer-events-auto w-80 max-w-full rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-lg backdrop-blur-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <ImagePlus className="h-3.5 w-3.5 shrink-0 text-sky-600" />
                  <span>Overlay Peta (Jiplak)</span>
                </p>
                <p className="mt-0.5 truncate text-[11px] text-slate-500" title={overlayImage.fileName}>
                  {overlayImage.fileName} · {overlayImage.width}×{overlayImage.height} px
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setOverlayPanelMinimized((prev) => !prev)}
                  className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  title={overlayPanelMinimized ? "Perluas panel overlay" : "Perkecil panel overlay"}
                >
                  {overlayPanelMinimized ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronUp className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleCloseOverlay}
                  className="rounded-md p-1 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
                  title="Tutup / Hapus Overlay"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {!overlayPanelMinimized && (
              <div className="mt-2.5 space-y-2.5 border-t border-slate-100 pt-2.5">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-slate-700">Opacity Overlay</span>
                    <span className="font-mono font-semibold tabular-nums text-sky-700">
                      {overlayOpacity}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={1}
                    value={overlayOpacity}
                    onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                    className="h-1.5 w-full cursor-pointer accent-sky-600"
                    aria-label="Opacity Overlay"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setOverlayLocked((prev) => !prev)}
                    className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                      overlayLocked
                        ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                    title="Sembunyikan 4 marker sudut agar tidak mengganggu saat menggambar poligon"
                  >
                    {overlayLocked ? (
                      <LockOpen className="h-3.5 w-3.5" />
                    ) : (
                      <Lock className="h-3.5 w-3.5" />
                    )}
                    {overlayLocked ? "Buka Kunci Overlay" : "Kunci Overlay"}
                  </button>

                  <button
                    type="button"
                    onClick={handleRecenterOverlay}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-50"
                    title="Tengahkan ulang 4 sudut overlay ke viewport peta saat ini"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Tengahkan
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyGcp}
                    className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                      copiedGcp
                        ? "bg-emerald-600 text-white"
                        : "bg-sky-600 text-white hover:bg-sky-700"
                    }`}
                  >
                    {copiedGcp ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copiedGcp ? "Koordinat GCP Tersalin!" : "Salin 4 Koordinat GCP (JSON)"}
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={overlayLoading}
                      onClick={handleOpenOverlayPicker}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
                    >
                      Ganti File
                    </button>
                    <button
                      type="button"
                      onClick={handleCloseOverlay}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700 transition-colors hover:bg-red-100"
                    >
                      Tutup / Hapus Overlay
                    </button>
                  </div>
                </div>

                <p className="text-[10px] leading-relaxed text-slate-500">
                  {overlayLocked
                    ? "Marker sudut disembunyikan. Anda dapat menggambar poligon dengan bebas di atas overlay."
                    : "Geser 4 pin sudut (TL, TR, BR, BL) hingga menempel presisi di atas citra satelit."}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast error izin / sinyal GPS berbahasa Indonesia */}
      {gpsError && (
        <div
          role="alert"
          className="pointer-events-auto absolute left-3 right-3 top-[calc(env(safe-area-inset-top,0px)+6.5rem)] z-30 mx-auto flex max-w-md items-start gap-2 rounded-xl border border-red-200 bg-red-50/95 px-3 py-2 text-xs font-medium text-red-700 shadow-lg backdrop-blur-sm md:left-1/2 md:right-auto md:top-16 md:-translate-x-1/2"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <span className="flex-1">{gpsError}</span>
          <button
            type="button"
            onClick={() => setGpsError(null)}
            className="rounded p-0.5 text-red-500 hover:bg-red-100 hover:text-red-700"
            aria-label="Tutup pesan error GPS"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Indikator Live GPS Lapangan: akurasi + deteksi Point-in-Polygon + salin koordinat */}
      {gpsState === "tracking" && gpsPosition && (
        <div
          className={`pointer-events-auto absolute left-3 right-16 z-10 flex max-w-md flex-wrap items-center gap-1.5 md:right-auto md:bottom-[5.5rem] ${
            isFocusMode
              ? "bottom-[calc(env(safe-area-inset-bottom,0px)+5.25rem)]"
              : "bottom-[calc(env(safe-area-inset-bottom,0px)+14.5dvh+5.35rem)]"
          }`}
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-white/95 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-blue-700 shadow-md backdrop-blur-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-blue-600" />
            GPS ±{Math.max(1, Math.round(gpsPosition.accuracy))} m
          </span>

          {matchedGpsParcel ? (
            <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-emerald-400 bg-emerald-600 p-0.5 pl-2.5 text-[11px] font-semibold text-white shadow-md">
              <button
                type="button"
                onClick={() => onSelectParcel(matchedGpsParcel.properties.id)}
                className="inline-flex min-h-[28px] items-center gap-1 rounded-full pr-1.5 text-left hover:underline"
                title="Klik untuk membuka detail persil"
              >
                <span>
                  Di dalam persil:{" "}
                  <span className="font-mono font-bold">
                    {matchedGpsParcel.properties.parcel_code}
                  </span>
                </span>
              </button>
              {matchedGpsParcel.properties.primary_document_id && onOpenDocument && (
                <button
                  type="button"
                  onClick={() =>
                    onOpenDocument(matchedGpsParcel.properties.primary_document_id!)
                  }
                  className="inline-flex min-h-[28px] items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white transition-colors hover:bg-white/30"
                  title="Buka dokumen PDF utama persil ini"
                >
                  <FileText className="h-3 w-3" />
                  Lihat PDF
                </button>
              )}
            </div>
          ) : (
            <div className="inline-flex flex-wrap items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/95 py-0.5 pl-2.5 pr-1 text-[11px] text-slate-700 shadow-md backdrop-blur-sm">
              <Navigation className="h-3 w-3 shrink-0 text-slate-400" />
              <span className="font-mono tabular-nums">
                {gpsPosition.lat.toFixed(6)}, {gpsPosition.lng.toFixed(6)}
              </span>
              <button
                type="button"
                onClick={handleCopyGpsCoordinates}
                className={`inline-flex min-h-[28px] items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                  copiedGpsCoord
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {copiedGpsCoord ? (
                  <>
                    <Check className="h-3 w-3" />
                    Tersalin!
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Salin Koordinat
                  </>
                )}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={stopGpsTracking}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-500 shadow-md backdrop-blur-sm hover:bg-red-50 hover:text-red-600"
            title="Matikan pelacakan GPS"
            aria-label="Matikan pelacakan GPS"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Kontrol sudut kanan-bawah: Mobile Admin FAB "+" + Tombol Live GPS "Lokasi Saya" */}
      <div
        className={`ldkh-map-bottom-right pointer-events-none absolute right-3 z-20 flex flex-col items-end gap-2.5 md:bottom-10 ${
          isFocusMode
            ? "bottom-[calc(env(safe-area-inset-bottom,0px)+2.25rem)]"
            : "bottom-[calc(env(safe-area-inset-bottom,0px)+14.5dvh+2.5rem)]"
        }`}
      >
        {!isFocusMode && (canEdit || isAdmin || hasDraftPolygon) && (
          <div className="flex flex-col items-end gap-2 md:hidden">
            {mobileFabOpen && (
              <div className="pointer-events-auto flex flex-col items-end gap-2">
                {hasDraftPolygon && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileFabOpen(false);
                      handleClearDraft();
                    }}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-red-200 bg-white/95 px-3.5 py-2 text-xs font-semibold text-red-600 shadow-lg backdrop-blur-sm active:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Hapus Draft Poligon
                  </button>
                )}
                {isAdmin && onOpenImportModal && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileFabOpen(false);
                      onOpenImportModal();
                    }}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3.5 py-2 text-xs font-semibold text-slate-800 shadow-lg backdrop-blur-sm active:bg-slate-50"
                  >
                    <FileUp className="h-4 w-4 text-indigo-600" />
                    Import Peta
                  </button>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    disabled={overlayLoading}
                    onClick={() => {
                      setMobileFabOpen(false);
                      handleOpenOverlayPicker();
                    }}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3.5 py-2 text-xs font-semibold text-slate-800 shadow-lg backdrop-blur-sm active:bg-slate-50 disabled:opacity-60"
                  >
                    {overlayLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
                    ) : (
                      <ImagePlus className="h-4 w-4 text-sky-600" />
                    )}
                    {overlayLoading
                      ? "Memproses Overlay..."
                      : overlayImage
                        ? "Ganti Overlay Peta"
                        : "Overlay Peta"}
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    disabled={!drawReady}
                    onClick={() => {
                      setMobileFabOpen(false);
                      handleStartDrawing();
                    }}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg active:bg-blue-700 disabled:opacity-50"
                  >
                    <Pentagon className="h-4 w-4" />
                    Tambah Lokasi Tanah
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setMobileFabOpen((prev) => !prev)}
              aria-label={mobileFabOpen ? "Tutup menu aksi peta" : "Buka menu aksi peta"}
              aria-expanded={mobileFabOpen}
              className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-transform active:scale-95"
            >
              <Plus
                className={`h-6 w-6 transition-transform duration-200 ${
                  mobileFabOpen ? "rotate-45" : ""
                }`}
              />
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={handleGpsButtonClick}
          aria-pressed={gpsState === "tracking"}
          aria-label={
            gpsState === "idle"
              ? "Aktifkan Lokasi Saya (Live GPS)"
              : gpsState === "locating"
                ? "Mencari sinyal GPS"
                : gpsFollow
                  ? "Matikan Lokasi Saya"
                  : "Pusatkan ke Lokasi Saya"
          }
          title={
            gpsState === "idle"
              ? "Lokasi Saya (Live GPS)"
              : gpsState === "locating"
                ? "Mencari sinyal GPS..."
                : gpsFollow
                  ? "Tracking aktif — klik untuk matikan GPS"
                  : "Klik untuk pusatkan ulang ke Lokasi Saya"
          }
          className={`pointer-events-auto flex h-11 w-11 items-center justify-center rounded-xl border shadow-lg transition-all active:scale-95 ${
            gpsState === "tracking"
              ? gpsFollow
                ? "border-blue-600 bg-blue-600 text-white ring-4 ring-blue-500/25"
                : "border-blue-400 bg-blue-50 text-blue-600 ring-2 ring-blue-500/20"
              : gpsState === "locating"
                ? "border-blue-200 bg-white/95 text-blue-600"
                : "border-slate-200/90 bg-white/95 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          {gpsState === "locating" ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : gpsState === "tracking" ? (
            <LocateFixed className="h-5 w-5" />
          ) : (
            <Crosshair className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Basemap Switcher di sudut kiri-bawah (di atas ScaleControl) */}
      <div
        role="group"
        aria-label="Pilih gaya peta dasar"
        className={`absolute left-3 z-10 inline-flex items-center gap-1 rounded-xl border border-slate-200/90 bg-white/95 p-1 shadow-md backdrop-blur-sm md:bottom-10 ${
          isFocusMode
            ? "bottom-[calc(env(safe-area-inset-bottom,0px)+2.25rem)]"
            : "bottom-[calc(env(safe-area-inset-bottom,0px)+14.5dvh+2.5rem)]"
        }`}
      >
        {BASEMAP_OPTIONS.map(({ id, label, Icon }) => {
          const active = basemapMode === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setBasemapMode(id)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors sm:gap-1.5 sm:px-2.5 sm:text-xs ${
                active
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
