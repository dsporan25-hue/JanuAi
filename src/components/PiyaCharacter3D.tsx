import React, { useEffect, useRef, useState } from "react";
import type { AssistantVisualState, ThemeId } from "../types/piya";
import type { LipSyncFrame } from "../services/voiceEngine";
import { PIYA_THEMES } from "../constants/themesAndCopy";

export const OFFICIAL_PIYA_CHARACTER_IMAGE =
  "/assets/aistudio/IMG_20261101_220728_26dcd840.jpg";

interface PiyaCharacter3DProps {
  visualState: AssistantVisualState;
  themeId: ThemeId;
  lipSync: LipSyncFrame;
  micLevel: number;
  compactPreview?: boolean;
}

interface AmbientParticle {
  x: number;
  y: number;
  radius: number;
  speedY: number;
  driftX: number;
  alpha: number;
  phase: number;
}

/**
 * Renders the official uploaded PIYA AI main character image completely intact (head-to-toe,
 * zero cropping, zero color/face/hair/dress alteration), framed by a live audio-reactive
 * holographic stage canvas for Idle, Listening, Thinking, and Speaking states.
 */
export const PiyaCharacter3D: React.FC<PiyaCharacter3DProps> = ({
  visualState,
  themeId,
  lipSync,
  micLevel,
  compactPreview = false,
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imgError, setImgError] = useState(false);

  // Subtle interactive 3D stage tilt on drag/pointer move without distorting the character
  const [tilt, setTilt] = useState<{ rx: number; ry: number }>({ rx: 0, ry: 0 });
  const isPointerDownRef = useRef(false);

  const stateRef = useRef<AssistantVisualState>(visualState);
  const themeRef = useRef<ThemeId>(themeId);
  const lipSyncRef = useRef<LipSyncFrame>(lipSync);
  const micLevelRef = useRef<number>(micLevel);

  stateRef.current = visualState;
  themeRef.current = themeId;
  lipSyncRef.current = lipSync;
  micLevelRef.current = micLevel;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = stageRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    let width = Math.max(240, container.clientWidth);
    let height = Math.max(320, container.clientHeight);

    const updateSize = () => {
      if (!container || !canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(240, container.clientWidth);
      height = Math.max(320, container.clientHeight);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(container);

    const particles: AmbientParticle[] = Array.from({ length: 28 }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      radius: 1 + (i % 3) * 0.8,
      speedY: 0.012 + Math.random() * 0.022,
      driftX: (Math.random() - 0.5) * 0.015,
      alpha: 0.2 + Math.random() * 0.45,
      phase: Math.random() * Math.PI * 2,
    }));

    let prevTime = performance.now();
    let smoothedEnergy = 0;

    const renderStageAura = (now: number) => {
      const dt = Math.min(0.05, (now - prevTime) / 1000);
      prevTime = now;
      const elapsed = now / 1000;

      const curState = stateRef.current;
      const theme = PIYA_THEMES[themeRef.current] || PIYA_THEMES["classic-cyan"];

      const targetEnergy =
        curState === "listening"
          ? micLevelRef.current
          : curState === "speaking"
          ? Math.max(lipSyncRef.current.energy, lipSyncRef.current.mouthOpen * 0.85)
          : curState === "thinking"
          ? 0.35 + Math.sin(elapsed * 3.2) * 0.15
          : 0.08;

      smoothedEnergy += (targetEnergy - smoothedEnergy) * Math.min(1, dt * 12);

      ctx.clearRect(0, 0, width, height);

      const cx = width * 0.5;
      const cy = height * 0.5;

      // Soft ambient backdrop halo behind the character frame (never covers the image)
      const haloRadius = Math.min(width, height) * (0.42 + smoothedEnergy * 0.08);
      const grad = ctx.createRadialGradient(cx, cy, haloRadius * 0.12, cx, cy, haloRadius);
      grad.addColorStop(0, theme.accentGlow);
      grad.addColorStop(0.55, theme.accentSoft);
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Thinking state orbital arcs behind character portrait
      if (curState === "thinking") {
        ctx.save();
        ctx.translate(cx, cy * 0.88);
        ctx.rotate(elapsed * 0.9);
        ctx.strokeStyle = theme.accentBright;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1.6;
        const r = Math.min(width, height) * 0.38;
        for (let a = 0; a < 3; a++) {
          const start = (a * Math.PI * 2) / 3;
          ctx.beginPath();
          ctx.arc(0, 0, r, start, start + Math.PI * 0.38);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Listening / Speaking live symmetrical acoustic waveform bars along the stage flanks
      if (curState === "listening" || curState === "speaking") {
        const barCount = 14;
        const maxBarW = Math.min(36, width * 0.08);
        const spanH = height * 0.44;
        const startY = cy - spanH * 0.5;

        ctx.save();
        ctx.fillStyle = theme.accentBright;
        for (let i = 0; i < barCount; i++) {
          const norm = i / (barCount - 1);
          const envelope = Math.sin(norm * Math.PI);
          const wave =
            0.25 +
            0.75 *
              Math.abs(
                Math.sin(elapsed * (curState === "speaking" ? 8.5 : 6.0) + i * 0.65)
              );
          const len = Math.max(3, maxBarW * envelope * wave * (0.25 + smoothedEnergy * 1.15));
          const y = startY + norm * spanH;

          ctx.globalAlpha = 0.22 + smoothedEnergy * 0.52;
          // Left flank outward from center portrait
          const portraitHalfW = Math.min(width * 0.34, (height * 0.62) * 0.5);
          const leftX = Math.max(8, cx - portraitHalfW - 12 - len);
          const rightX = Math.min(width - 8 - len, cx + portraitHalfW + 12);

          ctx.beginPath();
          ctx.roundRect(leftX, y - 2, len, 4, 2);
          ctx.roundRect(rightX, y - 2, len, 4, 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Subtle floating starlight particles matching her cosmic cyan artwork
      for (const p of particles) {
        p.y -= p.speedY * dt * (1 + smoothedEnergy * 1.4);
        p.x += Math.sin(elapsed + p.phase) * p.driftX * dt;
        if (p.y < -0.02) {
          p.y = 1.02;
          p.x = Math.random();
        }
        const px = p.x * width;
        const py = p.y * height;
        const twinkle = 0.55 + 0.45 * Math.sin(elapsed * 2.4 + p.phase);

        ctx.fillStyle = "#67e8f9";
        ctx.globalAlpha = p.alpha * twinkle;
        ctx.beginPath();
        ctx.arc(px, py, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      animId = requestAnimationFrame(renderStageAura);
    };

    animId = requestAnimationFrame(renderStageAura);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  const handlePointerDown = () => {
    isPointerDownRef.current = true;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current && e.pointerType === "touch") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
    const ny = ((e.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2;
    setTilt({
      rx: Math.max(-5, Math.min(5, -ny * 4.5)),
      ry: Math.max(-7, Math.min(7, nx * 6.5)),
    });
  };

  const handlePointerReset = () => {
    isPointerDownRef.current = false;
    setTilt({ rx: 0, ry: 0 });
  };

  // Gentle state-driven compositor transform (never crops or alters the character's pixels/colors)
  const activeVoiceScale =
    visualState === "speaking"
      ? 1 + Math.min(0.022, lipSync.mouthOpen * 0.02 + lipSync.energy * 0.01)
      : visualState === "listening"
      ? 1.014 + Math.min(0.016, micLevel * 0.02)
      : 1;

  return (
    <div
      ref={stageRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerReset}
      onPointerLeave={handlePointerReset}
      className="relative w-full h-full flex items-center justify-center overflow-hidden select-none bg-[#02050d]"
    >
      {/* Background Holographic & Voice-Reactive Stage Canvas */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 w-full h-full z-0"
        aria-hidden="true"
      />

      {/* Official Uploaded PIYA AI Main Character Image (Full Body Head-to-Toe, Unmodified Colors & Appearance) */}
      <div
        className={`relative z-10 w-full h-full flex items-center justify-center ${
          compactPreview ? "p-2 sm:p-3" : "p-2 sm:p-4"
        }`}
        style={{ perspective: "1100px" }}
      >
        {!imgError ? (
          <div
            className="relative h-full w-full flex items-center justify-center transition-transform duration-200 ease-out"
            style={{
              transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) scale(${activeVoiceScale})`,
            }}
          >
            <img
              src={OFFICIAL_PIYA_CHARACTER_IMAGE}
              alt="Janu AI official main character"
              onError={() => setImgError(true)}
              draggable={false}
              className="max-h-full max-w-full w-auto h-full object-contain rounded-2xl shadow-[0_0_45px_rgba(6,182,212,0.22)]"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-6 rounded-2xl border border-[var(--piya-border)] bg-[var(--piya-surface)]">
            <span className="font-display text-lg font-semibold text-slate-100">Janu AI</span>
            <span className="text-xs text-slate-400 mt-1">Character Asset Unavailable</span>
          </div>
        )}
      </div>
    </div>
  );
};
