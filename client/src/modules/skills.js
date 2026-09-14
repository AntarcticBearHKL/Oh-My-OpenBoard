import { generateUUID } from './utils.js';
import { emit, DATA_CHANGED } from './events.js';

export const SKILLS_KEY = 'openagile:skills';

const SKILLS_API = '/api/skills';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

function normalizeSkill(raw, index) {
  if (!raw || typeof raw.id !== 'string' || !raw.id.trim()) return null;
  return {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Untitled skill',
    description: typeof raw.description === 'string' ? raw.description : '',
    content: typeof raw.content === 'string' ? raw.content : '',
    order: Number.isFinite(raw.order) ? raw.order : index + 1
  };
}

export function listSkills() {
  const raw = readJson(SKILLS_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((skill, index) => normalizeSkill(skill, index))
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);
}

export function getSkill(skillId) {
  const id = typeof skillId === 'string' ? skillId : '';
  if (!id) return null;
  return listSkills().find((skill) => skill.id === id) || null;
}

export function pushSkillsToServer() {
  const body = { skills: listSkills() };
  fetch(SKILLS_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }).catch(() => {});
}

export function createSkill({ name = 'New skill', description = '', content = '' } = {}) {
  const skills = listSkills();
  const trimmed = typeof name === 'string' && name.trim() ? name.trim() : 'New skill';
  const skill = {
    id: generateUUID(),
    name: trimmed,
    description: typeof description === 'string' ? description : '',
    content: typeof content === 'string' ? content : '',
    order: skills.length + 1
  };
  writeJson(SKILLS_KEY, [...skills, skill]);
  pushSkillsToServer();
  return skill;
}

export function updateSkill(skillId, fields = {}) {
  const id = typeof skillId === 'string' ? skillId : '';
  if (!id) return false;

  const skills = listSkills();
  if (!skills.some((skill) => skill.id === id)) return false;

  const next = skills.map((skill) => {
    if (skill.id !== id) return skill;
    return {
      ...skill,
      name: typeof fields.name === 'string' && fields.name.trim() ? fields.name.trim() : skill.name,
      description: typeof fields.description === 'string' ? fields.description : skill.description,
      content: typeof fields.content === 'string' ? fields.content : skill.content
    };
  });

  writeJson(SKILLS_KEY, next);
  pushSkillsToServer();
  return true;
}

export function deleteSkill(skillId) {
  const id = typeof skillId === 'string' ? skillId : '';
  if (!id) return false;

  const skills = listSkills();
  if (!skills.some((skill) => skill.id === id)) return false;

  writeJson(SKILLS_KEY, skills.filter((skill) => skill.id !== id));
  pushSkillsToServer();
  return true;
}

export function adoptSkillsState(state) {
  if (!state || typeof state !== 'object') return;
  if (!Array.isArray(state.skills)) return;

  const incoming = state.skills.map((skill, index) => normalizeSkill(skill, index)).filter(Boolean);
  const merged = new Map(incoming.map((skill) => [skill.id, skill]));
  let hasLocalOnly = false;

  listSkills().forEach((skill) => {
    if (!merged.has(skill.id)) {
      merged.set(skill.id, skill);
      hasLocalOnly = true;
    }
  });

  writeJson(SKILLS_KEY, [...merged.values()]);
  if (hasLocalOnly) pushSkillsToServer();
}

export function initSkillsSync() {
  if (initSkillsSync._started) return;
  initSkillsSync._started = true;

  fetch(SKILLS_API, { headers: { accept: 'application/json' } })
    .then((res) => (res.ok ? res.json() : null))
    .then((state) => {
      if (!state) return;
      if (Array.isArray(state.skills) && state.skills.length > 0) {
        adoptSkillsState(state);
        emit(DATA_CHANGED);
      }
    })
    .catch(() => {});

  window.addEventListener('openagile:skills-changed', (event) => {
    adoptSkillsState(event.detail);
    emit(DATA_CHANGED);
  });
}
