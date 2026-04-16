(function (global) {
  function createViewerRuntimeUi(options) {
    const {
      viewerHeader,
      licenseFooter,
      orientationLockOverlay,
      btnFullscreen,
      btnFullscreenExit,
      viewerShell,
      panoElement,
      isMobileViewerLayout,
      onOrientationLock,
      onFullscreenUnavailable,
      onAfterFullscreenToggle,
    } = options;

    let orientationLocked = false;
    let pseudoFullscreenActive = false;

    function isPortraitLockedMobileLayout() {
      return isMobileViewerLayout() && window.innerHeight > window.innerWidth;
    }

    function isIPhoneSafari() {
      const ua = navigator.userAgent || '';
      const isIPhone = /iPhone|iPod/i.test(ua);
      const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua);
      return isIPhone && isSafari;
    }

    function canUsePseudoFullscreen() {
      return isIPhoneSafari();
    }

    function shouldPreferPseudoFullscreen() {
      return canUsePseudoFullscreen();
    }

    function canUseFullscreen() {
      const docEl = document.documentElement;
      return Boolean(
        window.screenfull?.isEnabled ||
        document.fullscreenEnabled ||
        document.webkitFullscreenEnabled ||
        docEl?.requestFullscreen ||
        docEl?.webkitRequestFullscreen
      );
    }

    function isFullscreenActive() {
      return Boolean(
        window.screenfull?.isFullscreen ||
        document.fullscreenElement ||
        document.webkitFullscreenElement
      );
    }

    function isFullscreenUiActive() {
      return isFullscreenActive() || pseudoFullscreenActive;
    }

    function setPseudoFullscreen(next) {
      pseudoFullscreenActive = Boolean(next);
      document.body.classList.toggle('viewer-pseudo-fullscreen', pseudoFullscreenActive);
    }

    function updateFullscreenUiState() {
      const isFullscreen = isFullscreenUiActive();
      document.body.classList.toggle('viewer-fullscreen', isFullscreen);
      btnFullscreenExit?.classList.toggle('hidden', !isFullscreen);
    }

    function syncViewerViewportMetrics() {
      const viewportHeight = Math.max(320, Math.round(window.innerHeight || document.documentElement.clientHeight || 0));
      document.documentElement.style.setProperty('--viewer-app-height', `${viewportHeight}px`);
      const headerHeight = Math.round(viewerHeader?.getBoundingClientRect().height || 0);
      const footerHeight = Math.round(licenseFooter?.getBoundingClientRect().height || 0);
      document.documentElement.style.setProperty('--viewer-header-height', `${headerHeight}px`);
      document.documentElement.style.setProperty('--viewer-footer-height', `${footerHeight}px`);
      const panoHeight = Math.max(220, viewportHeight - headerHeight - footerHeight);
      document.documentElement.style.setProperty('--viewer-mobile-pano-height', `${panoHeight}px`);
    }

    function updateOrientationLockUi() {
      orientationLocked = isPortraitLockedMobileLayout();
      orientationLockOverlay?.classList.toggle('hidden', !orientationLocked);
      orientationLockOverlay?.setAttribute('aria-hidden', orientationLocked ? 'false' : 'true');
      document.body.classList.toggle('orientation-locked', orientationLocked);
      if (orientationLocked) {
        onOrientationLock?.();
      }
      return orientationLocked;
    }

    function requestFullscreenFallback() {
      const candidates = [document.documentElement, document.body, viewerShell, panoElement];
      for (const node of candidates) {
        if (node?.requestFullscreen) {
          return node.requestFullscreen();
        }
        if (node?.webkitRequestFullscreen) {
          return node.webkitRequestFullscreen();
        }
      }
      return null;
    }

    function exitFullscreenFallback() {
      if (document.exitFullscreen) {
        return document.exitFullscreen();
      }
      if (document.webkitExitFullscreen) {
        return document.webkitExitFullscreen();
      }
      return null;
    }

    function syncFullscreenButton(project) {
      if (!btnFullscreen) return;
      const enabledBySettings = project?.settings?.fullscreenButton !== false;
      const supported = canUseFullscreen() || canUsePseudoFullscreen();
      btnFullscreen.hidden = !enabledBySettings;
      btnFullscreen.disabled = !enabledBySettings || !supported;
      if (!enabledBySettings) return;
      const isFullscreen = isFullscreenUiActive();
      btnFullscreen.textContent = isFullscreen ? 'Exit Fullscreen' : 'Fullscreen 360';
      btnFullscreen.setAttribute('aria-pressed', isFullscreen ? 'true' : 'false');
      updateFullscreenUiState();
    }

    function toggleFullscreen(project) {
      if (shouldPreferPseudoFullscreen()) {
        setPseudoFullscreen(!pseudoFullscreenActive);
        syncFullscreenButton(project);
        onAfterFullscreenToggle?.();
        return;
      }
      if (!canUseFullscreen()) {
        onFullscreenUnavailable?.();
        return;
      }
      let result = null;
      if (window.screenfull?.isEnabled) {
        result = screenfull.toggle(document.documentElement);
      } else if (isFullscreenActive()) {
        result = exitFullscreenFallback();
      } else {
        result = requestFullscreenFallback();
      }
      if (result && typeof result.catch === 'function') {
        result.catch(() => {});
      }
    }

    return {
      canUseFullscreen,
      isFullscreenActive,
      isFullscreenUiActive,
      isOrientationLocked() {
        return orientationLocked;
      },
      syncViewerViewportMetrics,
      updateOrientationLockUi,
      syncFullscreenButton,
      updateFullscreenUiState,
      toggleFullscreen,
    };
  }

  global.IterpanoRuntimeUi = {
    createViewerRuntimeUi,
  };
})(window);
