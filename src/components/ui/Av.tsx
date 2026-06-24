interface AvProps {
  name?: string;
  initials?: string;
  color?: string;
  size?: number;
}

export function Av({ name, initials, color, size = 32 }: AvProps) {
  const finalInitials = initials || (name 
    ? name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() 
    : '?');

  return (
    <div
      className="av"
      style={{
        width: size,
        height: size,
        backgroundColor: color || 'var(--primary)',
        fontSize: size * 0.38,
      }}
    >
      {finalInitials}
    </div>
  );
}
