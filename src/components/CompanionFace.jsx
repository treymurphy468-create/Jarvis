import { useEffect, useRef } from 'react';

const BLINK_MIN = 2500;
const BLINK_MAX = 6000;

export default function CompanionFace({ mood = 'neutral', audioLevel = 0, isSpeaking }) {
  const leftEyeRef = useRef(null);
  const rightEyeRef = useRef(null);
  const mouthRef = useRef(null);

  // Natural blinking
  useEffect(() => {
    let timeout;
    const blink = () => {
      [leftEyeRef, rightEyeRef].forEach((ref) => {
        if (ref.current) ref.current.classList.add('blink');
      });
      setTimeout(() => {
        [leftEyeRef, rightEyeRef].forEach((ref) => {
          if (ref.current) ref.current.classList.remove('blink');
        });
      }, 150);
      timeout = setTimeout(blink, BLINK_MIN + Math.random() * (BLINK_MAX - BLINK_MIN));
    };
    timeout = setTimeout(blink, 2000);
    return () => clearTimeout(timeout);
  }, []);

  // Speech-synced mouth
  useEffect(() => {
    if (!mouthRef.current) return;
    const open = isSpeaking ? 0.3 + audioLevel * 0.7 : 0.05;
    mouthRef.current.style.transform = `scaleY(${open})`;
  }, [audioLevel, isSpeaking]);

  const moodClass = `face mood-${mood}`;

  return (
    <div className={moodClass}>
      <svg viewBox="0 0 200 200" className="face-svg">
        <defs>
          <radialGradient id="faceGlow" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#1a3a5c" />
            <stop offset="100%" stopColor="#0a1628" />
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="88" fill="url(#faceGlow)" stroke="#2a5a8a" strokeWidth="2" />

        {/* Eyes */}
        <ellipse ref={leftEyeRef} className="eye left" cx="70" cy="85" rx="14" ry="18" fill="#4ecdc4" />
        <ellipse ref={rightEyeRef} className="eye right" cx="130" cy="85" rx="14" ry="18" fill="#4ecdc4" />
        <circle cx="70" cy="85" r="6" fill="#0a1628" className="pupil" />
        <circle cx="130" cy="85" r="6" fill="#0a1628" className="pupil" />

        {/* Mouth */}
        <ellipse
          ref={mouthRef}
          className="mouth"
          cx="100"
          cy="130"
          rx="22"
          ry="8"
          fill="#4ecdc4"
          style={{ transformOrigin: '100px 130px', transition: 'transform 0.05s ease' }}
        />

        {/* Mood indicators */}
        {mood === 'thinking' && (
          <g className="thinking-dots">
            <circle cx="160" cy="40" r="4" fill="#4ecdc4" opacity="0.6">
              <animate attributeName="opacity" values="0.3;1;0.3" dur="1.2s" repeatCount="indefinite" />
            </circle>
            <circle cx="175" cy="50" r="4" fill="#4ecdc4" opacity="0.6">
              <animate attributeName="opacity" values="0.3;1;0.3" dur="1.2s" begin="0.2s" repeatCount="indefinite" />
            </circle>
            <circle cx="190" cy="40" r="4" fill="#4ecdc4" opacity="0.6">
              <animate attributeName="opacity" values="0.3;1;0.3" dur="1.2s" begin="0.4s" repeatCount="indefinite" />
            </circle>
          </g>
        )}
      </svg>
    </div>
  );
}
