import * as LucideIcons from 'lucide-react';
import { FaLinkedin } from 'react-icons/fa';

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

// Ícones de marca — o lucide-react não distribui mais logos (Linkedin, Facebook
// etc.), então esses poucos vêm do react-icons (Font Awesome). O restante do
// app continua 100% lucide-react.
const BRAND_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string; className?: string; style?: React.CSSProperties }>> = {
  Linkedin: FaLinkedin,
};

export function Icon({ name, size = 18, color, strokeWidth = 2, className, style, fill = 'none' }: IconProps) {
  const BrandIcon = BRAND_ICONS[name];
  if (BrandIcon) {
    return <BrandIcon size={size} color={color} className={className} style={style} />;
  }

  // Map string names (e.g. 'Building2', 'MessageCircle') to Lucide components
  const LucideIcon = (LucideIcons as any)[name];

  if (!LucideIcon) {
    // Try lowercase/camelcase combinations or fallback gracefully
    const Fallback = LucideIcons.HelpCircle;
    return <Fallback size={size} color={color} strokeWidth={strokeWidth} className={className} style={style} fill={fill} />;
  }

  return <LucideIcon size={size} color={color} strokeWidth={strokeWidth} className={className} style={style} fill={fill} />;
}
