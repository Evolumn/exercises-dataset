const path = require('node:path');

function mountDocs(app, projectRoot) {
  app.get('/openapi.yaml', (_req, res) => {
    res.type('application/yaml');
    res.sendFile(path.join(projectRoot, 'openapi.yaml'));
  });

  app.get('/docs', (_req, res) => {
    res.sendFile(path.join(projectRoot, 'docs.html'));
  });
}

module.exports = { mountDocs };
