interface CartoonCarProps {
  color?: string;
  className?: string;
}

export function CartoonCar({ color = '#3B82F6', className = 'w-24 h-24' }: CartoonCarProps) {
  return (
    <svg
      viewBox="0 0 200 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Car body */}
      <path
        d="M30 70 L50 70 L60 50 L80 40 L120 40 L140 50 L150 70 L170 70 L175 80 L175 95 L25 95 L25 80 Z"
        fill={color}
        stroke="#1F2937"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* Windows */}
      <path
        d="M65 50 L75 45 L110 45 L120 50 L120 65 L65 65 Z"
        fill="#E5E7EB"
        stroke="#1F2937"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* Window divider */}
      <line
        x1="92"
        y1="45"
        x2="92"
        y2="65"
        stroke="#1F2937"
        strokeWidth="2"
      />
      
      {/* Front wheel */}
      <circle cx="55" cy="95" r="15" fill="#1F2937" />
      <circle cx="55" cy="95" r="8" fill="#6B7280" />
      
      {/* Back wheel */}
      <circle cx="145" cy="95" r="15" fill="#1F2937" />
      <circle cx="145" cy="95" r="8" fill="#6B7280" />
      
      {/* Headlight */}
      <circle cx="25" cy="82" r="4" fill="#FCD34D" stroke="#1F2937" strokeWidth="1.5" />
      
      {/* Taillight */}
      <circle cx="175" cy="82" r="4" fill="#EF4444" stroke="#1F2937" strokeWidth="1.5" />
      
      {/* Door handle */}
      <rect x="130" y="62" width="8" height="3" rx="1.5" fill="#1F2937" />
      
      {/* Lightning bolt (EV indicator) */}
      <path
        d="M100 55 L97 60 L100 60 L97 65 L103 58 L100 58 Z"
        fill="#FCD34D"
        stroke="#1F2937"
        strokeWidth="0.5"
      />
    </svg>
  );
}
