export interface Settings { palette: string; font: string }
export const DEFAULT_SETTINGS: Settings = { palette: 'paper', font: 'atkinson' };
export const SETTINGS_KEY = 'eb.settings.v1';

/** Runs before the page paints so a saved theme never flashes the default first. */
export const EARLY_SCRIPT = `try{var s=JSON.parse(localStorage.getItem('${SETTINGS_KEY}')||'{}'),d=document.documentElement;d.dataset.theme=s.palette||'${DEFAULT_SETTINGS.palette}';d.dataset.font=s.font||'${DEFAULT_SETTINGS.font}'}catch(e){}`;
