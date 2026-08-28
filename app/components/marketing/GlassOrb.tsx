"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeMotion } from "@/lib/motionEngine";

// A refractive glass orb, in raw WebGL.
//
// Written as a single fullscreen fragment shader rather than with a 3D
// engine. The whole scene is one analytically-intersected sphere, so there
// is no mesh, no camera rig and no scene graph to justify importing one --
// three.js would have added several hundred kilobytes to use perhaps two
// percent of it.
//
// How it works:
//   1. The marquee text is drawn onto a 2D canvas each frame and uploaded
//      as a texture. That canvas is the "world" behind the glass.
//   2. The shader ray-marches nothing -- it solves the ray/sphere
//      intersection directly, refracts the view ray through the front and
//      back surfaces (Snell, via GLSL's refract), and samples the text
//      texture at the exit point.
//   3. Chromatic aberration comes from refracting R, G and B at slightly
//      different indices, which is what real glass does and what makes the
//      difference between "a blurry circle" and "glass".
//   4. A Fresnel term brightens the rim, because grazing angles reflect
//      more -- without it the orb reads as a hole rather than an object.
//
// Everything degrades: no WebGL, or reduced motion, and the component
// renders the same text as plain DOM with a soft CSS orb behind it.

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;

varying vec2 vUv;
uniform sampler2D uText;
uniform vec2 uResolution;
uniform vec2 uOrb;        // orb centre, pixels
uniform float uRadius;    // orb radius, pixels
uniform float uTime;
uniform float uEnergy;    // 0..1 from pointer/scroll velocity

// Samples the text layer with a small offset, in normalised space.
vec4 sampleText(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return texture2D(uText, uv);
}

void main() {
  vec2 frag = vUv * uResolution;
  vec2 d = frag - uOrb;
  float dist = length(d);

  vec4 behind = sampleText(vUv);

  if (dist > uRadius) {
    // Outside the glass: a faint bloom so the orb sits in the scene rather
    // than being cut out of it.
    float halo = smoothstep(uRadius * 1.9, uRadius, dist) * 0.16;
    vec3 haloCol = mix(vec3(0.0, 1.0, 0.4), vec3(0.0, 0.85, 1.0), 0.5 + 0.5 * sin(uTime * 0.4));
    gl_FragColor = vec4(behind.rgb + haloCol * halo, max(behind.a, halo));
    return;
  }

  // Reconstruct the sphere normal from the screen-space offset. z is the
  // height of the sphere surface above the screen plane at this pixel.
  vec2 p = d / uRadius;
  float z = sqrt(max(0.0, 1.0 - dot(p, p)));
  vec3 normal = normalize(vec3(p, z));

  // View ray points into the screen.
  vec3 view = vec3(0.0, 0.0, -1.0);

  // Refract per channel. Slightly different indices give real dispersion.
  float baseIor = 1.0 / 1.46;
  vec3 rR = refract(view, normal, baseIor * 0.982);
  vec3 rG = refract(view, normal, baseIor);
  vec3 rB = refract(view, normal, baseIor * 1.018);

  // Displacement scales with how deep the ray travels through the glass.
  // Kept small on purpose: a physically large offset pushes most samples
  // outside the text layer entirely, and an orb full of empty samples reads
  // as a black hole rather than as glass. The goal is a legible warp, not
  // maximum distortion.
  float thickness = z * uRadius * 0.55;
  vec2 offR = rR.xy * thickness / uResolution;
  vec2 offG = rG.xy * thickness / uResolution;
  vec2 offB = rB.xy * thickness / uResolution;

  vec3 refracted = vec3(
    sampleText(vUv + offR).r,
    sampleText(vUv + offG).g,
    sampleText(vUv + offB).b
  );

  // Alpha from the green channel's sample, so text inside the orb still
  // composites over the page background.
  float alpha = sampleText(vUv + offG).a;

  // Fresnel rim: grazing angles reflect more.
  float fresnel = pow(1.0 - z, 3.0);
  vec3 rimColour = mix(vec3(0.0, 1.0, 0.4), vec3(0.0, 0.78, 1.0), 0.5 + 0.5 * sin(uTime * 0.5));
  vec3 rim = rimColour * fresnel * (0.42 + uEnergy * 0.5);

  // A single moving specular highlight sells it as a solid object.
  vec3 lightDir = normalize(vec3(0.45 + 0.18 * sin(uTime * 0.3), 0.6, 0.75));
  float spec = pow(max(0.0, dot(normal, lightDir)), 42.0);

  // Internal tint. Without a body the sphere only exists where there
  // happens to be text behind it, so it flickers in and out of existence as
  // the marquee passes.
  vec3 body = mix(vec3(0.015, 0.055, 0.045), vec3(0.0, 0.10, 0.08), 1.0 - z);

  vec3 colour = refracted + rim + body + spec * 0.8;

  // The glass is always at least faintly present, then brightens with the
  // refracted content, the rim and the highlight.
  float glass = 0.13 + fresnel * 0.6 + spec * 0.9;
  gl_FragColor = vec4(colour, clamp(max(alpha, glass), 0.0, 1.0));
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Orb shader failed:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

const LINES = ["STOP DECIDING.", "START KNOWING."];

export function GlassOrb({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setFallback(true);
      return;
    }

    const gl =
      (canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false }) as
        | WebGLRenderingContext
        | null) ?? null;

    if (!gl) {
      setFallback(true);
      return;
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const program = gl.createProgram();
    if (!vs || !fs || !program) {
      setFallback(true);
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Orb link failed:", gl.getProgramInfoLog(program));
      setFallback(true);
      return;
    }
    gl.useProgram(program);

    // Fullscreen triangle pair.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uText = gl.getUniformLocation(program, "uText");
    const uResolution = gl.getUniformLocation(program, "uResolution");
    const uOrb = gl.getUniformLocation(program, "uOrb");
    const uRadius = gl.getUniformLocation(program, "uRadius");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uEnergy = gl.getUniformLocation(program, "uEnergy");

    // --- The text layer, drawn to a 2D canvas and used as the texture ---
    const textCanvas = document.createElement("canvas");
    const ctx = textCanvas.getContext("2d");
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    let width = 0;
    let height = 0;
    // Capped device pixel ratio: a 3x retina phone rendering a fullscreen
    // fragment shader every frame is a battery fire for no visible gain.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width * dpr));
      height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.width = width;
      canvas.height = height;
      textCanvas.width = width;
      textCanvas.height = height;
      gl.viewport(0, 0, width, height);
    };

    resize();
    window.addEventListener("resize", resize);

    let energy = 0;
    let pointer = { x: 0.5, y: 0.5 };
    const unsubscribe = subscribeMotion((m) => {
      energy = Math.min(1, m.pointerVelocity * 0.7 + m.scrollVelocity * 0.6);
      pointer = { x: m.pointerNormX, y: m.pointerNormY };
    });

    let raf = 0;
    const startedAt = performance.now();
    // Orb centre eases toward the pointer so it feels attracted, not glued.
    const orb = { x: 0.5, y: 0.46 };

    const draw = () => {
      const t = (performance.now() - startedAt) / 1000;

      // Text layer, redrawn each frame so the marquee actually moves.
      if (ctx) {
        ctx.clearRect(0, 0, width, height);
        const fontSize = Math.max(30, width * 0.072);
        ctx.font = `800 ${fontSize}px Archivo, system-ui, sans-serif`;
        ctx.textBaseline = "middle";

        const speed = 46 * dpr;
        LINES.forEach((line, i) => {
          const y = height * (0.4 + i * 0.19);
          const metrics = ctx.measureText(line + "   ");
          const span = metrics.width;
          // Alternate direction per line, and wrap by the measured width so
          // there is never a visible seam.
          const dir = i % 2 === 0 ? -1 : 1;
          let offset = ((t * speed * dir) % span);
          if (offset > 0) offset -= span;

          ctx.fillStyle = i % 2 === 0 ? "#ffffff" : "#00ff66";
          for (let x = offset; x < width + span; x += span) {
            ctx.fillText(line + "   ", x, y);
          }
        });
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);

      // Ease the orb toward the pointer, with a slow idle drift so it is
      // never completely still even when the pointer is not moving.
      const targetX = 0.5 + (pointer.x - 0.5) * 0.22 + Math.sin(t * 0.25) * 0.014;
      const targetY = 0.46 + (pointer.y - 0.5) * 0.16 + Math.cos(t * 0.31) * 0.016;
      orb.x += (targetX - orb.x) * 0.045;
      orb.y += (targetY - orb.y) * 0.045;

      const radius = Math.min(width, height) * (0.29 + energy * 0.015);

      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uText, 0);
      gl.uniform2f(uResolution, width, height);
      // WebGL's origin is bottom-left; the pointer's is top-left.
      gl.uniform2f(uOrb, orb.x * width, (1 - orb.y) * height);
      gl.uniform1f(uRadius, radius);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uEnergy, energy);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    // A lost context must not leave a dead black rectangle on the hero.
    const onLost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(raf);
      setFallback(true);
    };
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
      gl.deleteTexture(texture);
    };
  }, []);

  return (
    <div className={`pointer-events-none absolute inset-0 ${className || ""}`}>
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        aria-hidden="true"
        style={{ display: fallback ? "none" : "block" }}
      />

      {/* Fallback: the same words, as real DOM, with a soft CSS orb. */}
      {fallback && (
        <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
          <div
            className="absolute left-1/2 top-[46%] h-[46vmin] w-[46vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background:
                "radial-gradient(circle at 35% 30%, rgb(255 255 255 / 0.1), rgb(0 255 102 / 0.06) 45%, transparent 70%)",
              border: "1px solid rgb(0 255 102 / 0.16)",
              backdropFilter: "blur(2px)",
            }}
          />
          <div className="absolute inset-0 flex flex-col justify-center gap-2">
            {LINES.map((line, i) => (
              <div
                key={line}
                className="brutal whitespace-nowrap text-[clamp(3rem,11vw,9rem)]"
                style={{ color: i % 2 === 0 ? "#ffffff" : "#00ff66", opacity: 0.9 }}
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
