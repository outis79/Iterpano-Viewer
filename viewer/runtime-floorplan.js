(function () {
  function createViewerFloorplanController(options) {
    const {
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
      floorplanColorMap,
      floorplanMinZoom,
      floorplanMaxZoom,
      getActiveGroupId,
      getCurrentScene,
      isMobileViewerLayout,
      findSceneRuntimeById,
      onSelectScene,
      normalizeFloorplanColorKey,
      darkenHex,
      withAlpha,
    } = options;

    let floorplansByGroup = new Map();
    let floorplanZoomByGroup = new Map();
    let floorplanMinZoomByGroup = new Map();
    let floorplanExpanded = false;
    let floorplanPanState = null;
    let floorplanTouchState = null;

    function getActiveFloorplan() {
      const activeGroupId = getActiveGroupId();
      if (!activeGroupId) return null;
      return floorplansByGroup.get(activeGroupId) || null;
    }

    function getActiveFloorplanZoom() {
      const activeGroupId = getActiveGroupId();
      if (!activeGroupId) return 1;
      const value = floorplanZoomByGroup.get(activeGroupId);
      return Number.isFinite(value) ? value : 1;
    }

    function updateFloorplanZoomLabel() {
      if (!floorplanZoomValue) return;
      floorplanZoomValue.textContent = `${Math.round(getActiveFloorplanZoom() * 100)}%`;
    }

    function applyFloorplanZoom() {
      if (!floorplanStage) return;
      floorplanStage.style.setProperty('--floorplan-zoom', String(getActiveFloorplanZoom()));
      updateFloorplanZoomLabel();
    }

    function clampFloorplanScroll() {
      if (!floorplanWrap) return;
      const maxLeft = Math.max(0, floorplanWrap.scrollWidth - floorplanWrap.clientWidth);
      const maxTop = Math.max(0, floorplanWrap.scrollHeight - floorplanWrap.clientHeight);
      floorplanWrap.scrollLeft = Math.min(maxLeft, Math.max(0, floorplanWrap.scrollLeft));
      floorplanWrap.scrollTop = Math.min(maxTop, Math.max(0, floorplanWrap.scrollTop));
    }

    function getActiveFloorplanMinZoom() {
      const activeGroupId = getActiveGroupId();
      if (!activeGroupId) return floorplanMinZoom;
      const value = floorplanMinZoomByGroup.get(activeGroupId);
      return Number.isFinite(value) ? value : floorplanMinZoom;
    }

    function getFloorplanFitZoom() {
      if (!floorplanWrap || !floorplanImage) return 1;
      const naturalWidth = floorplanImage.naturalWidth || floorplanImage.width || 1;
      const naturalHeight = floorplanImage.naturalHeight || floorplanImage.height || 1;
      const wrapWidth = Math.max(1, floorplanWrap.clientWidth);
      const wrapHeight = Math.max(1, floorplanWrap.clientHeight);
      const renderedWidthAtZoomOne = wrapWidth;
      const renderedHeightAtZoomOne = renderedWidthAtZoomOne * (naturalHeight / naturalWidth);
      const fitByWidth = 1;
      const fitByHeight = wrapHeight / Math.max(1, renderedHeightAtZoomOne);
      const fitZoom = Math.min(fitByWidth, fitByHeight);
      return Math.max(floorplanMinZoom, Math.min(floorplanMaxZoom, fitZoom));
    }

    function updateActiveFloorplanMinZoom() {
      const activeGroupId = getActiveGroupId();
      if (!activeGroupId) return floorplanMinZoom;
      const fitZoom = getFloorplanFitZoom();
      floorplanMinZoomByGroup.set(activeGroupId, fitZoom);
      return fitZoom;
    }

    function zoomFloorplanTo(nextZoom, options = {}) {
      const activeGroupId = getActiveGroupId();
      if (!activeGroupId) return;
      const oldZoom = getActiveFloorplanZoom();
      const minZoom = isMobileViewerLayout() ? getActiveFloorplanMinZoom() : floorplanMinZoom;
      const clamped = Math.min(floorplanMaxZoom, Math.max(minZoom, nextZoom));
      if (!Number.isFinite(clamped)) return;
      if (!floorplanWrap || !floorplanStage || Math.abs(clamped - oldZoom) < 0.0001) {
        floorplanZoomByGroup.set(activeGroupId, clamped);
        applyFloorplanZoom();
        return;
      }

      const wrapRect = floorplanWrap.getBoundingClientRect();
      const localX = Number.isFinite(options.clientX) ? (options.clientX - wrapRect.left) : floorplanWrap.clientWidth / 2;
      const localY = Number.isFinite(options.clientY) ? (options.clientY - wrapRect.top) : floorplanWrap.clientHeight / 2;
      const baseX = (floorplanWrap.scrollLeft + localX) / oldZoom;
      const baseY = (floorplanWrap.scrollTop + localY) / oldZoom;

      floorplanZoomByGroup.set(activeGroupId, clamped);
      applyFloorplanZoom();

      floorplanWrap.scrollLeft = (baseX * clamped) - localX;
      floorplanWrap.scrollTop = (baseY * clamped) - localY;
      clampFloorplanScroll();
    }

    function setActiveFloorplanZoom(nextZoom, options = {}) {
      zoomFloorplanTo(nextZoom, options);
    }

    function resetFloorplanView() {
      const nextZoom = isMobileViewerLayout() ? updateActiveFloorplanMinZoom() : 1;
      setActiveFloorplanZoom(nextZoom);
      if (floorplanWrap) {
        floorplanWrap.scrollLeft = 0;
        floorplanWrap.scrollTop = 0;
        clampFloorplanScroll();
      }
    }

    function updateFloorplanExpandButton() {
      if (!btnFloorplanExpand) return;
      btnFloorplanExpand.textContent = floorplanExpanded ? 'Minimise' : 'Maximise';
      btnFloorplanExpand.setAttribute('aria-pressed', floorplanExpanded ? 'true' : 'false');
    }

    function setFloorplanExpanded(next) {
      floorplanExpanded = Boolean(next);
      floorplanPanel?.classList.toggle('maximized', floorplanExpanded);
      updateFloorplanExpandButton();
    }

    function toggleFloorplanExpanded() {
      setFloorplanExpanded(!floorplanExpanded);
    }

    function renderFloorplanMarkers() {
      if (!floorplanMarkers) return;
      floorplanMarkers.innerHTML = '';

      const activeGroupId = getActiveGroupId();
      const floorplan = getActiveFloorplan();
      const fallbackColorKey = normalizeFloorplanColorKey(floorplan?.markerColorKey || 'yellow');
      const nodes = floorplan?.nodes || [];
      if (!nodes.length) {
        floorplanMarkers.classList.add('hidden');
        return;
      }

      nodes.forEach((node) => {
        const targetScene = findSceneRuntimeById(node.sceneId);
        if (!targetScene || targetScene.data.groupId !== activeGroupId) {
          return;
        }

        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = 'floorplan-scene-marker';
        if (targetScene.data.id === getCurrentScene()?.data?.id) {
          marker.classList.add('active');
        }
        marker.style.left = `${node.x * 100}%`;
        marker.style.top = `${node.y * 100}%`;
        marker.title = String(targetScene.data.alias || '').trim() || targetScene.data.name || 'Scene';
        const markerColor = floorplanColorMap[normalizeFloorplanColorKey(node.colorKey || fallbackColorKey)];
        marker.style.setProperty('--floorplan-marker-color', markerColor);
        marker.style.setProperty('--floorplan-marker-border', darkenHex(markerColor, 0.24));
        marker.style.setProperty('--floorplan-marker-ring', withAlpha(markerColor, 0.35));
        marker.style.touchAction = 'manipulation';
        marker.addEventListener('click', () => onSelectScene(targetScene));
        marker.addEventListener('pointerup', (event) => {
          if (event.pointerType === 'touch' || event.pointerType === 'pen') {
            event.preventDefault();
            onSelectScene(targetScene);
          }
        });
        floorplanMarkers.appendChild(marker);
      });

      floorplanMarkers.classList.toggle('hidden', !floorplanMarkers.childElementCount);
    }

    function renderFloorplan() {
      if (!floorplanImage || !floorplanEmpty || !floorplanMarkers || !floorplanStage) return;
      const floorplan = getActiveFloorplan();
      const floorplanPath = floorplan?.path || '';
      const setZoomButtonsState = (disabled) => {
        if (btnFloorplanZoomOut) btnFloorplanZoomOut.disabled = disabled;
        if (btnFloorplanZoomIn) btnFloorplanZoomIn.disabled = disabled;
        if (btnFloorplanZoomReset) btnFloorplanZoomReset.disabled = disabled;
      };
      if (!floorplanPath) {
        setZoomButtonsState(true);
        floorplanStage.classList.add('hidden');
        floorplanImage.classList.add('hidden');
        floorplanImage.removeAttribute('src');
        floorplanMarkers.classList.add('hidden');
        floorplanMarkers.innerHTML = '';
        floorplanEmpty.classList.add('hidden');
        updateFloorplanZoomLabel();
        return;
      }

      setZoomButtonsState(false);
      floorplanStage.classList.remove('hidden');
      floorplanImage.src = floorplanPath;
      floorplanImage.classList.remove('hidden');
      floorplanEmpty.classList.add('hidden');
      applyFloorplanZoom();
      renderFloorplanMarkers();

      const handleFloorplanReady = () => {
        if (isMobileViewerLayout()) {
          resetFloorplanView();
        } else {
          clampFloorplanScroll();
        }
      };
      if (floorplanImage.complete) {
        requestAnimationFrame(handleFloorplanReady);
      } else {
        floorplanImage.onload = () => requestAnimationFrame(handleFloorplanReady);
      }
    }

    function getTouchCenter(touchA, touchB) {
      return {
        x: (touchA.clientX + touchB.clientX) / 2,
        y: (touchA.clientY + touchB.clientY) / 2,
      };
    }

    function getTouchDistance(touchA, touchB) {
      const dx = touchA.clientX - touchB.clientX;
      const dy = touchA.clientY - touchB.clientY;
      return Math.hypot(dx, dy);
    }

    function endFloorplanPan(event) {
      if (!floorplanPanState) return;
      if (event && floorplanPanState.pointerId !== event.pointerId) return;
      floorplanWrap?.classList.remove('dragging');
      floorplanWrap?.releasePointerCapture?.(floorplanPanState.pointerId);
      floorplanPanState = null;
    }

    function refreshLayout(options = {}) {
      const activeGroupId = getActiveGroupId();
      if (
        isMobileViewerLayout() &&
        options.mobilePanelMode === 'map' &&
        activeGroupId &&
        floorplanWrap &&
        floorplanStage &&
        !floorplanStage.classList.contains('hidden')
      ) {
        const minZoom = updateActiveFloorplanMinZoom();
        const currentZoom = getActiveFloorplanZoom();
        if (currentZoom < minZoom) {
          setActiveFloorplanZoom(minZoom);
        } else {
          applyFloorplanZoom();
          clampFloorplanScroll();
        }
      }
    }

    function bindEvents() {
      btnFloorplanZoomOut?.addEventListener('click', () => {
        setActiveFloorplanZoom(getActiveFloorplanZoom() - 0.1);
      });
      btnFloorplanZoomIn?.addEventListener('click', () => {
        setActiveFloorplanZoom(getActiveFloorplanZoom() + 0.1);
      });
      btnFloorplanZoomReset?.addEventListener('click', () => {
        resetFloorplanView();
      });
      btnFloorplanExpand?.addEventListener('click', toggleFloorplanExpanded);

      floorplanWrap?.addEventListener('wheel', (event) => {
        if (!floorplanStage || floorplanStage.classList.contains('hidden')) return;
        event.preventDefault();
        const direction = event.deltaY < 0 ? 1 : -1;
        const step = event.ctrlKey ? 0.2 : 0.12;
        setActiveFloorplanZoom(getActiveFloorplanZoom() + (direction * step), { clientX: event.clientX, clientY: event.clientY });
      }, { passive: false });

      floorplanWrap?.addEventListener('pointerdown', (event) => {
        if (event.pointerType !== 'mouse' || event.button !== 0) return;
        if (event.target instanceof Element && event.target.closest('.floorplan-scene-marker')) return;
        if (!floorplanStage || floorplanStage.classList.contains('hidden')) return;
        floorplanPanState = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          startLeft: floorplanWrap.scrollLeft,
          startTop: floorplanWrap.scrollTop,
        };
        floorplanWrap.classList.add('dragging');
        floorplanWrap.setPointerCapture?.(event.pointerId);
        event.preventDefault();
      });

      floorplanWrap?.addEventListener('pointermove', (event) => {
        if (!floorplanPanState || floorplanPanState.pointerId !== event.pointerId) return;
        const dx = event.clientX - floorplanPanState.startX;
        const dy = event.clientY - floorplanPanState.startY;
        floorplanWrap.scrollLeft = floorplanPanState.startLeft - dx;
        floorplanWrap.scrollTop = floorplanPanState.startTop - dy;
        clampFloorplanScroll();
      });

      floorplanWrap?.addEventListener('pointerup', endFloorplanPan);
      floorplanWrap?.addEventListener('pointercancel', endFloorplanPan);

      floorplanWrap?.addEventListener('touchstart', (event) => {
        if (!isMobileViewerLayout()) return;
        if (!floorplanStage || floorplanStage.classList.contains('hidden')) return;
        if (event.target instanceof Element && event.target.closest('.floorplan-scene-marker')) return;
        const touches = event.touches;
        if (touches.length === 1) {
          floorplanTouchState = {
            mode: 'pan',
            startX: touches[0].clientX,
            startY: touches[0].clientY,
            startLeft: floorplanWrap.scrollLeft,
            startTop: floorplanWrap.scrollTop,
          };
        } else if (touches.length >= 2) {
          const center = getTouchCenter(touches[0], touches[1]);
          const wrapRect = floorplanWrap.getBoundingClientRect();
          floorplanTouchState = {
            mode: 'pinch',
            startDistance: getTouchDistance(touches[0], touches[1]),
            startZoom: getActiveFloorplanZoom(),
            baseX: (floorplanWrap.scrollLeft + (center.x - wrapRect.left)) / getActiveFloorplanZoom(),
            baseY: (floorplanWrap.scrollTop + (center.y - wrapRect.top)) / getActiveFloorplanZoom(),
          };
        }
      }, { passive: true });

      floorplanWrap?.addEventListener('touchmove', (event) => {
        if (!isMobileViewerLayout() || !floorplanTouchState) return;
        if (!floorplanStage || floorplanStage.classList.contains('hidden')) return;
        const touches = event.touches;
        if (floorplanTouchState.mode === 'pan' && touches.length === 1) {
          const dx = touches[0].clientX - floorplanTouchState.startX;
          const dy = touches[0].clientY - floorplanTouchState.startY;
          floorplanWrap.scrollLeft = floorplanTouchState.startLeft - dx;
          floorplanWrap.scrollTop = floorplanTouchState.startTop - dy;
          clampFloorplanScroll();
          event.preventDefault();
          return;
        }
        if (touches.length >= 2) {
          if (floorplanTouchState.mode !== 'pinch') {
            const center = getTouchCenter(touches[0], touches[1]);
            const wrapRect = floorplanWrap.getBoundingClientRect();
            floorplanTouchState = {
              mode: 'pinch',
              startDistance: getTouchDistance(touches[0], touches[1]),
              startZoom: getActiveFloorplanZoom(),
              baseX: (floorplanWrap.scrollLeft + (center.x - wrapRect.left)) / getActiveFloorplanZoom(),
              baseY: (floorplanWrap.scrollTop + (center.y - wrapRect.top)) / getActiveFloorplanZoom(),
            };
          }
          const distance = getTouchDistance(touches[0], touches[1]);
          const nextZoom = floorplanTouchState.startZoom * (distance / Math.max(1, floorplanTouchState.startDistance));
          const wrapRect = floorplanWrap.getBoundingClientRect();
          const center = getTouchCenter(touches[0], touches[1]);
          const localX = center.x - wrapRect.left;
          const localY = center.y - wrapRect.top;
          const minZoom = isMobileViewerLayout() ? getActiveFloorplanMinZoom() : floorplanMinZoom;
          const clamped = Math.min(floorplanMaxZoom, Math.max(minZoom, nextZoom));
          floorplanZoomByGroup.set(getActiveGroupId(), clamped);
          applyFloorplanZoom();
          floorplanWrap.scrollLeft = (floorplanTouchState.baseX * clamped) - localX;
          floorplanWrap.scrollTop = (floorplanTouchState.baseY * clamped) - localY;
          clampFloorplanScroll();
          event.preventDefault();
        }
      }, { passive: false });

      floorplanWrap?.addEventListener('touchend', (event) => {
        if (!isMobileViewerLayout()) return;
        const touches = event.touches;
        if (!touches.length) {
          floorplanTouchState = null;
          return;
        }
        if (touches.length === 1) {
          floorplanTouchState = {
            mode: 'pan',
            startX: touches[0].clientX,
            startY: touches[0].clientY,
            startLeft: floorplanWrap.scrollLeft,
            startTop: floorplanWrap.scrollTop,
          };
        }
      });

      floorplanWrap?.addEventListener('touchcancel', () => {
        floorplanTouchState = null;
      });
    }

    function loadProject(project) {
      floorplansByGroup = new Map();
      floorplanZoomByGroup = new Map();
      floorplanMinZoomByGroup = new Map();
      (project.minimap?.floorplans || []).forEach((floorplan) => {
        if (!floorplansByGroup.has(floorplan.groupId) && floorplan.path) {
          floorplansByGroup.set(floorplan.groupId, floorplan);
        }
      });
    }

    bindEvents();
    updateFloorplanExpandButton();

    return {
      loadProject,
      render: renderFloorplan,
      renderMarkers: renderFloorplanMarkers,
      refreshLayout,
      resetView: resetFloorplanView,
      setActiveZoom: setActiveFloorplanZoom,
      getActiveZoom: getActiveFloorplanZoom,
      updateExpandButton: updateFloorplanExpandButton,
    };
  }

  window.IterpanoRuntimeFloorplan = {
    createViewerFloorplanController,
  };
})();
