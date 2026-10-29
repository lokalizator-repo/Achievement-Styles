import { join } from 'node:path';

export const steamBundle = process.env.TROPHY_STEAM_BUNDLE
  || join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Steam', 'steamui', 'sp.js');
