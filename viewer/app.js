const sampleTourUrl = '../shared/sample-tour.json';
const fallbackProject = {
  settings: {
    mouseViewMode: 'drag',
    autorotateEnabled: false,
    fullscreenButton: true,
    gyroEnabled: false,
    vrEnabled: true
  },
  homePage: {},
  scenes: [],
  assets: { media: [] },
  activeGroupId: null,
  groups: [],
  minimap: { floorplans: [] }
};

const panoElement = document.getElementById('pano');
const viewerShell = document.querySelector('.viewer-shell');
const viewerHeader = document.querySelector('.viewer-header');
const licenseFooter = document.querySelector('.license-footer');
const panoLeft = document.getElementById('pano-left');
const panoRight = document.getElementById('pano-right');
const sceneList = document.getElementById('scene-list');
const groupSelect = document.getElementById('group-select');
const groupListMobile = document.getElementById('group-list-mobile');
const floorplanStage = document.getElementById('floorplan-stage');
const floorplanImage = document.getElementById('floorplan-image');
const floorplanMarkers = document.getElementById('floorplan-markers');
const floorplanEmpty = document.getElementById('floorplan-empty');
const floorplanPanel = document.getElementById('floorplan-panel');
const sidePanel = document.querySelector('.side-panel');
const floorplanWrap = floorplanPanel?.querySelector('.floorplan-wrap');
const btnFloorplanZoomOut = document.getElementById('btn-floorplan-zoom-out');
const btnFloorplanZoomIn = document.getElementById('btn-floorplan-zoom-in');
const btnFloorplanZoomReset = document.getElementById('btn-floorplan-zoom-reset');
const btnFloorplanExpand = document.getElementById('btn-floorplan-expand');
const btnFloorplanMobileClose = document.getElementById('btn-floorplan-mobile-close');
const floorplanZoomValue = document.getElementById('floorplan-zoom-value');
const btnMobileGroups = document.getElementById('btn-mobile-groups');
const btnMobileScenes = document.getElementById('btn-mobile-scenes');
const btnMobileMap = document.getElementById('btn-mobile-map');
const btnMobilePanelClose = document.getElementById('btn-mobile-panel-close');
const mobilePanelTitle = document.getElementById('mobile-panel-title');
const mobilePanelBackdrop = document.getElementById('mobile-panel-backdrop');
const orientationLockOverlay = document.getElementById('orientation-lock-overlay');
const homePageOverlay = document.getElementById('home-page-overlay');
const homePageFrame = document.getElementById('home-page-frame');
const homePageBody = document.getElementById('home-page-body');
const btnHomePageStart = document.getElementById('btn-home-page-start');
const modal = document.getElementById('hotspot-modal');
const modalContent = modal?.querySelector('.modal-content');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const sceneLinkTooltip = document.getElementById('scene-link-tooltip');
const btnHomeToggle = document.getElementById('btn-home-toggle');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnFullscreenExit = document.getElementById('btn-fullscreen-exit');
const btnGyro = document.getElementById('btn-gyro');
const btnReset = document.getElementById('btn-reset-orientation');
const btnVr = document.getElementById('btn-vr');

let viewer = null;
let activeViewer = null;
let vrViewers = null;
let scenes = [];
let currentScene = null;
let projectData = null;
let activeGroupId = null;
let homePageVisible = false;

const FLOORPLAN_COLOR_MAP = {
  yellow: '#f0c84b',
  red: '#ef4444',
  cyan: '#22d3ee',
  lightgreen: '#86efac',
  magenta: '#f472b6',
  white: '#ffffff',
  black: '#111111'
};
const TEXT_ALIGN_VALUES = new Set(['left', 'center', 'right', 'justify']);
const DEFAULT_INFO_FRAME_WIDTH = 920;
const DEFAULT_INFO_FRAME_HEIGHT = 460;
const DEFAULT_INFO_FRAME_LEFT = 320;
const DEFAULT_INFO_FRAME_TOP = 112;
const MIN_INFO_FRAME_WIDTH = 44;
const MAX_INFO_FRAME_WIDTH = 2400;
const MIN_INFO_FRAME_HEIGHT = 30;
const MAX_INFO_FRAME_HEIGHT = 1800;
const DEFAULT_INFO_FRAME_VIEWPORT_WIDTH = 1366;
const DEFAULT_INFO_FRAME_VIEWPORT_HEIGHT = 768;
const DEFAULT_INFO_BG_COLOR_KEY = 'black';
const DEFAULT_INFO_BG_TRANSPARENCY = 0;
const DEFAULT_INFO_FRAME_HOTSPOT_OFFSET_X = 0;
const DEFAULT_INFO_FRAME_HOTSPOT_OFFSET_Y = 10;
const DEFAULT_INFO_HOTSPOT_DISPLAY_MODE = 'click';
const FLOORPLAN_MIN_ZOOM = 0.1;
const FLOORPLAN_MAX_ZOOM = 4;
const MOBILE_SCENE_MAX_FOV_RATIO = 4.0;
let lastMobileViewerLayout = false;
let lastMobileSceneLimiterMode = false;

function normalizeTextAlign(value) {
  const candidate = String(value || 'left').trim().toLowerCase();
  return TEXT_ALIGN_VALUES.has(candidate) ? candidate : 'left';
}

function normalizeInfoHotspotDisplayMode(value) {
  return String(value || '').trim().toLowerCase() === 'quick' ? 'quick' : 'click';
}

function isMobileViewerLayout() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 900px)').matches;
}

let runtimePanels = null;
const runtimeUi = window.IterpanoRuntimeUi.createViewerRuntimeUi({
  viewerHeader,
  licenseFooter,
  orientationLockOverlay,
  btnFullscreen,
  btnFullscreenExit,
  viewerShell,
  panoElement,
  isMobileViewerLayout,
  onOrientationLock() {
    runtimePanels?.close();
    runtimeHotspots.hideSceneLinkTooltip();
    if (modal?.classList.contains('visible')) {
      runtimeHotspots.closeModal();
    }
  },
  onFullscreenUnavailable() {
    runtimeHotspots.openModal({
      title: 'Fullscreen',
      contentBlocks: [
        { type: 'text', value: 'Fullscreen is not available in this mobile browser. Try Chrome or open the tour outside the in-app browser.' }
      ]
    });
  },
  onAfterFullscreenToggle() {
    requestAnimationFrame(refreshViewerLayout);
  },
});

const runtimeGyro = window.IterpanoRuntimeGyro.createViewerGyroController({
  btnGyro,
  getActiveViewer: () => activeViewer,
  getCurrentScene: () => currentScene,
});

const runtimeFloorplan = window.IterpanoRuntimeFloorplan.createViewerFloorplanController({
  floorplanStage,
  floorplanImage,
  floorplanMarkers,
  floorplanEmpty,
  floorplanPanel,
  floorplanWrap,
  btnFloorplanZoomOut,
  btnFloorplanZoomIn,
  btnFloorplanZoomReset,
  btnFloorplanExpand,
  floorplanZoomValue,
  floorplanColorMap: FLOORPLAN_COLOR_MAP,
  floorplanMinZoom: FLOORPLAN_MIN_ZOOM,
  floorplanMaxZoom: FLOORPLAN_MAX_ZOOM,
  getActiveGroupId: () => activeGroupId,
  getCurrentScene: () => currentScene,
  isMobileViewerLayout,
  findSceneRuntimeById,
  onSelectScene: (targetScene) => switchScene(targetScene, { syncGroup: false }),
  normalizeFloorplanColorKey,
  darkenHex,
  withAlpha,
});

runtimePanels = window.IterpanoRuntimeMobilePanels.createViewerMobilePanelsController({
  btnMobileGroups,
  btnMobileScenes,
  btnMobileMap,
  btnMobilePanelClose,
  btnFloorplanMobileClose,
  mobilePanelTitle,
  mobilePanelBackdrop,
  sidePanel,
  isMobileViewerLayout,
  isOrientationLocked: () => runtimeUi.isOrientationLocked(),
  onRefreshLayout: refreshViewerLayout,
  onMapOpen: resetFloorplanView,
});

const runtimeHotspots = window.IterpanoRuntimeHotspots.createViewerHotspotsController({
  modal,
  modalContent,
  modalTitle,
  modalBody,
  closeModalButton: document.getElementById('btn-close-modal'),
  sceneLinkTooltip,
  floorplanColorMap: FLOORPLAN_COLOR_MAP,
  defaultInfoBgColorKey: DEFAULT_INFO_BG_COLOR_KEY,
  defaultInfoFrameLeft: DEFAULT_INFO_FRAME_LEFT,
  defaultInfoFrameTop: DEFAULT_INFO_FRAME_TOP,
  defaultInfoFrameHotspotOffsetX: DEFAULT_INFO_FRAME_HOTSPOT_OFFSET_X,
  defaultInfoFrameHotspotOffsetY: DEFAULT_INFO_FRAME_HOTSPOT_OFFSET_Y,
  minInfoFrameWidth: MIN_INFO_FRAME_WIDTH,
  minInfoFrameHeight: MIN_INFO_FRAME_HEIGHT,
  getProjectData: () => projectData,
  findSceneRuntimeById,
  switchScene,
  normalizeFloorplanColorKey,
  normalizeInfoHotspotDisplayMode,
  normalizeInfoFrameAnchorOffset,
  normalizeTextAlign,
  normalizeVideoEmbedUrl,
  sanitizeRichHtml,
  trimTrailingEmptyParagraphs,
  resolveRichMediaReferencesInContainer,
  getViewportClampedInfoFrameSize,
  getMobileInfoFrameClamp,
  getScaledInfoFramePositionForViewport,
  getFrameVisualStyle,
  withAlpha,
  darkenHex,
});

function isTouchMobileDevice() {
  const ua = navigator.userAgent || '';
  const hasCoarsePointer = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  const hasTouchPoints = (navigator.maxTouchPoints || 0) > 0;
  const isMobileUa = /Android|iPhone|iPad|iPod/i.test(ua);
  return isMobileUa || (hasCoarsePointer && hasTouchPoints);
}

function shouldUseMobileSceneZoomPolicy() {
  return isTouchMobileDevice();
}

function getMobileSceneMaxFov(sceneData) {
  const initialFov = sceneData?.initialViewParameters?.fov || 1.4;
  const initialHalfFov = initialFov / 2;
  const scaledTangent = Math.tan(initialHalfFov) * MOBILE_SCENE_MAX_FOV_RATIO;
  return Math.min(Math.PI - 0.000001, 2 * Math.atan(scaledTangent));
}

function buildSceneLimiter(sceneData) {
  const width = sceneData?.sourceImage?.width || sceneData?.faceSize || 4096;
  const maxVerticalFov = shouldUseMobileSceneZoomPolicy() ? getMobileSceneMaxFov(sceneData) : Math.PI;
  const maxHorizontalFov = Math.PI;
  return Marzipano.RectilinearView.limit.traditional(width, maxVerticalFov, maxHorizontalFov);
}

function clampSceneViewFov(view, sceneData) {
  if (!view || !shouldUseMobileSceneZoomPolicy()) return false;
  const maxFov = getMobileSceneMaxFov(sceneData);
  const currentFov = typeof view.fov === 'function' ? view.fov() : view.parameters?.().fov;
  if (!Number.isFinite(currentFov) || currentFov <= maxFov + 0.0001) return false;
  try {
    view.setFov(maxFov);
    return true;
  } catch {
    return false;
  }
}

function syncSceneViewLimiters() {
  scenes.forEach((scene) => {
    try {
      scene.view?.setLimiter?.(buildSceneLimiter(scene.data));
      clampSceneViewFov(scene.view, scene.data);
    } catch {}
  });
  vrViewers?.leftScenes?.forEach((scene) => {
    try {
      scene.view?.setLimiter?.(buildSceneLimiter(scene.data));
      clampSceneViewFov(scene.view, scene.data);
    } catch {}
  });
  vrViewers?.rightScenes?.forEach((scene) => {
    try {
      scene.view?.setLimiter?.(buildSceneLimiter(scene.data));
      clampSceneViewFov(scene.view, scene.data);
    } catch {}
  });
}

function refreshViewerLayout() {
  runtimeUi.syncViewerViewportMetrics();
  const isMobileLayout = isMobileViewerLayout();
  if (lastMobileViewerLayout !== isMobileLayout) {
    lastMobileViewerLayout = isMobileLayout;
  }
  const useMobileSceneLimiter = shouldUseMobileSceneZoomPolicy();
  if (lastMobileSceneLimiterMode !== useMobileSceneLimiter) {
    lastMobileSceneLimiterMode = useMobileSceneLimiter;
    syncSceneViewLimiters();
  }
  runtimeUi.updateOrientationLockUi();
  if (runtimeUi.isOrientationLocked()) return;
  const rect = panoElement?.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect?.width || panoElement?.clientWidth || 0));
  const height = Math.max(1, Math.round(rect?.height || panoElement?.clientHeight || 0));
  if (width > 0 && height > 0) {
    scenes.forEach((scene) => {
      try { scene.view?.setSize?.({ width, height }); } catch {}
    });
    if (typeof viewer?.updateSize === 'function') {
      try { viewer.updateSize(); } catch {}
    }
  }

  const leftRect = panoLeft?.getBoundingClientRect();
  const rightRect = panoRight?.getBoundingClientRect();
  const leftWidth = Math.max(1, Math.round(leftRect?.width || panoLeft?.clientWidth || 0));
  const leftHeight = Math.max(1, Math.round(leftRect?.height || panoLeft?.clientHeight || 0));
  const rightWidth = Math.max(1, Math.round(rightRect?.width || panoRight?.clientWidth || 0));
  const rightHeight = Math.max(1, Math.round(rightRect?.height || panoRight?.clientHeight || 0));
  if (leftWidth > 0 && leftHeight > 0) {
    vrViewers?.leftScenes?.forEach((scene) => {
      try { scene.view?.setSize?.({ width: leftWidth, height: leftHeight }); } catch {}
    });
    if (typeof vrViewers?.leftViewer?.updateSize === 'function') {
      try { vrViewers.leftViewer.updateSize(); } catch {}
    }
  }
  if (rightWidth > 0 && rightHeight > 0) {
    vrViewers?.rightScenes?.forEach((scene) => {
      try { scene.view?.setSize?.({ width: rightWidth, height: rightHeight }); } catch {}
    });
    if (typeof vrViewers?.rightViewer?.updateSize === 'function') {
      try { vrViewers.rightViewer.updateSize(); } catch {}
    }
  }

  runtimeFloorplan.refreshLayout({ mobilePanelMode: runtimePanels?.getMode?.() });
}

function getMobileInfoFrameClamp() {
  if (!isMobileViewerLayout()) return null;
  return {
    maxWidth: Math.max(220, Math.round(window.innerWidth * 0.92)),
    maxHeight: Math.max(160, Math.round(window.innerHeight * 0.72))
  };
}

function isZeroCssValue(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === '0' || raw === '0px' || raw === '0rem' || raw === '0em' || raw === '0%';
}

function clampInfoFrameDimension(value, min, max, fallback) {
  const numeric = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function normalizeInfoFrameSize(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    width: clampInfoFrameDimension(
      source.width,
      MIN_INFO_FRAME_WIDTH,
      MAX_INFO_FRAME_WIDTH,
      DEFAULT_INFO_FRAME_WIDTH
    ),
    height: clampInfoFrameDimension(
      source.height,
      MIN_INFO_FRAME_HEIGHT,
      MAX_INFO_FRAME_HEIGHT,
      DEFAULT_INFO_FRAME_HEIGHT
    )
  };
}

function clampInfoFramePosition(value, fallback) {
  const numeric = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(8, Math.round(numeric));
}

function normalizeInfoFramePosition(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    left: clampInfoFramePosition(source.left, DEFAULT_INFO_FRAME_LEFT),
    top: clampInfoFramePosition(source.top, DEFAULT_INFO_FRAME_TOP)
  };
}

function normalizeInfoFrameViewport(value) {
  const source = value && typeof value === 'object' ? value : {};
  const widthRaw = Number.parseInt(String(source.width ?? ''), 10);
  const heightRaw = Number.parseInt(String(source.height ?? ''), 10);
  return {
    width: Number.isFinite(widthRaw)
      ? Math.max(1, Math.min(10000, Math.round(widthRaw)))
      : DEFAULT_INFO_FRAME_VIEWPORT_WIDTH,
    height: Number.isFinite(heightRaw)
      ? Math.max(1, Math.min(10000, Math.round(heightRaw)))
      : DEFAULT_INFO_FRAME_VIEWPORT_HEIGHT
  };
}

function normalizeInfoFrameAnchorOffset(value) {
  const source = value && typeof value === 'object' ? value : {};
  const offsetXRaw = Number.parseFloat(String(source.offsetX ?? ''));
  const offsetYRaw = Number.parseFloat(String(source.offsetY ?? ''));
  if (!Number.isFinite(offsetXRaw) || !Number.isFinite(offsetYRaw)) return null;
  return {
    offsetX: Math.max(-10000, Math.min(10000, Math.round(offsetXRaw))),
    offsetY: Math.max(-10000, Math.min(10000, Math.round(offsetYRaw)))
  };
}

function sanitizeInfoBackgroundTransparencyPercent(value, fallback = DEFAULT_INFO_BG_TRANSPARENCY) {
  const numeric = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function getFrameVisualStyle(target) {
  const raw = target?.editorVisualStyle;
  if (!raw || typeof raw !== 'object') {
    return {
      backgroundColorKey: DEFAULT_INFO_BG_COLOR_KEY,
      backgroundTransparency: DEFAULT_INFO_BG_TRANSPARENCY
    };
  }
  const colorKey = normalizeFloorplanColorKey(raw.backgroundColorKey || DEFAULT_INFO_BG_COLOR_KEY);
  let transparencyPercent;
  if (raw.backgroundTransparency !== undefined) {
    transparencyPercent = sanitizeInfoBackgroundTransparencyPercent(raw.backgroundTransparency, DEFAULT_INFO_BG_TRANSPARENCY);
  } else if (raw.backgroundOpacity !== undefined) {
    const legacyOpacity = sanitizeInfoBackgroundTransparencyPercent(raw.backgroundOpacity, 100 - DEFAULT_INFO_BG_TRANSPARENCY);
    transparencyPercent = 100 - legacyOpacity;
  } else {
    transparencyPercent = DEFAULT_INFO_BG_TRANSPARENCY;
  }
  return {
    backgroundColorKey: colorKey,
    backgroundTransparency: transparencyPercent
  };
}

function getScaledInfoFramePositionForViewport(target, viewportWidth = window.innerWidth, viewportHeight = window.innerHeight) {
  const pos = normalizeInfoFramePosition(target?.infoFramePosition);
  const baseViewport = normalizeInfoFrameViewport(target?.infoFrameViewport);
  const currentWidth = Math.max(1, Math.round(viewportWidth || baseViewport.width));
  const currentHeight = Math.max(1, Math.round(viewportHeight || baseViewport.height));
  return {
    left: Math.round((pos.left / Math.max(1, baseViewport.width)) * currentWidth),
    top: Math.round((pos.top / Math.max(1, baseViewport.height)) * currentHeight)
  };
}

function normalizeRichLayoutColumns(value, fallback = 2) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed)) {
    return Math.max(1, Math.min(6, parsed));
  }
  return Math.max(1, Math.min(6, Number.parseInt(fallback, 10) || 2));
}

function getDefaultRichLayoutWeights(columnCount) {
  const safeCols = normalizeRichLayoutColumns(columnCount, 2);
  if (safeCols === 2) {
    return [1.35, 1];
  }
  return Array.from({ length: safeCols }, () => 1);
}

function parseRichLayoutWeightsCsv(rawValue, expectedCols = null) {
  const raw = String(rawValue || '').trim();
  if (!raw) return null;
  const parts = raw.split(',').map((item) => item.trim()).filter(Boolean);
  if (!parts.length) return null;
  if (Number.isFinite(expectedCols) && expectedCols > 0 && parts.length !== expectedCols) return null;
  const weights = parts.map((item) => Number.parseFloat(item));
  if (weights.some((value) => !Number.isFinite(value) || value <= 0)) return null;
  return weights;
}

function parseRichLayoutWeightsTemplate(rawTemplate, expectedCols = null) {
  const raw = String(rawTemplate || '').trim();
  if (!raw) return null;
  const tokens = raw.split(/\s+/).map((item) => item.trim()).filter(Boolean);
  if (!tokens.length) return null;
  if (Number.isFinite(expectedCols) && expectedCols > 0 && tokens.length !== expectedCols) return null;
  const weights = [];
  for (const token of tokens) {
    let match = token.match(/^minmax\(0,\s*([0-9]*\.?[0-9]+)fr\)$/i);
    if (match) {
      weights.push(Number.parseFloat(match[1]));
      continue;
    }
    match = token.match(/^([0-9]*\.?[0-9]+)fr$/i);
    if (match) {
      weights.push(Number.parseFloat(match[1]));
      continue;
    }
    match = token.match(/^([0-9]*\.?[0-9]+)%$/i);
    if (match) {
      weights.push(Number.parseFloat(match[1]));
      continue;
    }
    match = token.match(/^([0-9]*\.?[0-9]+)px$/i);
    if (match) {
      weights.push(Number.parseFloat(match[1]));
      continue;
    }
    return null;
  }
  if (weights.some((value) => !Number.isFinite(value) || value <= 0)) return null;
  return weights;
}

function serializeRichLayoutWeights(weights) {
  return (weights || [])
    .map((value) => Math.max(1, Number.parseFloat(value) || 1))
    .map((value) => value.toFixed(4))
    .join(',');
}

function getViewportClampedInfoFrameSize(frame) {
  const normalized = normalizeInfoFrameSize(frame);
  return {
    width: Math.min(normalized.width, Math.max(MIN_INFO_FRAME_WIDTH, window.innerWidth - 16)),
    height: Math.min(normalized.height, Math.max(MIN_INFO_FRAME_HEIGHT, window.innerHeight - 16))
  };
}

function sanitizeImageSizeValue(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (/^\d{1,3}%$/.test(raw)) {
    const amount = Number.parseInt(raw, 10);
    if (amount >= 5 && amount <= 100) return `${amount}%`;
  }
  if (/^\d{1,4}px$/.test(raw)) {
    const amount = Number.parseInt(raw, 10);
    if (amount >= 24 && amount <= 4096) return `${amount}px`;
  }
  if (/^\d{1,4}$/.test(raw)) {
    const amount = Number.parseInt(raw, 10);
    if (amount >= 24 && amount <= 4096) return `${amount}px`;
  }
  return '';
}

function sanitizeImageMaxHeightValue(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (/^\d{1,4}px$/.test(raw)) {
    const amount = Number.parseInt(raw, 10);
    if (amount >= 24 && amount <= 2400) return `${amount}px`;
  }
  if (/^\d{1,3}(\.\d+)?em$/.test(raw)) {
    const amount = Number.parseFloat(raw);
    if (amount >= 1 && amount <= 120) return `${amount}em`;
  }
  if (/^\d{1,3}(\.\d+)?rem$/.test(raw)) {
    const amount = Number.parseFloat(raw);
    if (amount >= 1 && amount <= 120) return `${amount}rem`;
  }
  if (/^\d{1,4}$/.test(raw)) {
    const amount = Number.parseInt(raw, 10);
    if (amount >= 24 && amount <= 2400) return `${amount}px`;
  }
  return '';
}

function sanitizeRichFontSizeValue(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (/^\d{1,3}px$/.test(raw)) {
    const amount = Number.parseInt(raw, 10);
    if (amount >= 8 && amount <= 96) return `${amount}px`;
  }
  if (/^\d{1,3}$/.test(raw)) {
    const amount = Number.parseInt(raw, 10);
    if (amount >= 8 && amount <= 96) return `${amount}px`;
  }
  return '';
}

function sanitizeRichLineHeightValue(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (/^\d(?:\.\d+)?$/.test(raw)) {
    const amount = Number.parseFloat(raw);
    if (amount >= 0.8 && amount <= 3) return String(amount);
  }
  if (/^\d{2,3}%$/.test(raw)) {
    const amount = Number.parseInt(raw, 10);
    if (amount >= 80 && amount <= 300) return `${amount}%`;
  }
  if (/^\d{1,3}(\.\d+)?(px|em|rem)$/.test(raw)) {
    return raw;
  }
  return '';
}

function sanitizeRichParagraphSpacingValue(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (/^\d{1,2}px$/.test(raw)) {
    const amount = Number.parseInt(raw, 10);
    if (amount >= 0 && amount <= 48) return `${amount}px`;
  }
  if (/^\d{1,2}$/.test(raw)) {
    const amount = Number.parseInt(raw, 10);
    if (amount >= 0 && amount <= 48) return `${amount}px`;
  }
  return '';
}

function normalizeImageWrap(value) {
  const candidate = String(value || '').trim().toLowerCase();
  if (candidate === 'left' || candidate === 'right' || candidate === 'none') return candidate;
  return 'none';
}

function parseMediaReference(value) {
  const raw = String(value || '').trim();
  if (!raw.toLowerCase().startsWith('media:')) return '';
  const encodedId = raw.slice(6);
  if (!encodedId) return '';
  try {
    return decodeURIComponent(encodedId).trim();
  } catch (error) {
    return encodedId.trim();
  }
}

function resolveProjectMediaPath(projectRef, mediaId, { preferDataUrl = false } = {}) {
  if (!projectRef || !mediaId) return '';
  const media = (projectRef.assets?.media || []).find((asset) => asset.id === mediaId);
  if (!media) return '';
  if (preferDataUrl && media.dataUrl) return media.dataUrl;
  return media.path || media.dataUrl || '';
}

function resolveRichMediaReferencesInContainer(container, projectRef = projectData, { preferDataUrl = false } = {}) {
  if (!container || !projectRef) return;
  container.querySelectorAll('[src]').forEach((node) => {
    const mediaId = parseMediaReference(node.getAttribute('src'));
    if (!mediaId) return;
    const resolved = resolveProjectMediaPath(projectRef, mediaId, { preferDataUrl });
    if (resolved) {
      node.setAttribute('src', resolved);
      return;
    }
    node.removeAttribute('src');
  });
}

function isSafeRichUrl(value, { allowDataImage = false } = {}) {
  const url = String(value || '').trim();
  if (!url) return false;
  if (parseMediaReference(url)) return true;
  if (allowDataImage && url.startsWith('data:image/')) return true;
  if (url.startsWith('http://') || url.startsWith('https://')) return true;
  if (url.startsWith('./') || url.startsWith('../') || url.startsWith('/')) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return false;
  if (url.startsWith('//')) return false;
  return true;
}

function parseYouTubeTimeToSeconds(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return Math.max(0, Number.parseInt(raw, 10) || 0);
  let total = 0;
  const hourMatch = raw.match(/(\d+)h/);
  const minMatch = raw.match(/(\d+)m/);
  const secMatch = raw.match(/(\d+)s/);
  if (hourMatch) total += (Number.parseInt(hourMatch[1], 10) || 0) * 3600;
  if (minMatch) total += (Number.parseInt(minMatch[1], 10) || 0) * 60;
  if (secMatch) total += Number.parseInt(secMatch[1], 10) || 0;
  return Math.max(0, total);
}

function normalizeVideoEmbedUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch (error) {
    return raw;
  }

  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  const query = url.searchParams;

  const isYouTubeHost = /(^|\.)youtube\.com$/.test(host) || /(^|\.)youtu\.be$/.test(host);
  if (isYouTubeHost) {
    let videoId = '';
    if (/youtu\.be$/.test(host)) {
      videoId = path.replace(/^\/+/, '').split('/')[0] || '';
    } else if (path.startsWith('/watch')) {
      videoId = query.get('v') || '';
    } else if (path.startsWith('/embed/')) {
      videoId = path.split('/')[2] || '';
    } else if (path.startsWith('/shorts/')) {
      videoId = path.split('/')[2] || '';
    } else if (path.startsWith('/live/')) {
      videoId = path.split('/')[2] || '';
    }
    if (!videoId) return raw;
    const t = query.get('t') || query.get('start') || '';
    const startSeconds = parseYouTubeTimeToSeconds(t);
    const out = new URL(`https://www.youtube.com/embed/${videoId}`);
    if (startSeconds > 0) out.searchParams.set('start', String(startSeconds));
    return out.toString();
  }

  const isVimeoHost = /(^|\.)vimeo\.com$/.test(host) || /(^|\.)player\.vimeo\.com$/.test(host);
  if (isVimeoHost) {
    const segments = path.split('/').filter(Boolean);
    let videoId = '';
    if (host.includes('player.vimeo.com')) {
      const videoIndex = segments.indexOf('video');
      videoId = videoIndex >= 0 ? (segments[videoIndex + 1] || '') : '';
    } else {
      videoId = segments[0] || '';
    }
    if (!videoId || !/^\d+$/.test(videoId)) return raw;
    return `https://player.vimeo.com/video/${videoId}`;
  }

  return raw;
}

function sanitizeRichHtml(rawHtml) {
  const template = document.createElement('template');
  template.innerHTML = String(rawHtml || '');
  const allowedTags = new Set([
    'p', 'br', 'strong', 'b', 'em', 'i', 'u',
    'ul', 'ol', 'li', 'img', 'video', 'iframe',
    'a', 'div', 'span', 'h1', 'h2', 'h3', 'h4',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th'
  ]);

  const cleanNode = (node) => {
    if (!node) return;
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toLowerCase();
      if (!allowedTags.has(tag)) {
        const parent = node.parentNode;
        if (parent) {
          while (node.firstChild) {
            parent.insertBefore(node.firstChild, node);
          }
          parent.removeChild(node);
        }
        return;
      }

      const originalAttrs = {};
      Array.from(node.attributes).forEach((attr) => {
        originalAttrs[attr.name.toLowerCase()] = attr.value;
      });
      Array.from(node.attributes).forEach((attr) => {
        node.removeAttribute(attr.name);
      });

      if (tag === 'p' || tag === 'div' || tag === 'span' || /^h[1-4]$/.test(tag) || tag === 'td' || tag === 'th') {
        const styleValue = String(originalAttrs.style || '');
        const match = styleValue.match(/text-align\s*:\s*(left|center|right|justify)/i);
        const align = normalizeTextAlign(match ? match[1] : 'left');
        const sizeMatch = styleValue.match(/(?:^|;)\s*font-size\s*:\s*([^;]+)/i);
        const fontSize = sanitizeRichFontSizeValue(sizeMatch ? sizeMatch[1] : '');
        const lineMatch = styleValue.match(/(?:^|;)\s*line-height\s*:\s*([^;]+)/i);
        const lineHeight = sanitizeRichLineHeightValue(lineMatch ? lineMatch[1] : '');
        const marginTopMatch = styleValue.match(/(?:^|;)\s*margin-top\s*:\s*([^;]+)/i);
        const marginBottomMatch = styleValue.match(/(?:^|;)\s*margin-bottom\s*:\s*([^;]+)/i);
        const marginTop = sanitizeRichParagraphSpacingValue(marginTopMatch ? marginTopMatch[1] : '');
        const marginBottom = sanitizeRichParagraphSpacingValue(marginBottomMatch ? marginBottomMatch[1] : '');
        const paddingTopMatch = styleValue.match(/(?:^|;)\s*padding-top\s*:\s*([^;]+)/i);
        const paddingBottomMatch = styleValue.match(/(?:^|;)\s*padding-bottom\s*:\s*([^;]+)/i);
        const paddingTop = sanitizeRichParagraphSpacingValue(paddingTopMatch ? paddingTopMatch[1] : '');
        const paddingBottom = sanitizeRichParagraphSpacingValue(paddingBottomMatch ? paddingBottomMatch[1] : '');
        if (align !== 'left') {
          node.style.textAlign = align;
        }
        if (fontSize) {
          node.style.fontSize = fontSize;
        }
        if (lineHeight) {
          node.style.lineHeight = lineHeight;
        }
        if (marginTop) {
          node.style.marginTop = marginTop;
        }
        if (marginBottom) {
          node.style.marginBottom = marginBottom;
        }
        if (tag === 'div') {
          if (paddingTop) {
            node.style.paddingTop = paddingTop;
          }
          if (paddingBottom) {
            node.style.paddingBottom = paddingBottom;
          }
        }
      }

      if (tag === 'div') {
        const layout = String(originalAttrs['data-layout'] || '').trim().toLowerCase();
        const col = Number.parseInt(String(originalAttrs['data-col'] || '').trim(), 10);
        const styleValue = String(originalAttrs.style || '');
        const savedColWidths = String(originalAttrs['data-col-widths'] || '').trim();
        const savedBlockAlignRaw = String(originalAttrs['data-block-align'] || '').trim().toLowerCase();
        const widthMatch = styleValue.match(/(?:^|;)\s*width\s*:\s*([^;]+)/i);
        const heightMatch = styleValue.match(/(?:^|;)\s*height\s*:\s*([^;]+)/i);
        const minHeightMatch = styleValue.match(/(?:^|;)\s*min-height\s*:\s*([^;]+)/i);
        const gridTemplateMatch = styleValue.match(/(?:^|;)\s*grid-template-columns\s*:\s*([^;]+)/i);
        const marginLeftMatch = styleValue.match(/(?:^|;)\s*margin-left\s*:\s*([^;]+)/i);
        const marginRightMatch = styleValue.match(/(?:^|;)\s*margin-right\s*:\s*([^;]+)/i);
        const requestedWidth = sanitizeImageSizeValue(widthMatch ? widthMatch[1] : '');
        const requestedHeight = sanitizeImageMaxHeightValue(heightMatch ? heightMatch[1] : '');
        const requestedMinHeight = sanitizeImageMaxHeightValue(minHeightMatch ? minHeightMatch[1] : '');
        const layoutMatch = layout.match(/^columns-(\d+)$/i);
        if (layoutMatch) {
          const safeCols = normalizeRichLayoutColumns(layoutMatch[1], 2);
          node.setAttribute('data-layout', `columns-${safeCols}`);
          const colWeights =
            parseRichLayoutWeightsCsv(savedColWidths, safeCols)
            || parseRichLayoutWeightsTemplate(gridTemplateMatch ? gridTemplateMatch[1] : '', safeCols)
            || getDefaultRichLayoutWeights(safeCols);
          if (colWeights) {
            node.setAttribute('data-col-widths', serializeRichLayoutWeights(colWeights));
            node.style.gridTemplateColumns = colWeights
              .map((value) => `minmax(0,${Math.max(1, value).toFixed(4)}fr)`)
              .join(' ');
          }
          if (requestedWidth) {
            node.style.width = requestedWidth;
          }
          if (requestedHeight) {
            node.style.height = requestedHeight;
          }
          if (requestedMinHeight) {
            node.style.minHeight = requestedMinHeight;
          }
          let blockAlign = 'left';
          if (savedBlockAlignRaw === 'center' || savedBlockAlignRaw === 'right' || savedBlockAlignRaw === 'left') {
            blockAlign = savedBlockAlignRaw;
          } else {
            const ml = String(marginLeftMatch ? marginLeftMatch[1] : '').trim().toLowerCase();
            const mr = String(marginRightMatch ? marginRightMatch[1] : '').trim().toLowerCase();
            if (ml === 'auto' && mr === 'auto') blockAlign = 'center';
            else if (ml === 'auto' && isZeroCssValue(mr)) blockAlign = 'right';
          }
          node.setAttribute('data-block-align', blockAlign);
          if (blockAlign === 'center') {
            node.style.marginLeft = 'auto';
            node.style.marginRight = 'auto';
          } else if (blockAlign === 'right') {
            node.style.marginLeft = 'auto';
            node.style.marginRight = '0';
          } else {
            node.style.marginLeft = '0';
            node.style.marginRight = 'auto';
          }
        }
        if (Number.isFinite(col) && col >= 1 && col <= 12) {
          node.setAttribute('data-col', String(col));
        }
      }

      if (tag === 'table') {
        const styleValue = String(originalAttrs.style || '');
        const widthMatch = styleValue.match(/(?:^|;)\s*width\s*:\s*([^;]+)/i);
        const requestedWidth = sanitizeImageSizeValue(widthMatch ? widthMatch[1] : '');
        if (requestedWidth) {
          node.style.width = requestedWidth;
        }
        node.style.borderCollapse = 'collapse';
      }

      if (tag === 'tr') {
        const styleValue = String(originalAttrs.style || '');
        const heightMatch = styleValue.match(/(?:^|;)\s*height\s*:\s*([^;]+)/i);
        const requestedHeight = sanitizeImageMaxHeightValue(heightMatch ? heightMatch[1] : '');
        if (requestedHeight) {
          node.style.height = requestedHeight;
        }
      }

      if (tag === 'td' || tag === 'th') {
        const styleValue = String(originalAttrs.style || '');
        const widthMatch = styleValue.match(/(?:^|;)\s*width\s*:\s*([^;]+)/i);
        const heightMatch = styleValue.match(/(?:^|;)\s*height\s*:\s*([^;]+)/i);
        const requestedWidth = sanitizeImageSizeValue(widthMatch ? widthMatch[1] : '');
        const requestedHeight = sanitizeImageMaxHeightValue(heightMatch ? heightMatch[1] : '');
        if (requestedWidth) {
          node.style.width = requestedWidth;
        }
        if (requestedHeight) {
          node.style.height = requestedHeight;
        }
      }

      if (tag === 'img') {
        const src = String(originalAttrs.src || '').trim();
        if (isSafeRichUrl(src, { allowDataImage: true })) {
          node.setAttribute('src', src);
          node.setAttribute('alt', String(originalAttrs.alt || '').trim());
          const styleValue = String(originalAttrs.style || '');
          const widthMatch = styleValue.match(/(?:^|;)\s*width\s*:\s*([^;]+)/i);
          const maxHeightMatch = styleValue.match(/(?:^|;)\s*max-height\s*:\s*([^;]+)/i);
          const floatMatch = styleValue.match(/(?:^|;)\s*float\s*:\s*(left|right|none)/i);
          const marginLeftMatch = styleValue.match(/(?:^|;)\s*margin-left\s*:\s*([^;]+)/i);
          const marginRightMatch = styleValue.match(/(?:^|;)\s*margin-right\s*:\s*([^;]+)/i);
          const savedAlignRaw = String(originalAttrs['data-align'] || '').trim().toLowerCase();
          const wrapFromData = normalizeImageWrap(originalAttrs['data-wrap'] || '');
          const requestedWrap = normalizeImageWrap(wrapFromData !== 'none' ? wrapFromData : (floatMatch ? floatMatch[1] : 'none'));
          const requestedSize = sanitizeImageSizeValue(widthMatch ? widthMatch[1] : (originalAttrs.width || ''));
          const requestedMaxHeight = sanitizeImageMaxHeightValue(maxHeightMatch ? maxHeightMatch[1] : '');
          if (requestedSize) {
            node.style.width = requestedSize;
          }
          if (requestedSize || requestedMaxHeight) {
            node.style.height = 'auto';
          }
          if (requestedMaxHeight) {
            node.style.maxHeight = requestedMaxHeight;
          }
          node.setAttribute('data-wrap', requestedWrap);
          if (requestedWrap === 'left') {
            node.style.float = 'left';
            node.style.margin = '0 0.85em 0.6em 0';
          } else if (requestedWrap === 'right') {
            node.style.float = 'right';
            node.style.margin = '0 0 0.6em 0.85em';
          } else {
            node.style.float = 'none';
            node.style.display = 'block';
            let mediaAlign = savedAlignRaw === 'center' || savedAlignRaw === 'right' || savedAlignRaw === 'left'
              ? savedAlignRaw
              : 'left';
            if (!originalAttrs['data-align']) {
              const ml = String(marginLeftMatch ? marginLeftMatch[1] : '').trim().toLowerCase();
              const mr = String(marginRightMatch ? marginRightMatch[1] : '').trim().toLowerCase();
              if (ml === 'auto' && mr === 'auto') mediaAlign = 'center';
              else if (ml === 'auto' && isZeroCssValue(mr)) mediaAlign = 'right';
            }
            node.setAttribute('data-align', mediaAlign);
            node.style.marginTop = '0.5em';
            node.style.marginBottom = '0.5em';
            if (mediaAlign === 'center') {
              node.style.marginLeft = 'auto';
              node.style.marginRight = 'auto';
            } else if (mediaAlign === 'right') {
              node.style.marginLeft = 'auto';
              node.style.marginRight = '0';
            } else {
              node.style.marginLeft = '0';
              node.style.marginRight = 'auto';
            }
          }
          node.setAttribute('loading', 'lazy');
        } else {
          const parent = node.parentNode;
          if (parent) parent.removeChild(node);
          return;
        }
      }

      if (tag === 'video') {
        const src = String(originalAttrs.src || '').trim();
        if (isSafeRichUrl(src)) {
          node.setAttribute('src', src);
          node.setAttribute('controls', '');
          const styleValue = String(originalAttrs.style || '');
          const widthMatch = styleValue.match(/(?:^|;)\s*width\s*:\s*([^;]+)/i);
          const heightMatch = styleValue.match(/(?:^|;)\s*height\s*:\s*([^;]+)/i);
          const marginLeftMatch = styleValue.match(/(?:^|;)\s*margin-left\s*:\s*([^;]+)/i);
          const marginRightMatch = styleValue.match(/(?:^|;)\s*margin-right\s*:\s*([^;]+)/i);
          const savedAlignRaw = String(originalAttrs['data-align'] || '').trim().toLowerCase();
          const requestedWidth = sanitizeImageSizeValue(widthMatch ? widthMatch[1] : (originalAttrs.width || ''));
          const requestedHeight = sanitizeImageMaxHeightValue(heightMatch ? heightMatch[1] : (originalAttrs.height || ''));
          if (requestedWidth) {
            node.style.width = requestedWidth;
          }
          if (requestedHeight) {
            node.style.height = requestedHeight;
          }
          node.style.display = 'block';
          node.style.marginTop = '0.5em';
          node.style.marginBottom = '0.5em';
          let mediaAlign = savedAlignRaw === 'center' || savedAlignRaw === 'right' || savedAlignRaw === 'left'
            ? savedAlignRaw
            : 'left';
          if (!originalAttrs['data-align']) {
            const ml = String(marginLeftMatch ? marginLeftMatch[1] : '').trim().toLowerCase();
            const mr = String(marginRightMatch ? marginRightMatch[1] : '').trim().toLowerCase();
            if (ml === 'auto' && mr === 'auto') mediaAlign = 'center';
            else if (ml === 'auto' && isZeroCssValue(mr)) mediaAlign = 'right';
          }
          node.setAttribute('data-align', mediaAlign);
          if (mediaAlign === 'center') {
            node.style.marginLeft = 'auto';
            node.style.marginRight = 'auto';
          } else if (mediaAlign === 'right') {
            node.style.marginLeft = 'auto';
            node.style.marginRight = '0';
          } else {
            node.style.marginLeft = '0';
            node.style.marginRight = 'auto';
          }
        } else {
          const parent = node.parentNode;
          if (parent) parent.removeChild(node);
          return;
        }
      }

      if (tag === 'iframe') {
        const src = String(originalAttrs.src || '').trim();
        const normalizedSrc = normalizeVideoEmbedUrl(src);
        if (isSafeRichUrl(normalizedSrc)) {
          node.setAttribute('src', normalizedSrc);
          node.setAttribute('loading', 'lazy');
          node.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture');
          node.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
          node.setAttribute('allowfullscreen', '');
          node.setAttribute('frameborder', '0');
          const styleValue = String(originalAttrs.style || '');
          const widthMatch = styleValue.match(/(?:^|;)\s*width\s*:\s*([^;]+)/i);
          const heightMatch = styleValue.match(/(?:^|;)\s*height\s*:\s*([^;]+)/i);
          const marginLeftMatch = styleValue.match(/(?:^|;)\s*margin-left\s*:\s*([^;]+)/i);
          const marginRightMatch = styleValue.match(/(?:^|;)\s*margin-right\s*:\s*([^;]+)/i);
          const savedAlignRaw = String(originalAttrs['data-align'] || '').trim().toLowerCase();
          const requestedWidth = sanitizeImageSizeValue(widthMatch ? widthMatch[1] : (originalAttrs.width || ''));
          const requestedHeight = sanitizeImageMaxHeightValue(heightMatch ? heightMatch[1] : (originalAttrs.height || ''));
          if (requestedWidth) {
            node.style.width = requestedWidth;
          }
          if (requestedHeight) {
            node.style.height = requestedHeight;
          }
          node.style.display = 'block';
          node.style.marginTop = '0.5em';
          node.style.marginBottom = '0.5em';
          let mediaAlign = savedAlignRaw === 'center' || savedAlignRaw === 'right' || savedAlignRaw === 'left'
            ? savedAlignRaw
            : 'left';
          if (!originalAttrs['data-align']) {
            const ml = String(marginLeftMatch ? marginLeftMatch[1] : '').trim().toLowerCase();
            const mr = String(marginRightMatch ? marginRightMatch[1] : '').trim().toLowerCase();
            if (ml === 'auto' && mr === 'auto') mediaAlign = 'center';
            else if (ml === 'auto' && isZeroCssValue(mr)) mediaAlign = 'right';
          }
          node.setAttribute('data-align', mediaAlign);
          if (mediaAlign === 'center') {
            node.style.marginLeft = 'auto';
            node.style.marginRight = 'auto';
          } else if (mediaAlign === 'right') {
            node.style.marginLeft = 'auto';
            node.style.marginRight = '0';
          } else {
            node.style.marginLeft = '0';
            node.style.marginRight = 'auto';
          }
          node.style.border = '0';
        } else {
          const parent = node.parentNode;
          if (parent) parent.removeChild(node);
          return;
        }
      }

      if (tag === 'a') {
        const href = String(originalAttrs.href || '').trim();
        if (isSafeRichUrl(href)) {
          node.setAttribute('href', href);
          node.setAttribute('target', '_blank');
          node.setAttribute('rel', 'noopener noreferrer');
        }
      }
    }
    Array.from(node.childNodes || []).forEach(cleanNode);
  };

  Array.from(template.content.childNodes).forEach(cleanNode);
  return template.innerHTML;
}

function trimTrailingEmptyParagraphs(container) {
  if (!(container instanceof Element)) return;
  while (container.lastElementChild) {
    const last = container.lastElementChild;
    if (!(last instanceof HTMLElement) || last.tagName.toLowerCase() !== 'p') break;
    const normalizedHtml = String(last.innerHTML || '')
      .replace(/&nbsp;/gi, '')
      .replace(/<br\s*\/?>/gi, '')
      .trim();
    const normalizedText = String(last.textContent || '')
      .replace(/\u00a0/g, '')
      .trim();
    if (normalizedHtml !== '' || normalizedText !== '') break;
    last.remove();
  }
}

function getProjectHomePage(project = projectData) {
  if (!project || !project.homePage || typeof project.homePage !== 'object') return null;
  return {
    ...project.homePage,
    richContentHtml: typeof project.homePage.richContentHtml === 'string' ? project.homePage.richContentHtml : '',
    infoFrameSize: normalizeInfoFrameSize(project.homePage.infoFrameSize),
    infoFramePosition: normalizeInfoFramePosition(project.homePage.infoFramePosition),
    infoFrameViewport: normalizeInfoFrameViewport(project.homePage.infoFrameViewport)
  };
}

function hasHomePageContent(project = projectData) {
  const homePage = getProjectHomePage(project);
  if (!homePage) return false;
  return Boolean(String(homePage.richContentHtml || '').trim());
}

function updateHomePageToggleButton(project = projectData) {
  if (!btnHomeToggle) return;
  const hasContent = hasHomePageContent(project);
  btnHomeToggle.disabled = !hasContent;
  btnHomeToggle.textContent = homePageVisible ? 'Close Home' : 'Open Home';
}

function closeHomePageOverlay() {
  homePageVisible = false;
  if (!homePageOverlay || !homePageBody || !homePageFrame) return;
  homePageBody.innerHTML = '';
  homePageBody.classList.remove('preview-rich-surface');
  homePageOverlay.classList.add('hidden');
  homePageOverlay.setAttribute('aria-hidden', 'true');
  homePageFrame.style.removeProperty('width');
  homePageFrame.style.removeProperty('height');
  homePageFrame.style.removeProperty('left');
  homePageFrame.style.removeProperty('top');
  homePageFrame.style.removeProperty('background-color');
  updateHomePageToggleButton(projectData);
  requestAnimationFrame(refreshViewerLayout);
}

function applyHomePageFrame(project = projectData) {
  const homePage = getProjectHomePage(project);
  if (!homePage || !homePageFrame || !homePageOverlay) return;
  const overlayRect = homePageOverlay.getBoundingClientRect();
  homePageFrame.style.width = `${Math.max(1, Math.round(overlayRect.width))}px`;
  homePageFrame.style.height = `${Math.max(1, Math.round(overlayRect.height))}px`;
  homePageFrame.style.left = '0px';
  homePageFrame.style.top = '0px';
  const visualStyle = getFrameVisualStyle(homePage);
  const hex = FLOORPLAN_COLOR_MAP[visualStyle.backgroundColorKey] || FLOORPLAN_COLOR_MAP[DEFAULT_INFO_BG_COLOR_KEY];
  const alpha = (100 - visualStyle.backgroundTransparency) / 100;
  homePageFrame.style.backgroundColor = withAlpha(hex, alpha);
}

function renderHomePage(project = projectData) {
  if (!homePageOverlay || !homePageBody || !homePageFrame) return;
  if (!hasHomePageContent(project)) {
    closeHomePageOverlay();
    updateHomePageToggleButton(project);
    return;
  }
  const homePage = getProjectHomePage(project);
  homePageBody.innerHTML = '';
  homePageBody.classList.add('preview-rich-surface');
  homePageBody.innerHTML = sanitizeRichHtml(homePage.richContentHtml) || '<p><br></p>';
  trimTrailingEmptyParagraphs(homePageBody);
  resolveRichMediaReferencesInContainer(homePageBody, project, { preferDataUrl: false });
  homePageVisible = true;
  runtimePanels?.close();
  homePageOverlay.classList.remove('hidden');
  homePageOverlay.setAttribute('aria-hidden', 'false');
  if (btnHomePageStart) {
    btnHomePageStart.disabled = !scenes.length;
  }
  applyHomePageFrame(project);
  updateHomePageToggleButton(project);
  requestAnimationFrame(refreshViewerLayout);
}

function toggleHomePageOverlay() {
  if (!hasHomePageContent(projectData)) return;
  if (homePageVisible) {
    closeHomePageOverlay();
    return;
  }
  renderHomePage(projectData);
}

function startTourFromHomePage() {
  if (!projectData) {
    closeHomePageOverlay();
    return;
  }
  const mainGroupId = projectData.activeGroupId || projectData.groups?.[0]?.id || null;
  if (mainGroupId) {
    activeGroupId = mainGroupId;
    renderGroupList();
    renderFloorplan();
  }
  const targetScene = getPreferredSceneForGroup(activeGroupId) || scenes[0] || null;
  closeHomePageOverlay();
  if (targetScene) {
    switchScene(targetScene, { syncGroup: true });
  } else {
    renderSceneList();
  }
}

function normalizeProject(rawProject) {
  const project = rawProject || {};
  const scenes = Array.isArray(project.scenes) ? project.scenes : [];

  project.scenes = scenes;
  project.assets = project.assets || {};
  project.assets.media = Array.isArray(project.assets.media) ? project.assets.media : [];
  project.homePage = project.homePage && typeof project.homePage === 'object' ? project.homePage : {};
  project.homePage.richContentHtml = typeof project.homePage.richContentHtml === 'string' ? project.homePage.richContentHtml : '';
  project.homePage.infoFrameSize = normalizeInfoFrameSize(project.homePage.infoFrameSize);
  project.homePage.infoFramePosition = normalizeInfoFramePosition(project.homePage.infoFramePosition);
  project.homePage.infoFrameViewport = normalizeInfoFrameViewport(project.homePage.infoFrameViewport);
  project.groups = Array.isArray(project.groups) ? project.groups.filter((group) => group?.id) : [];

  if (!project.groups.length) {
    const seen = new Set();
    scenes.forEach((scene) => {
      if (scene?.groupId) {
        seen.add(scene.groupId);
      }
    });
    if (seen.size) {
      project.groups = Array.from(seen).map((groupId, index) => ({
        id: groupId,
        name: `Group ${index + 1}`
      }));
    } else {
      project.groups = [{ id: 'group-default', name: 'Default' }];
    }
  }

  const validGroupIds = new Set(project.groups.map((group) => group.id));
  const firstGroupId = project.groups[0].id;
  scenes.forEach((scene) => {
    if (!scene.groupId || !validGroupIds.has(scene.groupId)) {
      scene.groupId = firstGroupId;
    }
    scene.alias = typeof scene.alias === 'string' ? scene.alias : '';
    if (!Array.isArray(scene.hotspots)) {
      scene.hotspots = [];
    }
    scene.hotspots.forEach((hotspot) => {
      hotspot.infoFrameSize = normalizeInfoFrameSize(hotspot.infoFrameSize);
      hotspot.displayMode = normalizeInfoHotspotDisplayMode(hotspot.displayMode);
      const blocks = Array.isArray(hotspot?.contentBlocks) ? hotspot.contentBlocks : [];
      const hasSceneLink = blocks.some((block) => block?.type === 'scene');
      blocks.forEach((block) => {
        if (block?.type === 'text') {
          block.align = normalizeTextAlign(block.align);
        }
        if (block?.type === 'scene') {
          block.comment = typeof block.comment === 'string' ? block.comment : '';
          if (Object.prototype.hasOwnProperty.call(block, 'alias')) {
            delete block.alias;
          }
        }
      });
      if (!hasSceneLink) {
        if (typeof hotspot.richContentHtml !== 'string') {
          const mediaPathById = new Map(
            (project.assets?.media || []).map((asset) => [asset.id, asset.dataUrl || asset.path || ''])
          );
          const parts = [];
          blocks.forEach((block) => {
            if (block?.type === 'text') {
              const align = normalizeTextAlign(block.align);
              const text = String(block.value || '');
              const safeText = text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;')
                .replace(/\n/g, '<br>');
              const style = align === 'left' ? '' : ` style="text-align:${align}"`;
              parts.push(`<p${style}>${safeText}</p>`);
              return;
            }
            if (block?.type === 'image') {
              const src = String(block.url || '').trim() ||
                (block.assetId ? `media:${encodeURIComponent(String(block.assetId))}` : '') ||
                String(block.assetPath || mediaPathById.get(block.assetId) || '').trim();
              if (src) parts.push(`<p><img src="${src}" alt=""></p>`);
              return;
            }
            if (block?.type === 'video') {
              const src = String(block.url || '').trim() ||
                (block.assetId ? `media:${encodeURIComponent(String(block.assetId))}` : '') ||
                String(block.assetPath || mediaPathById.get(block.assetId) || '').trim();
              if (!src) return;
              if (/youtube\.com|youtu\.be|vimeo\.com/i.test(src)) {
                parts.push(`<p><iframe src="${src}"></iframe></p>`);
              } else {
                parts.push(`<p><video src="${src}" controls></video></p>`);
              }
            }
          });
          hotspot.richContentHtml = parts.join('\n');
        }
        hotspot.contentBlocks = blocks.filter((block) => block?.type === 'scene');
      }
    });
  });

  const minimap = project.minimap && typeof project.minimap === 'object' ? project.minimap : {};
  let floorplans = Array.isArray(minimap.floorplans) ? minimap.floorplans : [];
  floorplans = floorplans
    .filter((floorplan) => (
      floorplan?.groupId &&
      validGroupIds.has(floorplan.groupId) &&
      floorplan.path
    ))
    .map((floorplan) => {
      const nodes = Array.isArray(floorplan.nodes) ? floorplan.nodes : [];
      const fallbackColorKey = normalizeFloorplanColorKey(floorplan.markerColorKey || 'yellow');
      return {
        ...floorplan,
        markerColorKey: fallbackColorKey,
        nodes: nodes
          .filter((node) => node?.sceneId && Number.isFinite(node.x) && Number.isFinite(node.y))
          .map((node) => ({
            sceneId: node.sceneId,
            x: Math.min(Math.max(node.x, 0), 1),
            y: Math.min(Math.max(node.y, 0), 1),
            rotation: Number.isFinite(node.rotation) ? node.rotation : 0,
            colorKey: normalizeFloorplanColorKey(node.colorKey || fallbackColorKey)
          }))
      };
    });

  if (!floorplans.length && minimap.image) {
    floorplans = [{ id: 'legacy-floorplan', groupId: firstGroupId, path: minimap.image, nodes: [] }];
  }

  project.minimap = { ...minimap, floorplans };
  project.activeGroupId = validGroupIds.has(project.activeGroupId) ? project.activeGroupId : firstGroupId;

  return project;
}

function resolveAssetPaths(project) {
  const mediaMap = new Map(
    (project.assets?.media || []).map((m) => [m.id, m.dataUrl || m.path || ''])
  );

  project.scenes.forEach((scene) => {
    (scene.hotspots || []).forEach((hotspot) => {
      (hotspot.contentBlocks || []).forEach((block) => {
        if (block.assetId) {
          block.assetPath = mediaMap.get(block.assetId) || '';
        }
      });
    });
  });
}

function buildViewer(project) {
  if (!window.Marzipano) {
    console.warn('Marzipano not available.');
    return;
  }

  projectData = project;
  viewer = new Marzipano.Viewer(panoElement, {
    controls: {
      mouseViewMode: project.settings?.mouseViewMode || 'drag'
    }
  });
  activeViewer = viewer;
  runtimeUi.syncFullscreenButton(project);
  runtimeFloorplan.loadProject(project);
  activeGroupId = project.activeGroupId || project.groups?.[0]?.id || null;

  scenes = project.scenes.map((sceneData) => {
    const runtime = buildSceneRuntime(sceneData);
    if (!runtime) return null;
    const source = runtime.source;
    const geometry = runtime.geometry;
    const limiter = runtime.limiter;
    const view = new Marzipano.RectilinearView(sceneData.initialViewParameters || { yaw: 0, pitch: 0, fov: 1.4 }, limiter);
    const scene = viewer.createScene({ source, geometry, view, pinFirstLevel: true });
    const hotspotElements = [];

    (sceneData.hotspots || []).forEach((hotspot) => {
      const element = runtimeHotspots.createHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
      hotspotElements.push(element);
    });

    view.addEventListener('change', () => {
      clampSceneViewFov(view, sceneData);
      applyHotspotScale({ view, hotspotElements });
    });

    return { data: sceneData, scene, view, hotspotElements };
  }).filter(Boolean);

  renderGroupList();
  renderFloorplan();
  const firstScene = getPreferredSceneForGroup(activeGroupId) || scenes[0];
  if (firstScene) {
    switchScene(firstScene, { syncGroup: true });
  } else {
    renderSceneList();
  }
  renderHomePage(project);
  requestAnimationFrame(refreshViewerLayout);
}

function buildVrViewers(project) {
  if (vrViewers || !window.Marzipano) return;

  const leftViewer = new Marzipano.Viewer(panoLeft, {
    controls: {
      mouseViewMode: project.settings?.mouseViewMode || 'drag'
    }
  });
  const rightViewer = new Marzipano.Viewer(panoRight, {
    controls: {
      mouseViewMode: project.settings?.mouseViewMode || 'drag'
    }
  });

  const leftScenes = project.scenes.map((sceneData) => {
    const runtime = buildSceneRuntime(sceneData);
    if (!runtime) return null;
    const source = runtime.source;
    const geometry = runtime.geometry;
    const limiter = runtime.limiter;
    const view = new Marzipano.RectilinearView(sceneData.initialViewParameters || { yaw: 0, pitch: 0, fov: 1.4 }, limiter);
    const scene = leftViewer.createScene({ source, geometry, view, pinFirstLevel: true });
    return { data: sceneData, scene, view };
  }).filter(Boolean);

  const rightScenes = project.scenes.map((sceneData) => {
    const runtime = buildSceneRuntime(sceneData);
    if (!runtime) return null;
    const source = runtime.source;
    const geometry = runtime.geometry;
    const limiter = runtime.limiter;
    const view = new Marzipano.RectilinearView(sceneData.initialViewParameters || { yaw: 0, pitch: 0, fov: 1.4 }, limiter);
    const scene = rightViewer.createScene({ source, geometry, view, pinFirstLevel: true });
    return { data: sceneData, scene, view };
  }).filter(Boolean);

  vrViewers = { leftViewer, rightViewer, leftScenes, rightScenes };

  leftScenes.forEach((scene, index) => {
    scene.view.addEventListener('change', () => {
      clampSceneViewFov(scene.view, scene.data);
      const params = scene.view.parameters();
      rightScenes[index].view.setParameters(params);
      clampSceneViewFov(rightScenes[index].view, rightScenes[index].data);
    });
  });
}

function buildSceneRuntime(sceneData) {
  if (sceneData?.sourceImage?.dataUrl) {
    const width = sceneData.sourceImage.width || sceneData.faceSize || 4096;
    return {
      source: Marzipano.ImageUrlSource.fromString(sceneData.sourceImage.dataUrl),
      geometry: new Marzipano.EquirectGeometry([{ width }]),
      limiter: buildSceneLimiter(sceneData)
    };
  }

  const levels = (sceneData.levels || []).filter((level) => level.size && level.tileSize);
  const hasSelectable = levels.some((level) => !level.fallbackOnly);
  if (levels.length && hasSelectable) {
    const tilesPath = sceneData.tilesPath || `tiles/${sceneData.id}`;
    const previewPath = sceneData.previewPath || `${tilesPath}/preview.jpg`;
    return {
      source: Marzipano.ImageUrlSource.fromString(
        `${tilesPath}/{z}/{f}/{y}/{x}.jpg`,
        { cubeMapPreviewUrl: previewPath }
      ),
      geometry: new Marzipano.CubeGeometry(levels),
      limiter: buildSceneLimiter(sceneData)
    };
  }

  return null;
}

function renderGroupList() {
  if (groupSelect) {
    groupSelect.innerHTML = '';
    (projectData?.groups || []).forEach((group) => {
      const option = document.createElement('option');
      option.value = group.id;
      option.textContent = group.name || 'Group';
      groupSelect.appendChild(option);
    });
  }

  if (groupListMobile) {
    groupListMobile.innerHTML = '';
    (projectData?.groups || []).forEach((group) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = group.name || 'Group';
      button.classList.toggle('active', activeGroupId === group.id);
      button.addEventListener('click', () => handleGroupSelectionChange(group.id));
      groupListMobile.appendChild(button);
    });
  }

  if (groupSelect && activeGroupId && groupSelect.querySelector(`option[value="${activeGroupId}"]`)) {
    groupSelect.value = activeGroupId;
  } else if (groupSelect?.options.length) {
    activeGroupId = groupSelect.options[0].value;
    groupSelect.value = activeGroupId;
  }
}

function normalizeFloorplanColorKey(key) {
  return Object.prototype.hasOwnProperty.call(FLOORPLAN_COLOR_MAP, key) ? key : 'yellow';
}

function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '');
  const value = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  if (!/^[0-9a-f]{6}$/i.test(value)) return { r: 240, g: 200, b: 75 };
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  };
}

function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

function darkenHex(hex, ratio = 0.24) {
  const rgb = hexToRgb(hex);
  const k = Math.max(0, Math.min(1, 1 - ratio));
  return rgbToHex(rgb.r * k, rgb.g * k, rgb.b * k);
}

function withAlpha(hex, alpha = 0.35) {
  const rgb = hexToRgb(hex);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

function getActiveFloorplanZoom() {
  return runtimeFloorplan.getActiveZoom();
}

function toggleFullscreen() {
  runtimeUi.toggleFullscreen(projectData);
}

function setActiveFloorplanZoom(nextZoom, options = {}) {
  runtimeFloorplan.setActiveZoom(nextZoom, options);
}

function findSceneRuntimeById(sceneId) {
  return scenes.find((scene) => scene.data.id === sceneId) || null;
}

function getGroupById(groupId) {
  return (projectData?.groups || []).find((group) => group.id === groupId) || null;
}

function getPreferredSceneForGroup(groupId) {
  const groupScenes = scenes.filter((scene) => scene.data.groupId === groupId);
  if (!groupScenes.length) return null;
  const group = getGroupById(groupId);
  const preferred = groupScenes.find((scene) => scene.data.id === group?.mainSceneId);
  return preferred || groupScenes[0];
}

function resetFloorplanView() {
  runtimeFloorplan.resetView();
}

function renderFloorplanMarkers() {
  runtimeFloorplan.renderMarkers();
}

function renderFloorplan() {
  runtimeFloorplan.render();
}

function renderSceneList() {
  sceneList.innerHTML = '';
  const visibleScenes = scenes.filter((scene) => !activeGroupId || scene.data.groupId === activeGroupId);

  if (!visibleScenes.length) {
    const empty = document.createElement('div');
    empty.className = 'muted-note';
    empty.textContent = 'No scenes in this group.';
    sceneList.appendChild(empty);
    return;
  }

  visibleScenes.forEach((scene) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = String(scene.data.alias || '').trim() || scene.data.name;
    button.classList.toggle('active', currentScene?.data?.id === scene.data.id);
    button.addEventListener('click', () => switchScene(scene));
    sceneList.appendChild(button);
  });
}

function switchScene(scene, options = {}) {
  if (!scene) return;
  runtimeHotspots.hideSceneLinkTooltip();
  if (modal?.classList.contains('visible')) {
    runtimeHotspots.closeModal();
  }
  if (isMobileViewerLayout()) {
    runtimePanels?.close();
  }
  const syncGroup = options.syncGroup !== false;
  currentScene = scene;

  if (syncGroup && scene.data.groupId && scene.data.groupId !== activeGroupId) {
    activeGroupId = scene.data.groupId;
    if (groupSelect) {
      groupSelect.value = activeGroupId;
    }
    renderGroupList();
    renderFloorplan();
  }

  scene.view.setParameters(scene.data.initialViewParameters || { yaw: 0, pitch: 0, fov: 1.4 });
  clampSceneViewFov(scene.view, scene.data);
  scene.scene.switchTo();
  applyHotspotScale(scene);
  renderSceneList();
  renderFloorplanMarkers();

  if (vrViewers) {
    const leftScene = vrViewers.leftScenes.find((item) => item.data.id === scene.data.id);
    const rightScene = vrViewers.rightScenes.find((item) => item.data.id === scene.data.id);
    if (leftScene && rightScene) {
      leftScene.view.setParameters(scene.data.initialViewParameters || { yaw: 0, pitch: 0, fov: 1.4 });
      rightScene.view.setParameters(scene.data.initialViewParameters || { yaw: 0, pitch: 0, fov: 1.4 });
      clampSceneViewFov(leftScene.view, leftScene.data);
      clampSceneViewFov(rightScene.view, rightScene.data);
      leftScene.scene.switchTo();
      rightScene.scene.switchTo();
    }
  }
}

function applyHotspotScale(scene) {
  if (!scene?.hotspotElements?.length) return;
  const fov = scene.view.fov ? scene.view.fov() : (scene.view.parameters?.().fov || 1.4);
  const scale = Math.max(0.5, Math.min(0.95, 1.0 / Math.max(fov, 0.1)));
  scene.hotspotElements.forEach((el) => {
    el.style.setProperty('--hotspot-scale', String(scale));
  });
}

function enterVr() {
  if (window.screenfull?.isEnabled) {
    screenfull.toggle();
    document.body.classList.toggle('vr-mode');
  }

  if (!vrViewers && projectData) {
    buildVrViewers(projectData);
  }

  if (vrViewers && currentScene) {
    const leftScene = vrViewers.leftScenes.find((item) => item.data.id === currentScene.data.id);
    const rightScene = vrViewers.rightScenes.find((item) => item.data.id === currentScene.data.id);
    if (leftScene && rightScene) {
      leftScene.view.setParameters(currentScene.view.parameters());
      rightScene.view.setParameters(currentScene.view.parameters());
      leftScene.scene.switchTo();
      rightScene.scene.switchTo();
      activeViewer = vrViewers.leftViewer;
    }
  } else {
    activeViewer = viewer;
  }

  if (!navigator.xr) {
    runtimeHotspots.openModal({
      title: 'VR Mode',
      contentBlocks: [
        { type: 'text', value: 'WebXR is not available in this browser. Cardboard mode uses fullscreen only.' }
      ]
    });
    return;
  }

  navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
    if (!supported) {
      runtimeHotspots.openModal({
        title: 'VR Mode',
        contentBlocks: [
          { type: 'text', value: 'Immersive VR is not supported on this device.' }
        ]
      });
      return;
    }

    navigator.xr.requestSession('immersive-vr').then((session) => {
      runtimeHotspots.openModal({
        title: 'VR Mode',
        contentBlocks: [
          {
            type: 'text',
            value:
              'WebXR session started. Stereoscopic rendering integration is in progress.'
          }
        ]
      });

      session.addEventListener('end', () => {
        // session ended
      });

      // End immediately to avoid keeping a blank XR session active for now.
      session.end();
    });
  });
}

fetch(sampleTourUrl)
  .then((res) => res.json())
  .then((project) => {
    const normalizedProject = normalizeProject(project);
    resolveAssetPaths(normalizedProject);
    buildViewer(normalizedProject);
  })
  .catch(() => {
    const normalizedProject = normalizeProject(fallbackProject);
    resolveAssetPaths(normalizedProject);
    buildViewer(normalizedProject);
  });

btnGyro.addEventListener('click', () => runtimeGyro.toggleGyro());
btnReset.addEventListener('click', () => runtimeGyro.resetOrientation());
btnVr.addEventListener('click', enterVr);
btnFullscreen?.addEventListener('click', toggleFullscreen);
btnFullscreenExit?.addEventListener('click', toggleFullscreen);
function handleGroupSelectionChange(nextGroupId) {
  activeGroupId = nextGroupId;
  if (groupSelect) {
    groupSelect.value = activeGroupId;
  }
  renderFloorplan();
  renderGroupList();
  const firstSceneInGroup = getPreferredSceneForGroup(activeGroupId);
  if (firstSceneInGroup) {
    switchScene(firstSceneInGroup, { syncGroup: false });
  } else {
    currentScene = null;
    renderSceneList();
  }
}

groupSelect?.addEventListener('change', () => handleGroupSelectionChange(groupSelect.value));
btnHomePageStart?.addEventListener('click', startTourFromHomePage);
btnHomeToggle?.addEventListener('click', toggleHomePageOverlay);
[panoElement, panoLeft, panoRight].filter(Boolean).forEach((element) => {
  element.addEventListener('touchmove', (event) => {
    if (!shouldUseMobileSceneZoomPolicy()) return;
    if (event.touches.length > 1) {
      event.preventDefault();
    }
  }, { passive: false });
});
window.screenfull?.on?.('change', () => {
  runtimeUi.syncFullscreenButton(projectData);
  requestAnimationFrame(refreshViewerLayout);
});
document.addEventListener('fullscreenchange', () => {
  runtimeUi.syncFullscreenButton(projectData);
  requestAnimationFrame(refreshViewerLayout);
});
document.addEventListener('webkitfullscreenchange', () => {
  runtimeUi.syncFullscreenButton(projectData);
  requestAnimationFrame(refreshViewerLayout);
});
runtimeFloorplan.updateExpandButton();
runtimePanels?.updateUi();
runtimeUi.syncFullscreenButton(projectData);
runtimeUi.updateFullscreenUiState();
refreshViewerLayout();
window.addEventListener('resize', () => {
  if (!isMobileViewerLayout()) {
    runtimePanels?.close();
  } else {
    runtimePanels?.updateUi();
  }
  refreshViewerLayout();
  runtimeHotspots.refreshFloatingUi();
  if (homePageVisible) {
    applyHomePageFrame(projectData);
  }
});
window.addEventListener('orientationchange', () => {
  setTimeout(refreshViewerLayout, 80);
});
