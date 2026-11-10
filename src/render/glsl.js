// Shared GLSL: underwater lighting, depth absorption, caustics and fog. Every world material pulls this in.
export const COMMON_FRAG = /* glsl */`
uniform float uTime; uniform vec3 uFogColor; uniform vec3 uDeepColor; uniform vec3 uTopColor; uniform float uFogDensity; uniform float uAbsorb; uniform float uCaustic; uniform vec3 uSunDir; uniform float uQuality;

float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i), hash21(i+vec2(1,0)), u.x), mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), u.x), u.y); }
float fbm2(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }

// Moving web of light lines (cell edges of animated Voronoi), after DeepSwell's cosy caustics.
vec2 cHash2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float caustic(vec2 p, float t){
  vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec2 g = vec2(float(x), float(y)); vec2 o = cHash2(i + g); o = 0.5 + 0.42 * sin(t + 6.2831 * o);
    float d = length(g + o - f); if (d < d1){ d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return 1.0 - smoothstep(0.0, 0.09, d2 - d1);
}
float causticLight(vec3 wp){
  if (uQuality < 0.5) return 0.35 + 0.25 * sin(wp.x * 0.7 + uTime * 0.9) * sin(wp.z * 0.5 + uTime * 0.6);
  float c = caustic(wp.xz * 0.62 + vec2(0.0, wp.y * 0.05), uTime * 0.55);
  float c2 = caustic(wp.xz * 0.41 + 4.0, uTime * 0.4 + 2.0);
  return (c * 0.6 + c2 * 0.5);
}

// Hemisphere + sun light, depth absorption, caustics, rim and fog. N is a world-space normal.
vec3 underwater(vec3 albedo, vec3 N, vec3 wp, float causticAmt, float rim, float fogMult){
  float up = N.y * 0.5 + 0.5;
  float depth = clamp(-wp.y, 0.0, 40.0);
  float sunL = exp(-depth * uAbsorb);
  vec3 tint = mix(vec3(1.0), uFogColor * 1.7, 0.22);
  vec3 skyAmb = tint * 1.0;
  vec3 grdAmb = mix(vec3(0.34), uDeepColor * 2.2, 0.5) * 0.55;
  vec3 hemi = mix(grdAmb, skyAmb, up);
  float sun = max(dot(N, uSunDir), 0.0);
  vec3 sunCol = mix(vec3(1.0, 0.97, 0.88), uTopColor * 1.2, 0.35) * 0.95 * sunL;
  vec3 col = albedo * (hemi + sunCol * sun * 1.15);
  // water absorbs red first
  col *= mix(vec3(1.0), vec3(0.76, 0.93, 1.0), clamp(depth * 0.03, 0.0, 0.5));
  col += albedo * sunCol * causticAmt * causticLight(wp) * uCaustic * (0.2 + 0.8 * up) * 0.5;
  col += uTopColor * rim * 0.18;
  float dist = length(wp - cameraPosition);
  float f = 1.0 - exp(-max(0.0, dist - 33.0) * uFogDensity * 1.25 * fogMult);
  f = max(f, 0.07 * fogMult);
  vec3 fogc = mix(uDeepColor, uFogColor, smoothstep(-16.0, -1.0, wp.y)) ;
  fogc = mix(fogc, uTopColor, smoothstep(-6.0, 0.0, wp.y) * 0.55);
  return mix(col, fogc, clamp(f, 0.0, 1.0));
}
`;

export const COMMON_VERT = /* glsl */`
uniform float uTime;
`;
