(function () {
  function createViewerHotspotsController(options) {
    const {
      modal,
      modalContent,
      modalTitle,
      modalBody,
      closeModalButton,
      sceneLinkTooltip,
      floorplanColorMap,
      defaultInfoBgColorKey,
      defaultInfoFrameLeft,
      defaultInfoFrameTop,
      defaultInfoFrameHotspotOffsetX,
      defaultInfoFrameHotspotOffsetY,
      minInfoFrameWidth,
      minInfoFrameHeight,
      getProjectData,
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
    } = options;

    let activeInfoHotspot = null;
    let activeInfoHotspotElement = null;
    let activeInfoHotspotAnchorOffset = null;
    let infoModalDragState = null;
    let activeSceneLinkTooltipElement = null;
    let quickInfoHoverHotspot = null;
    let quickInfoHoverElement = null;
    let quickInfoHoverTimer = null;
    let quickInfoCloseTimer = null;
    let quickInfoModalHover = false;

    function getHotspotViewportPoint(element) {
      if (!(element instanceof Element)) return null;
      const rect = element.getBoundingClientRect();
      if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return null;
      return {
        x: rect.left + (rect.width / 2),
        y: rect.top + (rect.height / 2),
      };
    }

    function getInfoModalAnchorOffset(hotspot) {
      const sessionOffset = normalizeInfoFrameAnchorOffset(activeInfoHotspotAnchorOffset);
      if (sessionOffset) return sessionOffset;
      const savedOffset = normalizeInfoFrameAnchorOffset(hotspot?.infoFrameAnchorOffset);
      if (savedOffset) return savedOffset;
      return {
        offsetX: defaultInfoFrameHotspotOffsetX,
        offsetY: defaultInfoFrameHotspotOffsetY,
      };
    }

    function updateInfoModalAnchorOffsetFromCurrentPosition() {
      if (!activeInfoHotspot || !activeInfoHotspotElement || !modalContent) return;
      const hotspotPoint = getHotspotViewportPoint(activeInfoHotspotElement);
      if (!hotspotPoint) return;
      const rect = modalContent.getBoundingClientRect();
      activeInfoHotspotAnchorOffset = normalizeInfoFrameAnchorOffset({
        offsetX: rect.left - hotspotPoint.x,
        offsetY: rect.top - hotspotPoint.y,
      });
    }

    function stopInfoModalDrag() {
      if (!infoModalDragState) return;
      infoModalDragState = null;
      window.removeEventListener('pointermove', handleInfoModalDragMove);
      window.removeEventListener('pointerup', stopInfoModalDrag);
      window.removeEventListener('pointercancel', stopInfoModalDrag);
      updateInfoModalAnchorOffsetFromCurrentPosition();
    }

    function handleInfoModalDragMove(event) {
      if (!infoModalDragState || !modalContent) return;
      const deltaX = event.clientX - infoModalDragState.startX;
      const deltaY = event.clientY - infoModalDragState.startY;
      const width = modalContent.offsetWidth || 0;
      const height = modalContent.offsetHeight || 0;
      const maxLeft = Math.max(8, window.innerWidth - width - 8);
      const maxTop = Math.max(8, window.innerHeight - height - 8);
      const nextLeft = Math.min(maxLeft, Math.max(8, infoModalDragState.startLeft + deltaX));
      const nextTop = Math.min(maxTop, Math.max(8, infoModalDragState.startTop + deltaY));
      modalContent.style.left = `${Math.round(nextLeft)}px`;
      modalContent.style.top = `${Math.round(nextTop)}px`;
      updateInfoModalAnchorOffsetFromCurrentPosition();
    }

    function maybeStartInfoModalDrag(event) {
      if (!modal?.classList.contains('visible')) return false;
      if (!modal?.classList.contains('preview-modal-rich-like')) return false;
      if (!modalContent || event.button !== 0) return false;
      if (event.target instanceof Element && event.target.closest('#btn-close-modal')) return false;
      const rect = modalContent.getBoundingClientRect();
      const withinDragZone = (event.clientY - rect.top) <= 20;
      if (!withinDragZone) return false;
      infoModalDragState = {
        startX: event.clientX,
        startY: event.clientY,
        startLeft: rect.left,
        startTop: rect.top,
      };
      event.preventDefault();
      event.stopPropagation();
      window.addEventListener('pointermove', handleInfoModalDragMove);
      window.addEventListener('pointerup', stopInfoModalDrag);
      window.addEventListener('pointercancel', stopInfoModalDrag);
      return true;
    }

    function resetInfoModalFrameSize() {
      if (!modalContent || !modalBody) return;
      modalContent.style.removeProperty('width');
      modalContent.style.removeProperty('height');
      modalContent.style.removeProperty('left');
      modalContent.style.removeProperty('top');
      modalBody.style.removeProperty('height');
      modalBody.style.removeProperty('max-height');
      modalBody.style.removeProperty('background-color');
      modalBody.style.removeProperty('border-color');
      closeModalButton?.style.removeProperty('color');
      closeModalButton?.style.removeProperty('border-color');
      modal?.classList.remove('preview-modal-rich-like');
      modalContent.classList.remove('modal-content-rich-preview');
      modalBody.classList.remove('preview-rich-surface');
    }

    function applyInfoModalVisualStyle(hotspot) {
      if (!modalBody) return;
      const visualStyle = getFrameVisualStyle(hotspot);
      const backgroundHex = floorplanColorMap[visualStyle.backgroundColorKey] || floorplanColorMap[defaultInfoBgColorKey];
      const borderColorKey = normalizeFloorplanColorKey(hotspot?.markerColorKey || visualStyle.backgroundColorKey || defaultInfoBgColorKey);
      const borderHex = floorplanColorMap[borderColorKey] || floorplanColorMap[defaultInfoBgColorKey];
      const alpha = (100 - visualStyle.backgroundTransparency) / 100;
      modalBody.style.backgroundColor = withAlpha(backgroundHex, alpha);
      modalBody.style.borderColor = borderHex;
      if (closeModalButton) {
        closeModalButton.style.color = borderHex;
        closeModalButton.style.borderColor = 'transparent';
      }
    }

    function measureRichInfoModalFrame(maxWidth, maxHeight) {
      if (!modalBody || !document.body) return null;
      if (!modalBody.classList.contains('preview-rich-surface')) return null;
      if (!modalBody.childNodes.length) return null;
      const measurer = document.createElement('div');
      measurer.className = 'modal-body preview-rich-surface';
      measurer.style.position = 'fixed';
      measurer.style.left = '-20000px';
      measurer.style.top = '0';
      measurer.style.visibility = 'hidden';
      measurer.style.pointerEvents = 'none';
      measurer.style.width = 'fit-content';
      measurer.style.height = 'auto';
      measurer.style.maxWidth = `${Math.max(minInfoFrameWidth, maxWidth)}px`;
      measurer.style.maxHeight = 'none';
      measurer.style.overflow = 'visible';
      modalBody.childNodes.forEach((node) => {
        measurer.appendChild(node.cloneNode(true));
      });
      document.body.appendChild(measurer);
      const rect = measurer.getBoundingClientRect();
      measurer.remove();
      if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return null;
      return {
        width: Math.max(minInfoFrameWidth, Math.min(Math.ceil(rect.width), maxWidth)),
        height: Math.max(minInfoFrameHeight, Math.min(Math.ceil(rect.height), maxHeight)),
      };
    }

    function scheduleInfoModalFrameRefresh(hotspot) {
      if (!modal?.classList.contains('visible')) return;
      requestAnimationFrame(() => {
        if (!modal?.classList.contains('visible')) return;
        applyInfoModalFrameSize(hotspot);
      });
      modalBody?.querySelectorAll('img, video, iframe').forEach((mediaEl) => {
        const refresh = () => {
          if (!modal?.classList.contains('visible')) return;
          applyInfoModalFrameSize(hotspot);
        };
        mediaEl.addEventListener('load', refresh, { once: true });
        mediaEl.addEventListener('loadedmetadata', refresh, { once: true });
      });
    }

    function applyInfoModalFrameSize(hotspot) {
      if (!modalContent || !modalBody) return;
      const frame = getViewportClampedInfoFrameSize(hotspot?.infoFrameSize);
      const mobileClamp = getMobileInfoFrameClamp();
      let width = mobileClamp ? Math.min(frame.width, mobileClamp.maxWidth) : frame.width;
      let height = mobileClamp ? Math.min(frame.height, mobileClamp.maxHeight) : frame.height;
      modal.classList.add('preview-modal-rich-like');
      modalContent.classList.add('modal-content-rich-preview');
      modalBody.classList.add('preview-rich-surface');
      const measured = measureRichInfoModalFrame(width, height);
      if (measured) {
        width = measured.width;
        height = measured.height;
      }
      modalContent.style.width = `${width}px`;
      modalContent.style.height = `${height}px`;
      modalBody.style.height = `${height}px`;
      modalBody.style.maxHeight = `${height}px`;
      const hotspotPoint = getHotspotViewportPoint(activeInfoHotspotElement);
      const anchorOffset = hotspotPoint ? getInfoModalAnchorOffset(hotspot) : null;
      const framePosition = hotspotPoint && anchorOffset
        ? {
            left: Math.round(hotspotPoint.x + anchorOffset.offsetX),
            top: Math.round(hotspotPoint.y + anchorOffset.offsetY),
          }
        : getScaledInfoFramePositionForViewport(hotspot);
      const maxLeft = Math.max(8, window.innerWidth - width - 8);
      const maxTop = Math.max(8, window.innerHeight - height - 8);
      const left = Number.isFinite(framePosition.left) ? framePosition.left : defaultInfoFrameLeft;
      const top = Number.isFinite(framePosition.top) ? framePosition.top : defaultInfoFrameTop;
      modalContent.style.left = `${Math.round(Math.min(maxLeft, Math.max(8, left)))}px`;
      modalContent.style.top = `${Math.round(Math.min(maxTop, Math.max(8, top)))}px`;
      applyInfoModalVisualStyle(hotspot);
    }

    function getHotspotSceneTargetRuntime(hotspot) {
      const sceneBlock = (hotspot?.contentBlocks || []).find(
        (block) => block.type === 'scene' && block.sceneId,
      );
      if (!sceneBlock) return null;
      return findSceneRuntimeById(sceneBlock.sceneId);
    }

    function getHotspotSceneTargetData(hotspot) {
      const sceneBlock = (hotspot?.contentBlocks || []).find(
        (block) => block.type === 'scene' && block.sceneId,
      );
      if (!sceneBlock) return null;
      return (getProjectData()?.scenes || []).find((scene) => scene.id === sceneBlock.sceneId) || null;
    }

    function getSceneLinkHoverLabel(hotspot, targetScene = null) {
      const runtimeTarget = targetScene || getHotspotSceneTargetRuntime(hotspot);
      const dataTarget = runtimeTarget?.data || getHotspotSceneTargetData(hotspot);
      if (!dataTarget) return hotspot?.title || 'Hotspot';
      const targetName = String(dataTarget.alias || '').trim() || dataTarget.name || 'Scene';
      return `Go to ${targetName}`;
    }

    function hideSceneLinkTooltip() {
      activeSceneLinkTooltipElement = null;
      if (!sceneLinkTooltip) return;
      sceneLinkTooltip.classList.add('hidden');
      sceneLinkTooltip.setAttribute('aria-hidden', 'true');
    }

    function positionSceneLinkTooltip(targetElement) {
      if (!sceneLinkTooltip || !targetElement) return;
      const rect = targetElement.getBoundingClientRect();
      sceneLinkTooltip.style.left = `${rect.left + rect.width / 2}px`;
      sceneLinkTooltip.style.top = `${rect.top}px`;
    }

    function showSceneLinkTooltip(targetElement, text) {
      if (!sceneLinkTooltip || !targetElement || !text) return;
      activeSceneLinkTooltipElement = targetElement;
      sceneLinkTooltip.textContent = text;
      sceneLinkTooltip.classList.remove('hidden');
      sceneLinkTooltip.setAttribute('aria-hidden', 'false');
      positionSceneLinkTooltip(targetElement);
    }

    function isHoverCapablePointer() {
      return typeof window.matchMedia === 'function'
        && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    }

    function isQuickInfoHotspot(hotspot) {
      const blocks = Array.isArray(hotspot?.contentBlocks) ? hotspot.contentBlocks : [];
      const hasSceneLink = blocks.some((block) => block?.type === 'scene');
      return !hasSceneLink && normalizeInfoHotspotDisplayMode(hotspot?.displayMode) === 'quick';
    }

    function clearQuickInfoTimers() {
      if (quickInfoHoverTimer) {
        clearTimeout(quickInfoHoverTimer);
        quickInfoHoverTimer = null;
      }
      if (quickInfoCloseTimer) {
        clearTimeout(quickInfoCloseTimer);
        quickInfoCloseTimer = null;
      }
    }

    function cancelQuickInfoClose() {
      if (quickInfoCloseTimer) {
        clearTimeout(quickInfoCloseTimer);
        quickInfoCloseTimer = null;
      }
    }

    function closeModal() {
      clearQuickInfoTimers();
      quickInfoHoverHotspot = null;
      quickInfoHoverElement = null;
      quickInfoModalHover = false;
      stopInfoModalDrag();
      activeInfoHotspot = null;
      activeInfoHotspotElement = null;
      activeInfoHotspotAnchorOffset = null;
      modalBody?.querySelectorAll('video,audio').forEach((mediaEl) => {
        try { mediaEl.pause(); } catch (_) {}
      });
      modalBody?.querySelectorAll('iframe').forEach((iframeEl) => {
        try { iframeEl.setAttribute('src', 'about:blank'); } catch (_) {}
      });
      if (modalBody) {
        modalBody.innerHTML = '';
      }
      modal?.classList.remove('visible');
      modal?.setAttribute('aria-hidden', 'true');
      resetInfoModalFrameSize();
    }

    function scheduleQuickInfoClose() {
      cancelQuickInfoClose();
      quickInfoCloseTimer = setTimeout(() => {
        quickInfoCloseTimer = null;
        if (!quickInfoHoverElement && !quickInfoModalHover && quickInfoHoverHotspot) {
          closeModal();
        }
      }, 140);
    }

    function openModal(hotspot, sourceElement = null) {
      clearQuickInfoTimers();
      modalTitle.textContent = '';
      modalBody.innerHTML = '';
      resetInfoModalFrameSize();
      activeInfoHotspot = null;
      activeInfoHotspotElement = sourceElement instanceof Element ? sourceElement : null;
      activeInfoHotspotAnchorOffset = null;
      quickInfoHoverHotspot = isQuickInfoHotspot(hotspot) ? hotspot : null;
      quickInfoHoverElement = sourceElement instanceof Element ? sourceElement : null;
      quickInfoModalHover = false;

      const blocks = Array.isArray(hotspot.contentBlocks) ? hotspot.contentBlocks : [];
      const isSceneLinkHotspot = blocks.some((block) => block.type === 'scene');
      if (!isSceneLinkHotspot && typeof hotspot.richContentHtml === 'string') {
        activeInfoHotspot = hotspot;
        modalBody.innerHTML = sanitizeRichHtml(hotspot.richContentHtml) || '<p><br></p>';
        trimTrailingEmptyParagraphs(modalBody);
        resolveRichMediaReferencesInContainer(modalBody, getProjectData(), { preferDataUrl: false });
        applyInfoModalFrameSize(hotspot);
        modal.classList.add('visible');
        modal.setAttribute('aria-hidden', 'false');
        scheduleInfoModalFrameRefresh(hotspot);
        return;
      }

      modalTitle.textContent = hotspot.title || 'Hotspot';

      blocks.forEach((block) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'block';
        const isInfoInlineBlock = block.type === 'text' || block.type === 'image' || block.type === 'video';
        if (!isInfoInlineBlock) {
          const heading = document.createElement('h4');
          heading.textContent = block.type;
          wrapper.appendChild(heading);
        }
        if (block.type === 'text') {
          const p = document.createElement('p');
          p.textContent = block.value || '';
          p.style.whiteSpace = 'pre-wrap';
          p.style.textAlign = normalizeTextAlign(block.align);
          wrapper.appendChild(p);
        }
        if (block.type === 'image') {
          const imageSrc = String(block.url || '').trim() || block.assetPath || '';
          if (imageSrc) {
            const img = document.createElement('img');
            img.src = imageSrc;
            img.alt = hotspot.title || 'Hotspot image';
            wrapper.appendChild(img);
          }
        }
        if (block.type === 'video') {
          if (block.url) {
            const iframe = document.createElement('iframe');
            iframe.src = normalizeVideoEmbedUrl(block.url);
            iframe.width = '100%';
            iframe.height = '360';
            iframe.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
            iframe.style.border = '0';
            wrapper.appendChild(iframe);
          } else if (block.assetPath) {
            const video = document.createElement('video');
            video.controls = true;
            video.src = block.assetPath;
            wrapper.appendChild(video);
          }
        }
        if (block.type === 'audio' && block.assetPath) {
          const audio = document.createElement('audio');
          audio.controls = true;
          audio.src = block.assetPath;
          wrapper.appendChild(audio);
        }
        if (block.type === 'link') {
          const link = document.createElement('a');
          link.href = block.url || '#';
          link.textContent = block.label || 'Open link';
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          wrapper.appendChild(link);
        }
        if (block.type === 'scene') {
          const target = findSceneRuntimeById(block.sceneId || '');
          if (target) {
            const button = document.createElement('button');
            button.className = 'btn';
            const targetAlias = String(target.data?.alias || '').trim();
            const targetName = targetAlias || target.data.name || 'scene';
            button.textContent = `Go to ${targetName}`;
            button.addEventListener('click', () => {
              closeModal();
              switchScene(target, { syncGroup: true });
            });
            wrapper.appendChild(button);
          } else {
            const p = document.createElement('p');
            p.textContent = 'Target scene is missing.';
            wrapper.appendChild(p);
          }
        }
        modalBody.appendChild(wrapper);
      });

      modal.classList.add('visible');
      modal.setAttribute('aria-hidden', 'false');
    }

    function scheduleQuickInfoOpen(hotspot, sourceElement) {
      if (!isQuickInfoHotspot(hotspot) || !isHoverCapablePointer() || !(sourceElement instanceof Element)) {
        return;
      }
      cancelQuickInfoClose();
      if (quickInfoHoverHotspot?.id === hotspot.id && modal?.classList.contains('visible')) {
        return;
      }
      if (quickInfoHoverTimer) {
        clearTimeout(quickInfoHoverTimer);
      }
      quickInfoHoverElement = sourceElement;
      quickInfoHoverTimer = setTimeout(() => {
        quickInfoHoverTimer = null;
        if (!quickInfoHoverElement || quickInfoHoverElement !== sourceElement) {
          return;
        }
        openModal(hotspot, sourceElement);
      }, 140);
    }

    function createHotspotElement(hotspot) {
      const wrapper = document.createElement('div');
      wrapper.className = 'hotspot';
      wrapper.removeAttribute('title');
      const isSceneLink = Boolean((hotspot.contentBlocks || []).some((block) => block.type === 'scene'));
      if (isSceneLink) {
        const targetScene = getHotspotSceneTargetRuntime(hotspot);
        wrapper.classList.add('hotspot-link', 'hotspot-default');
        const linkColor = floorplanColorMap[normalizeFloorplanColorKey(hotspot.linkColorKey || 'yellow')];
        wrapper.style.setProperty('--scene-link-color', linkColor);
        wrapper.style.setProperty('--scene-link-border', darkenHex(linkColor, 0.24));
        wrapper.style.setProperty('--scene-link-ring', withAlpha(linkColor, 0.35));
        wrapper.removeAttribute('aria-label');
        wrapper.addEventListener('mouseenter', () => {
          showSceneLinkTooltip(wrapper, getSceneLinkHoverLabel(hotspot, targetScene));
        });
        wrapper.addEventListener('mousemove', () => {
          positionSceneLinkTooltip(wrapper);
        });
        wrapper.addEventListener('mouseleave', hideSceneLinkTooltip);
      } else {
        wrapper.setAttribute('aria-label', hotspot.title || 'Hotspot');
        const infoColor = floorplanColorMap[normalizeFloorplanColorKey(hotspot.markerColorKey || 'yellow')];
        wrapper.style.setProperty('--info-hotspot-color', withAlpha(infoColor, 0.9));
        wrapper.style.setProperty('--info-hotspot-border', darkenHex(infoColor, 0.28));
        wrapper.style.setProperty('--info-hotspot-glow', withAlpha(infoColor, 0.4));
        if (isQuickInfoHotspot(hotspot) && isHoverCapablePointer()) {
          wrapper.addEventListener('mouseenter', () => {
            quickInfoHoverElement = wrapper;
            scheduleQuickInfoOpen(hotspot, wrapper);
          });
          wrapper.addEventListener('mouseleave', () => {
            if (quickInfoHoverElement === wrapper) {
              quickInfoHoverElement = null;
            }
            scheduleQuickInfoClose();
          });
        }
      }

      wrapper.classList.add('hotspot-default');
      if (isSceneLink) {
        wrapper.classList.add('hotspot-link');
      }

      wrapper.addEventListener('click', () => {
        hideSceneLinkTooltip();
        const targetScene = getHotspotSceneTargetRuntime(hotspot);
        if (targetScene) {
          switchScene(targetScene, { syncGroup: true });
          return;
        }
        if (isQuickInfoHotspot(hotspot) && isHoverCapablePointer()) {
          return;
        }
        openModal(hotspot, wrapper);
      });

      return wrapper;
    }

    function bindEvents() {
      closeModalButton?.addEventListener('click', closeModal);
      modalContent?.addEventListener('pointerdown', (event) => {
        maybeStartInfoModalDrag(event);
      });
      modalContent?.addEventListener('mouseenter', () => {
        if (quickInfoHoverHotspot) {
          quickInfoModalHover = true;
          cancelQuickInfoClose();
        }
      });
      modalContent?.addEventListener('mouseleave', () => {
        if (quickInfoHoverHotspot) {
          quickInfoModalHover = false;
          scheduleQuickInfoClose();
        }
      });
    }

    function refreshFloatingUi() {
      if (activeSceneLinkTooltipElement) {
        positionSceneLinkTooltip(activeSceneLinkTooltipElement);
      }
      if (modal?.classList.contains('visible') && activeInfoHotspot) {
        applyInfoModalFrameSize(activeInfoHotspot);
      }
    }

    bindEvents();

    return {
      createHotspotElement,
      openModal,
      closeModal,
      hideSceneLinkTooltip,
      refreshFloatingUi,
    };
  }

  window.IterpanoRuntimeHotspots = {
    createViewerHotspotsController,
  };
})();
