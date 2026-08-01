import { useEffect, useRef, useState } from 'react';

const RING_COUNT = 24;

function RingDots({ cx, cy, r, count, className }) {
  return (
    <g className={className}>
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2;
        return (
          <circle
            key={i}
            cx={cx + Math.cos(angle) * r}
            cy={cy + Math.sin(angle) * r}
            r="2.2"
          />
        );
      })}
    </g>
  );
}

function RingTicks({ cx, cy, r, count, length, className }) {
  return (
    <g className={className}>
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
        const x1 = cx + Math.cos(angle) * (r - length);
        const y1 = cy + Math.sin(angle) * (r - length);
        const x2 = cx + Math.cos(angle) * r;
        const y2 = cy + Math.sin(angle) * r;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            strokeWidth={i % 3 === 0 ? 2.5 : 1.2}
            opacity={i % 3 === 0 ? 1 : 0.55}
          />
        );
      })}
    </g>
  );
}

export default function CompanionFace({
  mood = 'neutral',
  audioLevel = 0,
  speechPulse = 0,
  isSpeaking,
}) {
  const hudRef = useRef(null);
  const svgRef = useRef(null);
  const [ripples, setRipples] = useState([]);
  const lastPulseRef = useRef(0);
  const audioLevelRef = useRef(audioLevel);
  const speechPulseRef = useRef(speechPulse);

  useEffect(() => { audioLevelRef.current = audioLevel; }, [audioLevel]);
  useEffect(() => { speechPulseRef.current = speechPulse; }, [speechPulse]);

  useEffect(() => {
    let frame;
    const tick = () => {
      const level = audioLevelRef.current;
      const pulse = speechPulseRef.current;
      if (hudRef.current) {
        hudRef.current.style.setProperty('--hud-level', String(level));
        hudRef.current.style.setProperty('--hud-pulse', String(pulse));
      }
      if (svgRef.current) {
        const scale = 1 + pulse * 0.14 + level * 0.06;
        const glow = 12 + pulse * 36 + level * 20;
        svgRef.current.style.transform = `scale(${scale})`;
        svgRef.current.style.filter =
          `drop-shadow(0 0 ${glow}px color-mix(in srgb, var(--face-color, #00d4ff) ${60 + pulse * 40}%, transparent))`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Spawn ripple ring on each syllable peak
  useEffect(() => {
    if (speechPulse > 0.65 && speechPulse > lastPulseRef.current + 0.2) {
      const id = Date.now() + Math.random();
      setRipples((prev) => [...prev.slice(-4), id]);
      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r !== id));
      }, 600);
    }
    lastPulseRef.current = speechPulse;
  }, [speechPulse]);

  const moodClass = `face hud-face mood-${mood}${isSpeaking ? ' speaking' : ''}`;

  return (
    <div ref={hudRef} className={moodClass}>
      <svg ref={svgRef} viewBox="0 0 200 200" className="face-svg hud-svg">
        <defs>
          <filter id="hudGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--face-color, #00d4ff)" stopOpacity="1" />
            <stop offset="50%" stopColor="var(--face-color, #00d4ff)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--face-color, #00d4ff)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Syllable ripples — expand outward on each vowel beat */}
        {ripples.map((id) => (
          <circle
            key={id}
            cx="100"
            cy="100"
            r="30"
            className="hud-ripple"
            fill="none"
            stroke="var(--face-color, #00d4ff)"
            strokeWidth="2"
          />
        ))}

        <g className="hud-pulse-group">
          <g className="hud-ring ring-outer" filter="url(#hudGlow)">
            {Array.from({ length: RING_COUNT }, (_, i) => {
              const start = (i / RING_COUNT) * 360;
              const span = i % 4 === 0 ? 10 : i % 2 === 0 ? 5 : 3;
              return (
                <path
                  key={i}
                  d={describeArc(100, 100, 88, start, start + span)}
                  fill="none"
                  stroke="var(--face-color, #00d4ff)"
                  strokeWidth={i % 4 === 0 ? 3 : 1.5}
                  strokeLinecap="round"
                  opacity={i % 4 === 0 ? 1 : 0.5}
                />
              );
            })}
          </g>

          <RingDots cx={100} cy={100} r={72} count={36} className="hud-ring ring-dots" />

          <circle
            cx="100"
            cy="100"
            r="62"
            className="hud-ring ring-thin"
            fill="none"
            stroke="var(--face-color, #00d4ff)"
            strokeWidth="1"
            opacity="0.7"
          />

          <RingTicks cx={100} cy={100} r={52} count={48} length={8} className="hud-ring ring-ticks" />

          <g className="hud-ring ring-inner">
            {Array.from({ length: 32 }, (_, i) => {
              const angle = (i / 32) * Math.PI * 2;
              return (
                <line
                  key={i}
                  x1={100 + Math.cos(angle) * 38}
                  y1={100 + Math.sin(angle) * 38}
                  x2={100 + Math.cos(angle) * 44}
                  y2={100 + Math.sin(angle) * 44}
                  stroke="var(--face-color, #00d4ff)"
                  strokeWidth={i % 4 === 0 ? 2 : 1}
                  opacity={i % 4 === 0 ? 1 : 0.45}
                />
              );
            })}
          </g>

          <circle cx="100" cy="100" r="28" fill="url(#coreGlow)" className="hud-core" />
          <circle cx="100" cy="100" r="8" fill="var(--face-color, #00d4ff)" className="hud-core-dot" />
        </g>

        {mood === 'thinking' && (
          <g className="hud-scan">
            <line x1="100" y1="100" x2="100" y2="28" stroke="var(--face-color, #00d4ff)" strokeWidth="1.5" opacity="0.8">
              <animateTransform attributeName="transform" type="rotate" from="0 100 100" to="360 100 100" dur="1.5s" repeatCount="indefinite" />
            </line>
          </g>
        )}
      </svg>
    </div>
  );
}

function describeArc(x, y, r, startAngle, endAngle) {
  const start = polarToCartesian(x, y, r, endAngle);
  const end = polarToCartesian(x, y, r, startAngle);
  const large = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
