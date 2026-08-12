const fs = require('node:fs');
const path = require('node:path');
const { BODY_PARTS, EQUIPMENT, MUSCLES, MUSCLE_ALIASES } = require('./taxonomy-maps');

const DATA_PATH = path.join(__dirname, '..', 'data', 'exercises.json');
const TAXONOMY_PATH = path.join(__dirname, '..', 'data', 'taxonomy.json');
const LANGUAGES = ['pt-br', 'en', 'es'];

function toSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function muscleSlug(value) {
  const slug = toSlug(value);
  return MUSCLE_ALIASES[slug] || slug;
}

function uniqueSlugs(values) {
  return [...new Set(values.map(muscleSlug).filter(Boolean))];
}

function stepsFor(exercise, language) {
  const steps = exercise.instruction_steps?.[language];
  if (Array.isArray(steps) && steps.length > 0) {
    return steps;
  }
  const text = exercise.instructions?.[language];
  return text ? [text] : [];
}

function nameFor(exercise, language) {
  if (language === 'pt-br') {
    return exercise.i18n?.['pt-br']?.name || exercise.name;
  }
  return exercise.translations?.[language]?.name || exercise.i18n?.[language]?.name || exercise.name;
}

function migrateExercise(exercise) {
  const alreadyMigrated = Boolean(exercise.i18n && exercise.media && exercise.muscles && !exercise.category);
  const english = exercise.translations?.en || {};
  const bodyPart = alreadyMigrated
    ? exercise.body_part
    : toSlug(english.body_part || exercise.body_part);
  const equipment = alreadyMigrated
    ? exercise.equipment
    : toSlug(english.equipment || exercise.equipment);
  const primary = alreadyMigrated
    ? exercise.muscles.primary
    : uniqueSlugs([exercise.target]);
  const secondary = alreadyMigrated
    ? exercise.muscles.secondary
    : uniqueSlugs([
      ...(exercise.secondary_muscles || []),
      exercise.muscle_group,
    ]).filter((slug) => !primary.includes(slug));

  const i18n = {};
  for (const language of LANGUAGES) {
    i18n[language] = {
      name: alreadyMigrated
        ? exercise.i18n[language].name
        : nameFor(exercise, language),
      steps: alreadyMigrated
        ? exercise.i18n[language].steps
        : stepsFor(exercise, language),
    };
  }

  return {
    id: exercise.id,
    body_part: bodyPart,
    equipment,
    muscles: { primary, secondary },
    i18n,
    media: alreadyMigrated
      ? exercise.media
      : {
        id: exercise.media_id,
        thumbnail: exercise.image,
        animation: exercise.gif_url,
        attribution: exercise.attribution,
      },
  };
}

function assertKnown(kind, slug, dictionary) {
  if (!dictionary[slug]) {
    throw new Error(`Slug de ${kind} sem rótulo: ${slug}`);
  }
}

function main() {
  const exercises = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  if (!Array.isArray(exercises)) {
    throw new Error('data/exercises.json precisa ser um array');
  }

  const migrated = exercises.map(migrateExercise);
  for (const exercise of migrated) {
    assertKnown('body_part', exercise.body_part, BODY_PARTS);
    assertKnown('equipment', exercise.equipment, EQUIPMENT);
    for (const slug of [...exercise.muscles.primary, ...exercise.muscles.secondary]) {
      assertKnown('muscle', slug, MUSCLES);
    }
  }

  const taxonomy = {
    body_parts: BODY_PARTS,
    equipment: EQUIPMENT,
    muscles: MUSCLES,
  };

  fs.writeFileSync(DATA_PATH, `${JSON.stringify(migrated, null, 2)}\n`);
  fs.writeFileSync(TAXONOMY_PATH, `${JSON.stringify(taxonomy, null, 2)}\n`);

  const sample = migrated[0];
  console.log(`Migrados ${migrated.length} exercícios`);
  console.log(JSON.stringify(sample, null, 2));
}

main();
