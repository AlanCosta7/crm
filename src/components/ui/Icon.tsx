import * as LucideIcons from 'lucide-react';

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Cor de preenchimento (ex.: estrela de favorito). Padrão: sem preenchimento. */
  fill?: string;
}

export function Icon({ name, size = 18, color, strokeWidth = 2, className, style, fill = 'none' }: IconProps) {
  // Map string names (e.g. 'Building2', 'MessageCircle') to Lucide components
  const LucideIcon = (LucideIcons as any)[name];

  if (!LucideIcon) {
    // Try lowercase/camelcase combinations or fallback gracefully
    const Fallback = LucideIcons.HelpCircle;
    return <Fallback size={size} color={color} strokeWidth={strokeWidth} className={className} style={style} fill={fill} />;
  }

  return <LucideIcon size={size} color={color} strokeWidth={strokeWidth} className={className} style={style} fill={fill} />;
}
