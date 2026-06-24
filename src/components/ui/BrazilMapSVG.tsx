/**
 * BrazilMapSVG.tsx — Mapa do Brasil com bolhas proporcionais por estado
 *
 * Recebe um mapa { UF: count } e renderiza SVG com círculos dimensionados
 * pela contagem, posicionados nas coordenadas geográficas aproximadas de cada UF.
 */

import { useState } from 'react';

// Coordenadas aproximadas de cada UF num viewBox 380×480
const UF_POSITIONS: Record<string, [number, number]> = {
  RR: [132,  48], AP: [230,  52], AM: [108, 148], PA: [218, 128],
  MA: [285, 138], PI: [318, 162], CE: [345, 148], RN: [366, 158],
  PB: [368, 172], PE: [350, 195], AL: [363, 210], SE: [360, 228],
  AC: [ 52, 202], RO: [122, 222], TO: [254, 192], BA: [326, 248],
  MT: [190, 252], GO: [238, 268], DF: [248, 278], MG: [296, 298],
  ES: [340, 302], RJ: [320, 318], SP: [278, 328], MS: [228, 325],
  PR: [255, 362], SC: [260, 392], RS: [252, 422],
};

const UF_LABELS: Record<string, string> = {
  AC:'Acre', AL:'Alagoas', AP:'Amapá', AM:'Amazonas', BA:'Bahia', CE:'Ceará',
  DF:'Distrito Federal', ES:'Espírito Santo', GO:'Goiás', MA:'Maranhão',
  MT:'Mato Grosso', MS:'Mato Grosso do Sul', MG:'Minas Gerais', PA:'Pará',
  PB:'Paraíba', PR:'Paraná', PE:'Pernambuco', PI:'Piauí', RJ:'Rio de Janeiro',
  RN:'Rio Grande do Norte', RS:'Rio Grande do Sul', RO:'Rondônia', RR:'Roraima',
  SC:'Santa Catarina', SP:'São Paulo', SE:'Sergipe', TO:'Tocantins',
};

interface BrazilMapSVGProps {
  visitsByState: Record<string, number>;
  height?: number;
}

export function BrazilMapSVG({ visitsByState, height = 320 }: BrazilMapSVGProps) {
  const [tooltip, setTooltip] = useState<{ uf: string; x: number; y: number } | null>(null);

  const maxCount = Math.max(...Object.values(visitsByState), 1);
  const total    = Object.values(visitsByState).reduce((a, b) => a + b, 0);

  // Raio mínimo 7, máximo ~19 (mantém bolhas compactas p/ não sobrepor no Sudeste)
  const radius = (count: number) => 7 + (count / maxCount) * 12;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg
        viewBox="0 0 380 480"
        width="100%"
        height={height}
        style={{ display: 'block' }}
      >
        {/* ── Fundo suave ── */}
        <rect x={0} y={0} width={380} height={480} fill="transparent" />

        {/* ── Grade de referência (sutil) ── */}
        {[100, 200, 300].map(x => (
          <line key={x} x1={x} y1={0} x2={x} y2={480} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="4 6" />
        ))}
        {[100, 200, 300, 400].map(y => (
          <line key={y} x1={0} y1={y} x2={380} y2={y} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="4 6" />
        ))}

        {/* ── Silhueta Cartográfica de Background do Brasil ── */}
        {/* Trassa os limites externos aproximados baseados na distribuição das UFs */}
        <polygon
          points="132,48 230,52 285,138 318,162 345,148 366,158 368,172 350,195 363,210 360,228 326,248 340,302 320,318 278,328 255,362 260,392 252,422 228,325 122,222 52,202 108,148"
          fill="var(--primary-light)"
          opacity={0.35}
          stroke="var(--border)"
          strokeWidth={1.5}
          strokeDasharray="5 5"
          strokeLinejoin="round"
          style={{ transition: 'fill 0.4s ease' }}
        />

        {/* ── Estados sem visita — marcador leve ── */}
        {Object.entries(UF_POSITIONS).map(([uf, [cx, cy]]) => {
          const count = visitsByState[uf] ?? 0;
          if (count > 0) return null;
          return (
            <g key={uf}>
              <circle cx={cx} cy={cy} r={5} fill="var(--bg-2)" stroke="var(--border)" strokeWidth={1} />
              <text x={cx} y={cy + 14} textAnchor="middle" fontSize={7} fill="var(--text-3)" fontFamily="inherit">{uf}</text>
            </g>
          );
        })}

        {/* ── Estados com visitas — bolhas coloridas ── */}
        {Object.entries(UF_POSITIONS).map(([uf, [cx, cy]]) => {
          const count = visitsByState[uf] ?? 0;
          if (count === 0) return null;
          const r = radius(count);
          const isHover = tooltip?.uf === uf;

          return (
            <g
              key={uf}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setTooltip({ uf, x: cx, y: cy })}
              onMouseLeave={() => setTooltip(null)}
            >
              {/* Pulso via SMIL — anima raio/opacidade no sistema de coords do SVG
                  (centrado em cx,cy; sem depender de transform-origin do CSS) */}
              <circle cx={cx} cy={cy} r={r + 3} fill="rgba(185,28,28,0.12)">
                <animate attributeName="r" values={`${r + 2};${r + 7};${r + 2}`} dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.5;0.15;0.5" dur="2s" repeatCount="indefinite" />
              </circle>
              {/* Bolha */}
              <circle
                cx={cx} cy={cy} r={r}
                fill={isHover ? '#991B1B' : '#B91C1C'}
                stroke="#fff"
                strokeWidth={1.5}
                style={{ transition: 'all .2s' }}
              />
              {/* UF label dentro da bolha */}
              <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
                fontSize={r > 14 ? 9 : 7} fill="#fff" fontWeight="700" fontFamily="inherit">
                {uf}
              </text>
            </g>
          );
        })}
      </svg>

      {/* ── Tooltip HTML Premium (Glassmorphism + Responsivo) ── */}
      {tooltip && (() => {
        const count = visitsByState[tooltip.uf] ?? 0;
        const label = UF_LABELS[tooltip.uf] ?? tooltip.uf;
        
        // Mapeia coordenadas SVG (0-380, 0-480) em porcentagem de posicionamento absoluto
        const leftPercent = (tooltip.x / 380) * 100;
        const topPercent = (tooltip.y / 480) * 100;

        return (
          <div
            style={{
              position: 'absolute',
              left: `${leftPercent}%`,
              top: `${topPercent}%`,
              transform: 'translate(-50%, -130%)',
              background: 'rgba(255, 255, 255, 0.94)',
              backdropFilter: 'blur(8px)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '11.5px',
              fontWeight: 600,
              color: 'var(--text)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
              pointerEvents: 'none',
              zIndex: 50,
              whiteSpace: 'nowrap',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              animation: 'fadeIn 0.15s ease-out',
            }}
          >
            <div style={{ fontSize: '10px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: 700 }}>
              {label}
            </div>
            <div style={{ color: '#B91C1C', fontWeight: 800, fontSize: '12px' }}>
              {count} {count === 1 ? 'visita' : 'visitas'}
            </div>
          </div>
        );
      })()}

      {/* Legenda */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 4 }}>
        {[
          { label: '1 visita',  r: 8  },
          { label: '3–4',       r: 14 },
          { label: '6+',        r: 20 },
        ].map(({ label, r }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width={r * 2 + 2} height={r * 2 + 2}>
              <circle cx={r + 1} cy={r + 1} r={r} fill="rgba(185,28,28,0.18)" stroke="#B91C1C" strokeWidth={1.5} />
            </svg>
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{label}</span>
          </div>
        ))}
        <span style={{ fontSize: 11, color: 'var(--text-2)', marginLeft: 4 }}>
          Total: <strong>{total}</strong>
        </span>
      </div>
    </div>
  );
}
