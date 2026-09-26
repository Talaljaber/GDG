import { defineConfig, mergeConfig } from 'vitest/config';
import base from 'C:/Users/hp/.m2/GDG/vitest.config';
const SCR = 'C:/Users/hp/AppData/Local/Temp/claude/c--Users-hp--m2-GDG/f37d25ab-80f0-495e-93ed-dcd0ab723d43/scratchpad/g2';
export default mergeConfig(base, defineConfig({
  root: 'C:/Users/hp/.m2/GDG',
  server: { fs: { allow: ['C:/Users/hp/.m2/GDG', SCR] } },
  test: { dir: SCR, include: ['**/*.g2.test.tsx'], setupFiles: ['C:/Users/hp/.m2/GDG/src/test/setup.ts'] },
}));
