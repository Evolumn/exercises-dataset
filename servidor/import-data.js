const { createDatabase, importExercises } = require('./db');

const db = createDatabase();
try {
  const count = importExercises(db);
  console.log(`Imported ${count} exercises into ${process.env.DB_PATH || './data/exercises.db'}`);
} finally {
  db.close();
}
