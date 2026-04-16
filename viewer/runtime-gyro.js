(function () {
  function requestMotionPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      return DeviceOrientationEvent.requestPermission().then((result) => result === 'granted');
    }
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      return DeviceMotionEvent.requestPermission().then((result) => result === 'granted');
    }
    return Promise.resolve(true);
  }

  function normalizeDegreesDelta(value) {
    let normalized = Number(value) || 0;
    while (normalized > 180) normalized -= 360;
    while (normalized < -180) normalized += 360;
    return normalized;
  }

  function getScreenOrientationAngle() {
    if (Number.isFinite(window.orientation)) {
      return Number(window.orientation);
    }
    if (screen?.orientation && Number.isFinite(screen.orientation.angle)) {
      return Number(screen.orientation.angle);
    }
    return 0;
  }

  function multiplyQuaternions(a, b) {
    return {
      x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
      w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    };
  }

  function quaternionFromEulerYXZ(x, y, z) {
    const c1 = Math.cos(x / 2);
    const c2 = Math.cos(y / 2);
    const c3 = Math.cos(z / 2);
    const s1 = Math.sin(x / 2);
    const s2 = Math.sin(y / 2);
    const s3 = Math.sin(z / 2);
    return {
      x: s1 * c2 * c3 + c1 * s2 * s3,
      y: c1 * s2 * c3 - s1 * c2 * s3,
      z: c1 * c2 * s3 - s1 * s2 * c3,
      w: c1 * c2 * c3 + s1 * s2 * s3,
    };
  }

  function quaternionFromAxisAngle(axis, angle) {
    const halfAngle = angle / 2;
    const s = Math.sin(halfAngle);
    return {
      x: axis.x * s,
      y: axis.y * s,
      z: axis.z * s,
      w: Math.cos(halfAngle),
    };
  }

  function applyQuaternionToVector(vector, quaternion) {
    const qVec = { x: vector.x, y: vector.y, z: vector.z, w: 0 };
    const inverse = { x: -quaternion.x, y: -quaternion.y, z: -quaternion.z, w: quaternion.w };
    const rotated = multiplyQuaternions(multiplyQuaternions(quaternion, qVec), inverse);
    return { x: rotated.x, y: rotated.y, z: rotated.z };
  }

  function getGyroFallbackPose(event) {
    const alpha = Number.isFinite(event.alpha) ? (event.alpha * Math.PI) / 180 : 0;
    const beta = Number.isFinite(event.beta) ? (event.beta * Math.PI) / 180 : 0;
    const gamma = Number.isFinite(event.gamma) ? (event.gamma * Math.PI) / 180 : 0;
    const orient = (getScreenOrientationAngle() * Math.PI) / 180;
    const deviceQuaternion = quaternionFromEulerYXZ(beta, alpha, -gamma);
    const screenQuaternion = quaternionFromAxisAngle({ x: 0, y: 0, z: 1 }, -orient);
    const cameraQuaternion = multiplyQuaternions(
      multiplyQuaternions(deviceQuaternion, { x: -Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 }),
      screenQuaternion,
    );
    const forward = applyQuaternionToVector({ x: 0, y: 0, z: -1 }, cameraQuaternion);
    const pitchDeg = (-Math.asin(Math.max(-1, Math.min(1, forward.y))) * 180) / Math.PI;
    const horizontalLength = Math.hypot(forward.x, forward.z);
    const yawDeg = horizontalLength > 1e-3 ? (Math.atan2(forward.x, -forward.z) * 180) / Math.PI : null;
    return { pitchDeg, yawDeg };
  }

  function createViewerGyroController(options) {
    const {
      btnGyro,
      getActiveViewer,
      getCurrentScene,
      alertUser = (message) => window.alert(message),
    } = options;

    let gyroEnabled = false;
    let gyroMethod = null;
    let gyroFallbackListener = null;
    let gyroFallbackYawOffset = null;
    let gyroFallbackLastYaw = null;
    let gyroFallbackYawLocked = false;

    function updateGyroButton() {
      if (btnGyro) {
        btnGyro.textContent = gyroEnabled ? 'Disable Gyro' : 'Enable Gyro';
      }
    }

    function disableGyro() {
      if (gyroFallbackListener) {
        window.removeEventListener('deviceorientation', gyroFallbackListener, true);
        gyroFallbackListener = null;
        gyroFallbackYawOffset = null;
        gyroFallbackLastYaw = null;
        gyroFallbackYawLocked = false;
      } else {
        const activeViewer = getActiveViewer();
        const controls = activeViewer?.controls?.();
        if (controls?.disableMethod) {
          controls.disableMethod('gyro');
        }
      }
      gyroEnabled = false;
      updateGyroButton();
    }

    async function toggleGyro() {
      const activeViewer = getActiveViewer();
      const currentScene = getCurrentScene();
      if (!activeViewer || !currentScene) {
        return;
      }

      const canUseMarzipanoGyro = Boolean(window.Marzipano?.DeviceOrientationControlMethod);
      const canUseDeviceOrientation = typeof window.DeviceOrientationEvent !== 'undefined';

      if (!canUseMarzipanoGyro && !canUseDeviceOrientation) {
        alertUser('Gyro is not available in this browser.');
        return;
      }

      if (gyroEnabled) {
        disableGyro();
        return;
      }

      const granted = await requestMotionPermission();
      if (!granted) {
        alertUser('Motion access denied.');
        return;
      }

      if (canUseDeviceOrientation) {
        gyroFallbackYawOffset = null;
        gyroFallbackLastYaw = null;
        gyroFallbackYawLocked = false;
        gyroFallbackListener = (event) => {
          const scene = getCurrentScene();
          if (!scene || event.alpha == null || event.beta == null) return;
          const pose = getGyroFallbackPose(event);
          const currentYawDeg = ((scene.view.parameters().yaw || 0) * 180) / Math.PI;
          if (gyroFallbackYawOffset == null && pose.yawDeg != null) {
            gyroFallbackYawOffset = normalizeDegreesDelta(currentYawDeg - pose.yawDeg);
            gyroFallbackLastYaw = currentYawDeg;
          }
          let yawDeg = gyroFallbackLastYaw ?? currentYawDeg;
          if (pose.yawDeg != null && gyroFallbackYawOffset != null) {
            const candidateYawDeg = normalizeDegreesDelta(pose.yawDeg + gyroFallbackYawOffset);
            const alternateYawDeg = normalizeDegreesDelta(candidateYawDeg + 180);
            if (gyroFallbackLastYaw == null) {
              yawDeg = candidateYawDeg;
            } else {
              const directDelta = Math.abs(normalizeDegreesDelta(candidateYawDeg - gyroFallbackLastYaw));
              const alternateDelta = Math.abs(normalizeDegreesDelta(alternateYawDeg - gyroFallbackLastYaw));
              yawDeg = alternateDelta + 5 < directDelta ? alternateYawDeg : candidateYawDeg;
            }
          }
          const absPitch = Math.abs(pose.pitchDeg);
          if (absPitch >= 80) {
            gyroFallbackYawLocked = true;
          } else if (absPitch <= 70) {
            gyroFallbackYawLocked = false;
          }
          if (gyroFallbackYawLocked && gyroFallbackLastYaw != null) {
            yawDeg = gyroFallbackLastYaw;
          } else {
            gyroFallbackLastYaw = yawDeg;
          }
          const yaw = (yawDeg * Math.PI) / 180;
          const pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, (pose.pitchDeg * Math.PI) / 180));
          scene.view.setParameters({ yaw, pitch });
        };
        window.addEventListener('deviceorientation', gyroFallbackListener, true);
      } else if (canUseMarzipanoGyro) {
        gyroMethod = gyroMethod || new Marzipano.DeviceOrientationControlMethod();
        const controls = activeViewer.controls();
        if (controls.enableMethod && controls.disableMethod) {
          controls.registerMethod('gyro', gyroMethod, false);
          controls.enableMethod('gyro');
        } else {
          controls.registerMethod('gyro', gyroMethod, true);
        }
      }

      gyroEnabled = true;
      updateGyroButton();
    }

    function resetOrientation() {
      const currentScene = getCurrentScene();
      if (!currentScene) return;
      currentScene.view.setParameters(currentScene.data.initialViewParameters || { yaw: 0, pitch: 0, fov: 1.4 });
    }

    updateGyroButton();

    return {
      isEnabled() {
        return gyroEnabled;
      },
      toggleGyro,
      resetOrientation,
      disableGyro,
    };
  }

  window.IterpanoRuntimeGyro = {
    createViewerGyroController,
  };
})();
