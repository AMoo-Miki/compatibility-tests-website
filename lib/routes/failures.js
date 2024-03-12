const OpenSearch = require('../opensearch');
const Templates = require('../templates');
const config = require('../config');
const { getSanitizedTagName, getSanitizedVersion, getDateString, getFullSource, getShortSource } = require('../util');
const { getLatestRefs } = require('../opensearch');
const router = require('express').Router();

/**
 *
 * @type {{sboms: string, scans: string}}
 */
const index = config.get('opensearch.index');
const keyProjects = config.get('projects').reduce((keys, project) => {
  keys[project.key] = project;
  return keys;
}, {});

router.get('/:key(*)/-/:src(*)/-/:version/:security', async (req, res) => {
  const projectKey = getSanitizedTagName(req.params.key);
  const project = keyProjects[projectKey];
  const projectSrc = getFullSource(project.slug, getSanitizedTagName(req.params.src));
  const projectShortSrc = getShortSource(project.slug, projectSrc);
  const testVersion = getSanitizedVersion(req.params.version);

  if (!project) return res.sendStatus(404);

  const versionRefs = await getLatestRefs(project.slug, projectSrc);
  const versionRef = versionRefs[testVersion];

  const testSecurity = req.params.security === '1';

  const result = await OpenSearch.search(index.results, {
    query: {
      bool: {
        filter: [
          { term: { 'scope': projectKey } },
          { term: { 'ref': versionRef } },
          { term: { 'with-security': testSecurity } },
          { terms: { 'state': ['failed', 'skipped'] } },
        ]
      }
    },
    sort: ['title.keyword', 'src', 'spec'],
    _source: ['title', 'state', 'src', 'spec', 'platform', `package.${keyProjects[projectKey].slug}.version`, 'duration', 'timestamp']
  }, 1000, null, true);

  const failures = result.map(({ _id, _source: { timestamp, package: pkg, ...rest } }) => ({
    ...rest,
    packageVersion: pkg[project.slug].version,
    timestamp: getDateString(parseInt(timestamp)),
    id: _id,
  }));

  res.locals.partial = Templates.render('failures', {
    key: projectKey,
    src: projectShortSrc,
    version: testVersion,
    security: testSecurity,
    failures,
    project: project.name
  });

  res.dispatch({
    title: `${project.name} @ ${projectShortSrc} vs OpenSearch ${testVersion} ${testSecurity ? 'with' : 'without'} Security`,
    root: 'failures',
    path: `${projectKey}/-/${projectShortSrc}/-/${testVersion}/${testSecurity ? 1 : 0}`
  });
});

router.get('/', async (req, res) => {
  res.redirect(308, `/projects`);
});

module.exports = router;