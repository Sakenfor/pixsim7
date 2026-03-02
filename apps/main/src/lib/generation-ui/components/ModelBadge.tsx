import type { ModelFamilyInfo } from '../utils/modelFamilies';

interface ModelBadgeProps {
  family: ModelFamilyInfo;
  size?: number;
}

export function ModelBadge({ family, size = 16 }: ModelBadgeProps) {
  const fontSize = Math.round(size * 0.55);
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-bold leading-none shrink-0"
      style={{
        width: size,
        height: size,
        fontSize,
        backgroundColor: family.color,
        color: family.textColor ?? '#fff',
      }}
      title={family.label}
    >
      {family.short}
    </span>
  );
}
