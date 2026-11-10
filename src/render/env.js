// Water-column atmosphere: backdrop gradient with volumetric light shafts, foreground god-ray sheets, and the rippling
// underside of the surface. The above-water strip lives in skyband.js.
import * as THREE from 'three';
import { U } from './uniforms.js';
import { COMMON_FRAG } from './glsl.js';
import { fbm1, hash1 } from '../logic/rng.js';

// ---- backdrop -----------------------------------------------------------------------------------------------------
export class Backdrop {
  constructor(scene) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U },
      depthTest: false, depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
      fragmentShader: `${COMMON_FRAG}
        varying vec2 vUv; uniform float uCamX;
        void main(){
          float y = vUv.y;
          vec3 c = mix(uDeepColor, uFogColor, smoothstep(0.0, 0.58, y));
          c = mix(c, uTopColor, smoothstep(0.55, 1.0, y) * 0.8);
          float n = fbm2(vec2(vUv.x * 3.0 + uTime * 0.02, y * 2.0 - uTime * 0.01));
          c += uTopColor * (n - 0.45) * 0.10 * smoothstep(0.2, 0.9, y);
          // a soft sunlit glow high in the water column
          float g = exp(-pow((vUv.x - 0.62) * 1.5, 2.0) * 3.0) * smoothstep(0.35, 1.0, y);
          c += uTopColor * g * 0.16;
          // light shafts fanning down from the sun's point on the surface (volumetric, behind everything)
          vec2 sp = vec2(0.6 + 0.08 * sin(uCamX * 0.0007), 1.45);
          vec2 d = vUv - sp; d.x *= 1.8;
          float ang = atan(d.x, -d.y);
          float r1 = vnoise(vec2(ang * 10.0 + uTime * 0.045, uTime * 0.03));
          float r2 = vnoise(vec2(ang * 27.0 - uTime * 0.06 + uCamX * 0.002, 4.0));
          float beam = smoothstep(0.38, 0.82, r1 * 0.62 + r2 * 0.38);
          float fall = exp(-max(length(d) - 0.45, 0.0) * 1.25);
          c += mix(uTopColor, vec3(1.0, 0.98, 0.88), 0.5) * beam * fall * 0.22 * smoothstep(0.18, 0.95, y);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = -100;
    scene.add(this.mesh);
  }
}

// ---- god rays -------------------------------------------------------------------------------------------------------
export class GodRays {
  constructor(scene, count) {
    this.group = new THREE.Group();
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U, uIntensity: { value: 1 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; varying vec3 vWP; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `${COMMON_FRAG}
        uniform float uIntensity; varying vec2 vUv; varying vec3 vWP;
        void main(){
          float edge = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x);
          float streak = 0.55 + 0.45 * vnoise(vec2(vUv.x * 7.0 + vWP.x * 0.02, uTime * 0.12 + vWP.z * 0.1));
          float fade = smoothstep(0.0, 0.9, vUv.y);
          float a = edge * edge * streak * fade * 0.5 * uIntensity * (0.8 + 0.2 * sin(uTime * 0.6 + vWP.x * 0.05));
          gl_FragColor = vec4(mix(uTopColor, vec3(1.0, 0.98, 0.88), 0.55) * a, a);
        }`,
    });
    this.mat = mat;
    this.items = [];
    for (let i = 0; i < count; i++) {
      const w = 7 + hash1(i * 3.1) * 14, z = -6 - hash1(i * 5.3) * 30;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 46), mat);
      m.position.set(0, -10, z);
      m.rotation.z = -0.24 + (hash1(i * 7.7) - 0.5) * 0.12;
      m.renderOrder = -50;
      m.frustumCulled = false;
      this.group.add(m);
      this.items.push({ m, off: (i / count) * 130 - 40 + hash1(i) * 20, par: 0.5 + hash1(i * 2.2) * 0.4, w });
    }
    scene.add(this.group);
  }
  update(camX, intensity) {
    this.mat.uniforms.uIntensity.value = intensity;
    for (const it of this.items) {
      const period = 150;
      const lx = ((it.off - camX * it.par) % period + period * 1.5) % period - period * 0.5;
      it.m.position.x = camX + lx - 12;
    }
  }
}

// ---- underside of the surface -------------------------------------------------------------------------------------
export class Surface {
  constructor(scene) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `varying vec3 vWP; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `${COMMON_FRAG}
        varying vec3 vWP;
        float rip(vec2 q, float t){ return vnoise(q + vec2(t * 0.2, t * 0.09)) * 0.5 + vnoise(q * 2.3 - vec2(t * 0.17, -t * 0.08) + 5.0) * 0.3 + vnoise(q * 5.1 + vec2(-t * 0.3, t * 0.2) + 11.0) * 0.2; }
        void main(){
          vec3 V = normalize(cameraPosition - vWP);
          float cosT = abs(V.y);
          vec2 q = vWP.xz * vec2(0.5, 1.25);
          float h0 = rip(q, uTime), hx = rip(q + vec2(0.07, 0.0), uTime), hz = rip(q + vec2(0.0, 0.07), uTime);
          vec3 n = normalize(vec3((h0 - hx) * 5.0, 1.0, (h0 - hz) * 5.0));
          float slope = length(n.xz);
          // the underside is a mirror at these grazing angles: it reflects the lit water, brighter and silvery
          vec3 mirror = mix(uFogColor * 1.0, uTopColor * 1.05, 0.45) * (0.8 + 0.4 * h0);
          // nearer the lane we look more steeply through the surface: a bright refracted-sky window (Snell's window feel)
          float win = smoothstep(-42.0, -1.5, vWP.z);
          vec3 sky = mix(vec3(0.5, 0.82, 0.9), uTopColor * 1.25 + vec3(0.05), 0.4);
          vec3 col = mix(mirror, sky, win * (0.3 + 0.35 * smoothstep(0.1, 0.6, h0)));
          // sunlight focused through the ripples: a moving web of light, plus glints on steep ripple flanks
          float web = caustic(vWP.xz * vec2(0.5, 1.1) + n.xz * 1.4, uTime * 0.55);
          col += vec3(0.7, 0.98, 1.0) * web * (0.06 + 0.2 * win);
          col += vec3(0.85, 1.0, 1.0) * smoothstep(0.22, 0.42, slope) * (0.12 + 0.28 * win);
          col += (vec3(0.8, 0.95, 1.0) * smoothstep(0.62, 0.84, h0) * 0.35);
          col *= 0.88;
          float dist = length(vWP - cameraPosition);
          float f = 1.0 - exp(-max(0.0, dist - 40.0) * uFogDensity * 0.2);
          col = mix(col, mix(uFogColor, uTopColor, 0.55), f * 0.8);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(700, 170), mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(0, 0.0, -85);
    this.mesh.renderOrder = -20; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  update(camX) { this.mesh.position.x = camX; }
}

export { SkyBand } from './skyband.js';
