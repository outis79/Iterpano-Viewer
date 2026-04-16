(function () {
  function normalizeMode(mode) {
    return mode === 'map' ? 'map' : mode === 'groups' ? 'groups' : 'scenes';
  }

  function createViewerMobilePanelsController(options) {
    const {
      btnMobileGroups,
      btnMobileScenes,
      btnMobileMap,
      btnMobilePanelClose,
      btnFloorplanMobileClose,
      mobilePanelTitle,
      mobilePanelBackdrop,
      sidePanel,
      isMobileViewerLayout,
      isOrientationLocked,
      onRefreshLayout,
      onMapOpen,
    } = options;

    let mobilePanelMode = null;

    function updateUi() {
      const isOpen = Boolean(mobilePanelMode);
      document.body.classList.toggle('mobile-panel-open', isOpen);
      document.body.classList.toggle('mobile-panel-groups', mobilePanelMode === 'groups');
      document.body.classList.toggle('mobile-panel-scenes', mobilePanelMode === 'scenes');
      document.body.classList.toggle('mobile-panel-map', mobilePanelMode === 'map');
      mobilePanelBackdrop?.classList.toggle('hidden', !isOpen);
      mobilePanelBackdrop?.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      if (mobilePanelTitle) {
        mobilePanelTitle.textContent = mobilePanelMode === 'groups'
          ? 'Groups'
          : mobilePanelMode === 'map'
            ? 'Map'
            : 'Scenes';
      }
      if (btnMobileGroups) {
        btnMobileGroups.classList.toggle('active', mobilePanelMode === 'groups');
        btnMobileGroups.setAttribute('aria-pressed', mobilePanelMode === 'groups' ? 'true' : 'false');
      }
      if (btnMobileScenes) {
        btnMobileScenes.classList.toggle('active', mobilePanelMode === 'scenes');
        btnMobileScenes.setAttribute('aria-pressed', mobilePanelMode === 'scenes' ? 'true' : 'false');
      }
      if (btnMobileMap) {
        btnMobileMap.classList.toggle('active', mobilePanelMode === 'map');
        btnMobileMap.setAttribute('aria-pressed', mobilePanelMode === 'map' ? 'true' : 'false');
      }
    }

    function close() {
      mobilePanelMode = null;
      updateUi();
      if (!isOrientationLocked()) {
        requestAnimationFrame(onRefreshLayout);
      }
    }

    function open(mode) {
      if (!isMobileViewerLayout() || isOrientationLocked()) return;
      mobilePanelMode = normalizeMode(mode);
      updateUi();
      requestAnimationFrame(() => {
        onRefreshLayout();
        if (mobilePanelMode === 'map') {
          onMapOpen();
        }
      });
    }

    function toggle(mode) {
      if (!isMobileViewerLayout() || isOrientationLocked()) return;
      const nextMode = normalizeMode(mode);
      mobilePanelMode = mobilePanelMode === nextMode ? null : nextMode;
      updateUi();
      requestAnimationFrame(() => {
        onRefreshLayout();
        if (mobilePanelMode === 'map') {
          onMapOpen();
        }
      });
    }

    function bindEvents() {
      btnMobileGroups?.addEventListener('click', () => toggle('groups'));
      btnMobileScenes?.addEventListener('click', () => toggle('scenes'));
      btnMobileMap?.addEventListener('click', () => toggle('map'));
      btnMobilePanelClose?.addEventListener('click', close);
      btnFloorplanMobileClose?.addEventListener('click', close);
      mobilePanelBackdrop?.addEventListener('click', close);
      sidePanel?.addEventListener('touchmove', (event) => {
        if (!isMobileViewerLayout()) return;
        if ((mobilePanelMode === 'groups' || mobilePanelMode === 'scenes') && event.touches.length > 1) {
          event.preventDefault();
        }
      }, { passive: false });
    }

    bindEvents();
    updateUi();

    return {
      getMode() {
        return mobilePanelMode;
      },
      updateUi,
      close,
      open,
      toggle,
    };
  }

  window.IterpanoRuntimeMobilePanels = {
    createViewerMobilePanelsController,
  };
})();
