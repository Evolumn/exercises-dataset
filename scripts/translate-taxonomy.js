const fs = require('node:fs');
const path = require('node:path');
const { NAME_PHRASES, NAME_WORDS } = require('./name-maps');

const FIELDS = ['name', 'category', 'body_part', 'equipment'];
const DATA_PATH = path.join(__dirname, '..', 'data', 'exercises.json');
const NAME_PHRASE_KEYS = Object.keys(NAME_PHRASES).sort((a, b) => b.length - a.length);
const NAME_WORD_KEYS = Object.keys(NAME_WORDS).sort((a, b) => b.length - a.length);

const BODY_PARTS = {
  back: { 'pt-br': 'costas', es: 'espalda' },
  cardio: { 'pt-br': 'cardio', es: 'cardio' },
  chest: { 'pt-br': 'peito', es: 'pecho' },
  'lower arms': { 'pt-br': 'antebraços', es: 'antebrazos' },
  'lower legs': { 'pt-br': 'panturrilhas', es: 'pantorrillas' },
  neck: { 'pt-br': 'pescoço', es: 'cuello' },
  shoulders: { 'pt-br': 'ombros', es: 'hombros' },
  'upper arms': { 'pt-br': 'braços', es: 'brazos' },
  'upper legs': { 'pt-br': 'coxas', es: 'muslos' },
  waist: { 'pt-br': 'cintura', es: 'cintura' },
};

const EQUIPMENT = {
  assisted: { 'pt-br': 'assistido', es: 'asistido' },
  band: { 'pt-br': 'faixa', es: 'banda' },
  barbell: { 'pt-br': 'barra', es: 'barra' },
  'body weight': { 'pt-br': 'peso corporal', es: 'peso corporal' },
  'bosu ball': { 'pt-br': 'bosu', es: 'bosu' },
  cable: { 'pt-br': 'polia', es: 'polea' },
  dumbbell: { 'pt-br': 'halteres', es: 'mancuernas' },
  'elliptical machine': { 'pt-br': 'elíptico', es: 'elíptica' },
  'ez barbell': { 'pt-br': 'barra W', es: 'barra EZ' },
  hammer: { 'pt-br': 'martelo', es: 'martillo' },
  kettlebell: { 'pt-br': 'kettlebell', es: 'pesa rusa' },
  'leverage machine': { 'pt-br': 'máquina de alavanca', es: 'máquina de palanca' },
  'medicine ball': { 'pt-br': 'bola medicinal', es: 'balón medicinal' },
  'olympic barbell': { 'pt-br': 'barra olímpica', es: 'barra olímpica' },
  'resistance band': { 'pt-br': 'elástico', es: 'banda elástica' },
  roller: { 'pt-br': 'rolo', es: 'rodillo' },
  rope: { 'pt-br': 'corda', es: 'cuerda' },
  'skierg machine': { 'pt-br': 'SkiErg', es: 'SkiErg' },
  'sled machine': { 'pt-br': 'trenó', es: 'trineo' },
  'smith machine': { 'pt-br': 'máquina Smith', es: 'máquina Smith' },
  'stability ball': { 'pt-br': 'bola suíça', es: 'pelota suiza' },
  'stationary bike': { 'pt-br': 'bicicleta ergométrica', es: 'bicicleta estática' },
  'stepmill machine': { 'pt-br': 'escada ergométrica', es: 'stepmill' },
  tire: { 'pt-br': 'pneu', es: 'neumático' },
  'trap bar': { 'pt-br': 'barra hexagonal', es: 'barra hexagonal' },
  'upper body ergometer': { 'pt-br': 'ergômetro de membros superiores', es: 'ergómetro de tren superior' },
  weighted: { 'pt-br': 'com peso', es: 'con peso' },
  'wheel roller': { 'pt-br': 'roda abdominal', es: 'rueda abdominal' },
};

function mapFor(field) {
  return field === 'equipment' ? EQUIPMENT : BODY_PARTS;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyDictionary(text, keys, dictionary, language) {
  let result = text;
  for (const key of keys) {
    const replacement = dictionary[key][language];
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}-])${escapeRegExp(key)}(?![\\p{L}\\p{N}-])`, 'giu');
    result = result.replace(pattern, replacement);
  }
  return result;
}

const NAME_EQUIPMENT_PREFIXES = [
  'olympic barbell',
  'ez barbell',
  'ez-barbell',
  'smith machine',
  'stability ball',
  'medicine ball',
  'exercise ball',
  'resistance band',
  'bosu ball',
  'trap bar',
  'ez-bar',
  'sz-bar',
  't-bar',
  'dumbbells',
  'dumbbell',
  'barbell',
  'kettlebell',
  'cable',
  'lever',
  'sled',
  'band',
  'smith',
  'ez',
].sort((a, b) => b.length - a.length);

function splitEquipmentPrefix(englishValue) {
  const lower = englishValue.toLowerCase();
  for (const prefix of NAME_EQUIPMENT_PREFIXES) {
    if (lower.startsWith(`${prefix} `)) {
      return {
        equipment: prefix,
        rest: englishValue.slice(prefix.length).trim(),
      };
    }
  }
  return { equipment: null, rest: englishValue };
}

function applyNameDictionary(englishValue, language) {
  const normalized = englishValue.replace(/в°/g, '°');
  const translated = applyDictionary(
    applyDictionary(normalized, NAME_PHRASE_KEYS, NAME_PHRASES, language),
    NAME_WORD_KEYS,
    NAME_WORDS,
    language,
  );

  return translated
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .trim();
}

function translateName(englishValue, language) {
  const { equipment, rest } = splitEquipmentPrefix(englishValue);
  if (equipment && rest) {
    const translatedRest = applyNameDictionary(rest, language);
    const translatedEquipment = applyNameDictionary(equipment, language);
    const preposition = language === 'es' ? 'con' : 'com';
    return `${translatedRest} ${preposition} ${translatedEquipment}`;
  }
  return applyNameDictionary(englishValue, language);
}

function untranslatedNameTokens(englishValue) {
  let remaining = englishValue.replace(/в°/g, '°').toLowerCase();
  for (const key of [...NAME_PHRASE_KEYS, ...NAME_WORD_KEYS]) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}-])${escapeRegExp(key)}(?![\\p{L}\\p{N}-])`, 'giu');
    remaining = remaining.replace(pattern, ' ');
  }
  return [...remaining.matchAll(/[a-z]+(?:-[a-z]+)*/gi)].map((match) => match[0]);
}

function translateValue(field, englishValue, language) {
  if (field === 'name') {
    return translateName(englishValue, language);
  }

  const entry = mapFor(field)[englishValue];
  if (!entry) {
    throw new Error(`Sem tradução para ${field}: "${englishValue}"`);
  }
  return entry[language];
}

function englishSource(exercise, field) {
  return exercise.translations?.en?.[field] ?? exercise[field];
}

function translateExercise(exercise) {
  const en = {};
  const es = {};
  const pt = {};

  for (const field of FIELDS) {
    const englishValue = englishSource(exercise, field);
    en[field] = englishValue;
    es[field] = translateValue(field, englishValue, 'es');
    pt[field] = translateValue(field, englishValue, 'pt-br');
  }

  const translated = {};
  for (const [key, value] of Object.entries(exercise)) {
    if (FIELDS.includes(key)) {
      translated[key] = pt[key];
      if (key === 'equipment') {
        translated.translations = { en, es };
      }
      continue;
    }
    if (key !== 'translations') {
      translated[key] = value;
    }
  }

  return translated;
}

function main() {
  const exercises = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  if (!Array.isArray(exercises)) {
    throw new Error('data/exercises.json precisa ser um array');
  }

  if (exercises[0]?.i18n) {
    console.log('O JSON já está na estrutura nova. Use scripts/migrate-structure.js se precisar regenerar.');
    return;
  }

  const missing = [...new Set(exercises.flatMap((exercise) => (
    untranslatedNameTokens(englishSource(exercise, 'name'))
  )))];
  if (missing.length > 0) {
    throw new Error(`Sem tradução para tokens de name: ${missing.join(', ')}`);
  }

  const translated = exercises.map(translateExercise);
  fs.writeFileSync(DATA_PATH, `${JSON.stringify(translated, null, 2)}\n`);

  const sample = translated[0];
  console.log(`Atualizados ${translated.length} exercícios em ${DATA_PATH}`);
  console.log(`Exemplo: name="${sample.name}"`);
  console.log('translations.en.name:', sample.translations.en.name);
  console.log('translations.es.name:', sample.translations.es.name);
}

main();
