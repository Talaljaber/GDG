import { useMemo } from 'react';
import QRCode from 'qrcode';
import styles from './ui.module.css';

/** Quiet zone in modules (DESIGN_SYSTEM §3.2: ≥ 4 modules). */
const QUIET_ZONE = 4;

/**
 * The join QR, drawn as one SVG path from the `qrcode` module matrix so the
 * colours come from tokens (ink modules on white). Never mirrored in RTL.
 */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { size, path } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    let d = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.modules.get(y, x)) d += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
      }
    }
    return { size: n + QUIET_ZONE * 2, path: d };
  }, [value]);

  return (
    <svg
      className={styles.qr}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      data-testid="host-qr"
    >
      <rect className={styles.qrLight} width={size} height={size} />
      <path className={styles.qrDark} d={path} />
    </svg>
  );
}
