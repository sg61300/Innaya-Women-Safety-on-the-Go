import { useEffect } from "react";
import { View, Text, useWindowDimensions } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, useDerivedValue, withDelay, withTiming, Easing } from "react-native-reanimated";
import { Canvas, Fill, Shader, ImageShader, Group, Circle, RadialGradient, Image as SkImage, useImage, Skia, vec } from "@shopify/react-native-skia";
import { splashTimeline } from "../lib/splashTiming";
import { FACE } from "../lib/splashWarp";

// INNAYA splash v2: the engraved woman COMES ALIVE. A Skia RuntimeEffect (SkSL)
// warps the rose-gold emblem per pixel from the same three fields as the founder's
// motion reference (step/lift, wind A, wind B) driven by ONE Reanimated value t in
// 0..1: one lift and forward extension to a single landing, hair and drape swinging
// ~2x the first reference. The ring and star are pinned by a static mask texture
// (zero displacement); the face/neck translate RIGIDLY via the head-blend built
// into the field math (never warped). The ground is forced flat (#0C0A1E) by the
// red<=24 rule both in the warp source and after sampling, so the stronger motion
// never drags a box or halo onto the ink. A specular cream sweep rides the metal
// (confined to non-ground pixels, so it can never leak a box), the star warms with
// a soft radial glow, and the "INNAYA" wordmark fades in. Whole splash < 2.0 s, no
// loop: it eases out and rests exactly on the still (t=0 == t=1 == no motion).
// With `reduceMotion` the still + wordmark render at once, no warp, no sweep.
// Built only on libraries already in the app (@shopify/react-native-skia,
// react-native-reanimated). The SkSL mirrors src/lib/splashWarp.ts line for line;
// that module's math is unit-tested in JS (the GPU composite is proved on the
// spec render and, later, on device).
const INK = "#0C0A1E";
const CREAM = "#F4EEF8";
const EMBLEM = require("../../assets/brand/splash-emblem.png");
const PIN = require("../../assets/brand/splash-pin.png");

// SkSL warp. `emblem` and `pin` are child image shaders mapped onto the emblem
// rect (so eval() takes device-pixel coords). Uniforms: the rect origin/size, the
// three phase scalars, the rigid face translation and box, and the sweep position.
export const SKSL = `
uniform shader emblem;
uniform shader pin;
uniform float2 origin;      // emblem rect top-left, device px
uniform float  em;          // emblem rect size, device px
uniform float  lift;        // sin(pi t)^2 (named lift: "step" is an SkSL built-in)
uniform float  windA;       // sin(2 pi t)
uniform float  windB;       // 0.5(1-cos(2 pi t))
uniform float  sweep;       // 0..1 specular band position (<0 = off)
uniform float2 faceD;       // rigid face translation, source px (dx,dy)
uniform float4 faceBox;     // x0,y0,x1,y1 source px

const float3 INK = float3(12.0/255.0, 10.0/255.0, 30.0/255.0);
const float GROUND = 24.0/255.0;

float sm(float a, float b, float v){ float t = clamp((v-a)/(b-a),0.0,1.0); return t*t*(3.0-2.0*t); }
float g(float2 p, float2 c, float2 s){ float2 d=(p-c)/s; return exp(-0.5*dot(d,d)); }

half4 main(float2 xy){
  float2 src = (xy - origin) / em * 1024.0;      // device px -> 1024 master space
  // pinned ring/star: identity, keep the original engraving rigid
  if (pin.eval(xy).r > 0.5) { return emblem.eval(xy); }

  float xx = src.x, yy = src.y;
  float body = sm(370.0,535.0,xx)*sm(260.0,350.0,yy)*(1.0-sm(930.0,970.0,yy));
  float leg  = g(src, float2(690.0,814.0), float2(75.0,115.0))*sm(540.0,610.0,yy);
  float foot = g(src, float2(747.0,893.0), float2(48.0,41.0));
  float armL = g(src, float2(440.0,575.0), float2(40.0,65.0));
  float armR = g(src, float2(736.0,548.0), float2(45.0,45.0));
  float hair = g(src, float2(440.0,355.0), float2(112.0,76.0))*(1.0-sm(540.0,575.0,xx))*(1.0-sm(431.0,450.0,yy));
  float topD = g(src, float2(405.0,187.0), float2(300.0,97.0))*(1.0-sm(283.0,338.0,yy));
  float leftD= g(src, float2(240.0,447.0), float2(126.0,120.0))*(1.0-sm(446.0,513.0,xx));
  float lowD = g(src, float2(297.0,702.0), float2(185.0,155.0))*(1.0-sm(468.0,537.0,xx))*sm(503.0,565.0,yy);
  float head = (1.0-sm(0.0,18.0,max(max(faceBox.x-xx, xx-faceBox.z),0.0)))
             * (1.0-sm(0.0,18.0,max(max(faceBox.y-yy, yy-faceBox.w),0.0)));

  float sx = 7.0*body - 18.0*leg - 10.0*foot - 3.0*armL + 3.0*armR;
  float sy = -7.2*body - 11.0*leg - 9.0*foot + 2.4*armL - 2.4*armR;
  sx = sx*(1.0-head) + faceD.x*head;
  sy = sy*(1.0-head) + faceD.y*head;
  float m = 2.0*(1.0-head);
  float dxA = m*(-3.7*hair -2.3*topD -2.5*leftD -3.1*lowD);
  float dyA = m*( 4.0*hair +3.4*topD +3.1*leftD +4.4*lowD);
  float dxB = m*( 1.5*hair +1.1*topD -1.5*leftD +1.3*lowD);
  float dyB = m*(-1.5*hair +1.4*topD -1.2*leftD +1.9*lowD);

  float2 dSrc = float2(sx*lift + dxA*windA + dxB*windB,
                       sy*lift + dyA*windA + dyB*windB);
  float2 sampleXY = xy - dSrc * em / 1024.0;     // back to device px

  // mirror render.mjs "moving" buffer: a sample that lands on a pinned pixel reads
  // flat ink, so the warped figure never drags the ring or star.
  half4 c;
  if (pin.eval(sampleXY).r > 0.5) { c = half4(half3(INK), 1.0); }
  else { c = emblem.eval(sampleXY); }

  // ground snap: red<=24 -> exact ink (founder rule, applied after warp)
  if (c.r <= GROUND) { c = half4(half3(INK), 1.0); }

  // specular sweep: cream band riding the metal only (never the ground, so never
  // a box). A feathered gaussian in x following sweep, added where c is metal.
  if (sweep >= 0.0 && c.r > GROUND) {
    float cx = mix(-0.15, 1.15, sweep);          // band centre in 0..1 emblem x
    float u = (xy.x - origin.x) / em;
    float band = exp(-0.5 * pow((u - cx)/0.14, 2.0));
    c = half4(clamp(c.rgb + half3(float3(244.0,238.0,248.0)/255.0) * half(band) * 0.6, 0.0, 1.0), c.a);
  }
  return c;
}`;

// RuntimeEffect.Make THROWS on an SkSL compile error; at module scope that killed
// the app on launch (s29 device run: uniform named `step`). Never again: a shader
// failure logs and falls back to the still emblem.
function makeEffect() {
  try {
    return Skia.RuntimeEffect.Make(SKSL);
  } catch (e) {
    console.error("[splash] SkSL compile failed, using still emblem", e);
    return null;
  }
}
const effect = makeEffect();

export function SplashSequence({ onDone, reduceMotion = false }: { onDone: () => void; reduceMotion?: boolean }) {
  const t = splashTimeline();
  const { width, height } = useWindowDimensions();
  const emblem = useImage(EMBLEM);
  const pin = useImage(PIN);

  // emblem placement: a centred square in the upper-middle so the wordmark sits
  // below it without crowding the vertical centre.
  const EM = Math.min(width, height) * 0.62;
  const dx = (width - EM) / 2;
  const dy = height * 0.26;

  // one driver for the whole warp; sweep/star/word are derived or separate values.
  const warp = useSharedValue(reduceMotion ? 1 : 0);
  const sweep = useSharedValue(reduceMotion ? -1 : 0);
  const star = useSharedValue(0);
  const word = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    console.log("[splash] start", { reduceMotion, hasShader: !!effect });
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (reduceMotion) {
      timers.push(setTimeout(onDone, t.reducedDoneMs));
    } else {
      // warp 0->1 eases in and out; sin(pi t)^2 inside the shader rests it on the
      // still at both ends, so a linear-in-time t with an ease curve is loop-free.
      warp.value = withDelay(t.warpStartMs, withTiming(1, { duration: t.warpDurationMs, easing: Easing.inOut(Easing.ease) }));
      sweep.value = withDelay(t.sweepStartMs, withTiming(1, { duration: t.sweepDurationMs, easing: Easing.inOut(Easing.ease) }));
      star.value = withDelay(t.starStartMs, withTiming(1, { duration: t.starDurationMs, easing: Easing.out(Easing.ease) }));
      word.value = withDelay(t.wordmarkStartMs, withTiming(1, { duration: t.wordmarkDurationMs, easing: Easing.out(Easing.ease) }));
      timers.push(setTimeout(onDone, t.doneMs));
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // shader uniforms derived from the single warp value (phase scalars live here).
  const uniforms = useDerivedValue(() => {
    const tt = warp.value;
    const phase = 2 * Math.PI * tt;
    return {
      origin: vec(dx, dy),
      em: EM,
      lift: Math.sin(Math.PI * tt) ** 2,
      windA: Math.sin(phase),
      windB: 0.5 * (1 - Math.cos(phase)),
      sweep: sweep.value,
      faceD: [FACE.dx, FACE.dy],
      faceBox: [FACE.x0, FACE.y0, FACE.x1, FACE.y1],
    };
  });

  const starOpacity = useDerivedValue(() => star.value);
  const starCx = dx + EM * 0.63;
  const starCy = dy + EM * 0.3;
  const wordStyle = useAnimatedStyle(() => ({ opacity: word.value }));

  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: INK, alignItems: "center" }} testID="splash">
      <Canvas style={{ position: "absolute", top: 0, left: 0, width, height }}>
        {emblem && pin && effect && (
          <>
            <Fill>
              <Shader source={effect} uniforms={uniforms}>
                <ImageShader image={emblem} rect={{ x: dx, y: dy, width: EM, height: EM }} fit="fill" tx="clamp" ty="clamp" />
                <ImageShader image={pin} rect={{ x: dx, y: dy, width: EM, height: EM }} fit="fill" tx="clamp" ty="clamp" />
              </Shader>
            </Fill>
            {/* star warm: a soft radial glow (a circle, never a box) */}
            <Group opacity={starOpacity} blendMode="plus">
              <Circle cx={starCx} cy={starCy} r={EM * 0.08}>
                <RadialGradient c={vec(starCx, starCy)} r={EM * 0.08} colors={["rgba(244,238,248,0.55)", "rgba(244,238,248,0)"]} />
              </Circle>
            </Group>
          </>
        )}
        {emblem && !effect && <SkImage image={emblem} x={dx} y={dy} width={EM} height={EM} fit="fill" />}
      </Canvas>
      <Animated.View style={[{ position: "absolute", top: dy + EM + Math.min(width, height) * 0.03, width }, wordStyle]}>
        <Text
          testID="splash-wordmark"
          accessibilityLabel="INNAYA"
          style={{ color: CREAM, fontFamily: "Spectral_600SemiBold", fontSize: Math.min(width, height) * 0.09, letterSpacing: Math.min(width, height) * 0.03, textAlign: "center" }}
        >
          INNAYA
        </Text>
        <Text
          testID="splash-tagline"
          style={{ color: CREAM, opacity: 0.86, fontFamily: "WorkSans_400Regular", fontSize: Math.min(width, height) * 0.036, letterSpacing: 0.3, textAlign: "center", marginTop: Math.min(width, height) * 0.02, paddingHorizontal: 24 }}
        >
          The companion who cares, every step of the way
        </Text>
      </Animated.View>
    </View>
  );
}
