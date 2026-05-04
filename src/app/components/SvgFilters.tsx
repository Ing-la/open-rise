export default function SvgFilters({ children }: { children: React.ReactNode }) {
  return (
    <>
      <svg className="fixed top-0 left-0 w-0 h-0 overflow-hidden" aria-hidden="true" focusable="false">
        <defs>
          <filter id="tremble" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.15 0.08" numOctaves="3" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.8" xChannelSelector="R" yChannelSelector="G" result="displaced" />
            <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="2" result="grain" />
            <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.08 0.08 0.08 0 0" in="grain" result="grainAlpha" />
            <feComposite in="grainAlpha" in2="displaced" operator="in" result="grained" />
            <feBlend mode="multiply" in="grained" in2="displaced" />
          </filter>
          <filter id="charcoal" x="-30%" y="-30%" width="160%" height="160%">
            <feTurbulence type="fractalNoise" baseFrequency="0.15" numOctaves="3" result="warpNoise" />
            <feDisplacementMap in="SourceGraphic" in2="warpNoise" scale="3" xChannelSelector="R" yChannelSelector="G" result="displaced" />
            <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="3" result="grainNoise" />
            <feGaussianBlur in="grainNoise" stdDeviation="0.8" result="softGrain" />
            <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0" in="softGrain" result="eraser" />
            <feComposite operator="out" in="displaced" in2="eraser" />
          </filter>
        </defs>
      </svg>
      {children}
    </>
  );
}
