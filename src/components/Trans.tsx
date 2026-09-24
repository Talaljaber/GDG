import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { useT } from '../i18n';

/**
 * Renders a translated string whose placeholders are React nodes, e.g. a
 * player name in <bdi> (DESIGN_SYSTEM §8). Plain params are interpolated by
 * `t()` first; the remaining `{name}` placeholders are replaced by `nodes`.
 */
export function Trans({
  k,
  params,
  nodes,
}: {
  k: string;
  params?: Record<string, string | number>;
  nodes: Record<string, ReactNode>;
}) {
  const t = useT();
  const text = t(k, params);
  const parts = text.split(/\{([^}]+)\}/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Fragment key={i}>{Object.prototype.hasOwnProperty.call(nodes, part) ? nodes[part] : `{${part}}`}</Fragment>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
