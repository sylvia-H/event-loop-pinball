// 場景的三支 shader：貼片（所有形狀共用一支，用 kind 分流）、線段、星空。
// 全部加法混合，輸出已乘上透明度的顏色。
// 貼片與線段都在「機器座標的長度」裡算形狀，再用 uPx（一個裝置像素是多少機器單位）做反鋸齒，
// 所以畫面縮小時細線不會斷掉。

/** 彈珠：p1 = 半徑，p2 = glow（光暈放大） */
export const KIND_BALL = 0;
/** 柔光：整片貼片是一團高斯光暈 */
export const KIND_GLOW = 1;
/** 夾爪：開口朝貼片的 +x；p1 = 環的半徑，p2 = grip（1 夾緊），p3 = lit */
export const KIND_GRIP = 2;
/** 取球點的標記：兩段括弧，在貼片的 ±y 兩側；p1 = 半徑，p2 = lit */
export const KIND_MARK = 3;
/** 機械臂的軸心：圓環、圓心、刻度；p1 = lit */
export const KIND_HUB = 4;
/** 計時器的倒數弧：從正上方順時針畫 p2 圈；p1 = 半徑，p3 = lit */
export const KIND_TIMER = 5;
/** 關節：小圓環加圓心；p1 = 半徑 */
export const KIND_JOINT = 6;

/** 線段的畫法（iParam.y） */
/** 實線；lit 高時多一圈光暈 */
export const SEG_PLAIN = 0;
/** 軌道：一條細線；亮起時有光暈與沿線流動的光點。p1 = 流動的相位 */
export const SEG_RAIL = 1;
/** 輸送帶：兩條邊加橫向的節距；亮起時節距往前走、帶一團光。p1 = 相位，p2 = 兩條邊離中線多遠 */
export const SEG_BELT = 2;
/** 玻璃管的管身：一條柔邊的寬帶，邊緣稍亮 */
export const SEG_FILL = 3;
/** 靜止的虛線 */
export const SEG_DASH = 4;
/** 彈珠的殘影：A 端（彈珠）寬而亮，往 B 端收細、變淡 */
export const SEG_TRAIL = 5;

/** 軌道上光點的間距、輸送帶的節距（機器單位）；Stage 用它讓封閉軌道的花紋首尾接得起來 */
export const RAIL_WAVE = 1.5;
export const BELT_PITCH = 0.3;
/** 輸送帶上每幾格節距有一團光 */
export const BELT_WAVE_SLATS = 10;

export const spriteVert = /* glsl */ `
attribute vec4 iPosSize; // x, y, 貼片半邊長, 旋轉
attribute vec4 iColor;
attribute vec4 iParam; // kind, p1, p2, p3
varying vec2 vL;
varying vec2 vUv;
varying vec4 vColor;
varying vec4 vParam;
void main() {
  vUv = position.xy * 2.0;
  vL = vUv * iPosSize.z;
  vColor = iColor;
  vParam = iParam;
  float c = cos(iPosSize.w);
  float s = sin(iPosSize.w);
  vec2 p = vec2(c * vL.x - s * vL.y, s * vL.x + c * vL.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(iPosSize.xy + p, 0.0, 1.0);
}
`;

export const spriteFrag = /* glsl */ `
#define TAU 6.2831853
uniform float uPx;
varying vec2 vL;
varying vec2 vUv;
varying vec4 vColor;
varying vec4 vParam;

// 離中心線 dist 的地方、半寬 hw 的線有多亮
float stroke(float dist, float hw) {
  float w = max(hw, uPx * 0.6);
  return smoothstep(w + uPx * 0.8, w - uPx * 0.8, dist);
}

void main() {
  float kind = vParam.x;
  float p1 = vParam.y;
  float p2 = vParam.z;
  float p3 = vParam.w;
  float d = length(vL);
  float ang = atan(vL.y, vL.x);
  vec3 col = vec3(0.0);

  if (kind < 0.5) {
    // 彈珠：球面的明暗、高光、邊緣的亮環，外面一圈光暈
    float r = p1;
    float body = smoothstep(r + uPx, r - uPx, d);
    float q = min(d / r, 1.0);
    float z = sqrt(1.0 - q * q);
    vec3 n = vec3(vL / r, z);
    float diff = max(dot(n, normalize(vec3(-0.5, 0.62, 0.6))), 0.0);
    float spec = pow(max(dot(n, normalize(vec3(-0.38, 0.5, 0.78))), 0.0), 26.0);
    float rim = pow(1.0 - z, 2.4);
    float halo = exp(-d * d / (r * r * (0.9 + 1.5 * p2))) * (0.22 + 0.36 * p2);
    col = vColor.rgb * (body * (0.14 + 0.5 * diff + 0.62 * rim) + halo) + vec3(1.0) * spec * body * 0.75;
  } else if (kind < 1.5) {
    col = vColor.rgb * exp(-dot(vUv, vUv) * 5.0);
  } else if (kind < 2.5) {
    // 夾爪：一個開口朝前的環，兩根指頭的指尖各一顆圓點；夾緊時開口收小
    float r = p1;
    float a = abs(ang);
    float gap = mix(1.25, 0.5, p2);
    float cover = smoothstep(-uPx, uPx, (a - gap) * d);
    float ring = stroke(abs(d - r), 0.034) * cover;
    vec2 tip = vec2(cos(gap), sin(gap)) * r;
    float knuckle = smoothstep(0.075 + uPx, 0.075 - uPx, length(vec2(vL.x, abs(vL.y)) - tip));
    float palm = stroke(abs(vL.y), 0.07) * step(vL.x, -r) * step(-r - 0.12, vL.x);
    float halo = exp(-pow((d - r) / 0.13, 2.0)) * cover * 0.4 * p3;
    col = vColor.rgb * (ring + knuckle + palm * 0.8 + halo);
  } else if (kind < 3.5) {
    // 取球點：兩段括弧夾著隊伍最前面那一格（貼片的 ±y 兩側）
    float r = p1;
    float sector = abs(fract(ang / TAU * 2.0) - 0.5);
    float arc = smoothstep(-uPx, uPx, (0.19 - sector) * d * 3.1416);
    float ring = stroke(abs(d - r), 0.02) * arc;
    float halo = exp(-pow((d - r) / 0.1, 2.0)) * arc * 0.35 * p2;
    col = vColor.rgb * (ring + halo);
  } else if (kind < 4.5) {
    // 軸心：外環、圓心、八道刻度
    float ring = stroke(abs(d - 0.2), 0.022);
    float core = smoothstep(0.085 + uPx, 0.085 - uPx, d);
    float spokes = stroke(abs(fract(ang / TAU * 8.0) - 0.5) * d * 0.785, 0.014) * step(0.26, d) * step(d, 0.33);
    float halo = exp(-d * d / 0.05) * 0.5 * p1;
    col = vColor.rgb * (ring + core * 0.9 + spokes * 0.6 + halo);
  } else if (kind < 5.5) {
    // 倒數弧：整圈的淡底線，剩下的比例從正上方順時針亮著，弧的盡頭一顆亮點
    float r = p1;
    float turn = fract(atan(vL.x, vL.y) / TAU);
    float left = smoothstep(-uPx, uPx, (p2 - turn) * TAU * d) * step(0.002, p2);
    float ring = stroke(abs(d - r), 0.026);
    float track = stroke(abs(d - r), 0.012) * 0.22;
    float ea = p2 * TAU;
    float head = smoothstep(0.055 + uPx, 0.055 - uPx, length(vL - vec2(sin(ea), cos(ea)) * r)) * step(0.002, p2) * step(p2, 0.998);
    float halo = exp(-pow((d - r) / 0.09, 2.0)) * left * 0.3 * p3;
    col = vColor.rgb * (ring * left + track + head + halo);
  } else {
    // 關節
    float ring = stroke(abs(d - p1), 0.02);
    float core = smoothstep(p1 * 0.45 + uPx, p1 * 0.45 - uPx, d);
    col = vColor.rgb * (ring + core * 0.8);
  }

  float fade = smoothstep(1.0, 0.86, max(abs(vUv.x), abs(vUv.y)));
  gl_FragColor = vec4(col * vColor.a * fade, 1.0);
}
`;

export const segVert = /* glsl */ `
attribute vec4 iAB; // A.xy, B.xy
attribute vec4 iColor;
attribute vec4 iParam; // 整片的寬度, mode (SEG_*), A 端沿線的累積長度, lit
attribute vec4 iExtra; // 線的半寬, p1, p2, 累積長度的縮放
attribute vec4 iNb; // 折線上的前一點.xy、後一點.xy：接縫照兩段的夾角斜接，光暈才不會裂開或疊亮
varying float vD;
varying float vS;
varying float vU;
varying vec4 vColor;
varying vec4 vParam;
varying vec4 vExtra;
void main() {
  vec2 dir = iAB.zw - iAB.xy;
  float len = length(dir);
  vec2 t = len > 0.00001 ? dir / len : vec2(1.0, 0.0);
  vec2 n = vec2(-t.y, t.x);
  float u = position.x + 0.5;
  vec2 other = u < 0.5 ? iAB.xy - iNb.xy : iNb.zw - iAB.zw;
  float ol = length(other);
  vec2 j = t + (ol > 0.00001 ? other / ol : t);
  float jl = length(j);
  vec2 m = jl > 0.00001 ? vec2(-j.y, j.x) / jl : n;
  vec2 p = mix(iAB.xy, iAB.zw, u) + m * (position.y * iParam.x / max(dot(m, n), 0.5));
  vD = position.y * iParam.x;
  vS = (iParam.z + dot(p - iAB.xy, t)) * iExtra.w;
  vU = u;
  vColor = iColor;
  vParam = iParam;
  vExtra = iExtra;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
}
`;

export const segFrag = /* glsl */ `
uniform float uPx;
varying float vD;
varying float vS;
varying float vU;
varying vec4 vColor;
varying vec4 vParam;
varying vec4 vExtra;

float stroke(float dist, float hw) {
  float w = max(hw, uPx * 0.6);
  return smoothstep(w + uPx * 0.8, w - uPx * 0.8, dist);
}

// 沿線往前跑的一團光：頭亮、尾巴拖長
float comet(float x) {
  return pow(x, 4.0) * smoothstep(1.0, 0.86, x);
}

void main() {
  float d = abs(vD);
  float mode = vParam.y;
  float lit = vParam.w;
  float hw = vExtra.x;
  float p1 = vExtra.y;
  float p2 = vExtra.z;
  float edge = vParam.x * 0.5;
  float fall = edge * 0.42;
  float glow = exp(-d * d / (fall * fall));
  float shape = 0.0;

  if (mode < 0.5) {
    shape = stroke(d, hw) + glow * 0.4 * lit;
  } else if (mode < 1.5) {
    float core = stroke(d, hw);
    float run = comet(fract((vS - p1) / ${RAIL_WAVE.toFixed(4)}));
    shape = core + lit * (glow * 0.42 + run * (core * 1.6 + glow * 1.1));
  } else if (mode < 2.5) {
    float rails = stroke(abs(d - p2), hw);
    float inside = smoothstep(p2 + uPx, p2 - uPx, d);
    float cell = (vS - p1) / ${BELT_PITCH.toFixed(4)};
    float slat = stroke(abs(fract(cell) - 0.5) * ${BELT_PITCH.toFixed(4)}, hw * 0.8) * inside;
    float run = comet(fract(cell / ${BELT_WAVE_SLATS.toFixed(1)}));
    shape = rails + slat * 0.5
      + lit * (glow * 0.3 + inside * 0.07 + run * (inside * 0.4 + slat * 1.2 + rails * 0.8));
  } else if (mode < 3.5) {
    float q = d / edge;
    shape = smoothstep(1.0, 0.9, q) * (0.35 + 0.65 * q * q * q);
  } else if (mode < 4.5) {
    shape = stroke(d, hw) * step(0.5, fract(vS / 0.24));
  } else {
    float w = hw * (1.0 - 0.75 * vU);
    // 頭那一端藏在彈珠底下，從零淡入，才不會在球上切出一條線
    shape = smoothstep(w + uPx, w * 0.15, d) * pow(1.0 - vU, 1.6) * smoothstep(0.0, 0.3, vU);
  }

  gl_FragColor = vec4(vColor.rgb * shape * vColor.a * smoothstep(edge, edge * 0.85, d), 1.0);
}
`;

export const starVert = /* glsl */ `
attribute float aSize;
uniform float uScale;
varying float vDim;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.0, aSize * uScale / -mv.z);
  vDim = aSize;
  gl_Position = projectionMatrix * mv;
}
`;

export const starFrag = /* glsl */ `
varying float vDim;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  gl_FragColor = vec4(vec3(0.55, 0.65, 0.9) * a * a * (0.2 + 0.4 * vDim), 1.0);
}
`;
