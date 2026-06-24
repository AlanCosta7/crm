import { Icon } from './Icon';
import { useUIStore } from '../../stores/uiStore';

interface LogoProps {
  light?: boolean;
  size?: number;
}

export function Logo({ light = false, size = 30 }: LogoProps) {
  const { productId } = useUIStore();

  const isSmartCafe = productId === 'smart_cafe';

  return (
    <div className="sb-logo" style={{ borderBottom: 'none', height: 'auto', padding: 0 }}>
      <div 
        className="mark" 
        style={{ 
          width: size, 
          height: size,
          background: isSmartCafe ? 'linear-gradient(135deg, #5E3A26, #D4A373)' : undefined
        }}
      >
        {isSmartCafe ? (
          <Icon name="Coffee" size={size * 0.55} color="#fff" strokeWidth={2.2} />
        ) : (
          <>
            <Icon name="ShoppingCart" size={size * 0.52} color="#fff" strokeWidth={2.4} />
            <span style={{ position: 'absolute', top: size * 0.12, right: size * 0.12, display: 'flex' }}>
              <Icon name="Wifi" size={size * 0.32} color="#fff" strokeWidth={2.6} />
            </span>
          </>
        )}
      </div>
      <div className="word" style={light ? { color: '#fff' } : undefined}>
        {isSmartCafe ? (
          light ? (
            <>
              <span style={{ color: '#fff', fontWeight: 800 }}>Smart</span>
              <span style={{ color: '#D4A373', fontStyle: 'italic', fontFamily: 'Georgia, serif', marginLeft: 4 }}>café</span>
            </>
          ) : (
            <>
              <span style={{ color: '#5E3A26', fontWeight: 800 }}>Smart</span>
              <span style={{ color: '#D4A373', fontStyle: 'italic', fontFamily: 'Georgia, serif', marginLeft: 4 }}>café</span>
            </>
          )
        ) : (
          light ? (
            <>
              <span style={{ color: '#8DB600' }}>Wiz</span>
              <span style={{ color: '#fff' }}>Mart</span>
            </>
          ) : (
            <>
              <span className="wiz">Wiz</span>
              <span className="mart">Mart</span>
            </>
          )
        )}
      </div>
    </div>
  );
}
