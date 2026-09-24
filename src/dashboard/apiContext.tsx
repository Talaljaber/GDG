/** Dev preview seam: provides fake dashboard api functions (see `./dashApi.ts`). */
import type { ReactNode } from 'react';
import { DashApiContext, type DashApi } from './dashApi';

export function DashApiProvider({ value, children }: { value: DashApi; children: ReactNode }) {
  return <DashApiContext.Provider value={value}>{children}</DashApiContext.Provider>;
}
