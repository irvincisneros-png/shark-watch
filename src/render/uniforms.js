// Uniforms shared by every material (so one object updates the whole scene's colour grade each frame).
import * as THREE from 'three';

export const U = {
  uTime: { value: 0 },
  uFogColor: { value: new THREE.Color(0x2c9fba) },
  uDeepColor: { value: new THREE.Color(0x0a5f84) },
  uTopColor: { value: new THREE.Color(0x82d6d8) },
  uFogDensity: { value: 0.02 },
  uAbsorb: { value: 0.035 },
  uCaustic: { value: 1 },
  uSunDir: { value: new THREE.Vector3(0.28, 0.9, 0.34).normalize() },
  uQuality: { value: 1 },
  uCamX: { value: 0 },
  uSense: { value: 0 },
  uSandColor: { value: new THREE.Color(0xd2bf93) },
  uRockColor: { value: new THREE.Color(0x797a6e) },
  uKelpColor: { value: new THREE.Color(0xa88b3c) },
  uPulse: { value: 0 },
};
