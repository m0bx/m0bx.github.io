export const $ = (s, r = document) => r.querySelector(s);
export const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
export const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toLocaleString("en", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
export const load = (k, d) => { try { return { ...d, ...JSON.parse(localStorage.getItem(k)) }; } catch { return { ...d }; } };
export const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage disabled */ } };
export const TAB_EVENT = "absorber:tab";
