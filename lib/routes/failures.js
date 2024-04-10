const OpenSearch = require('../opensearch');
const Templates = require('../templates');
const config = require('../config');
const {
  getSanitizedTagName,
  getSanitizedVersion,
  getDateString,
  getFullSource,
  getShortSource,
  getDateTimeString
} = require('../util');
const { getLatestRefs } = require('../opensearch');
const router = require('express').Router();

const projects = config.get('projects');

/**
 *
 * @type {{sboms: string, scans: string}}
 */
const index = config.get('opensearch.index');
const keyProjects = projects.reduce((keys, project) => {
  keys[project.key] = project;
  return keys;
}, {});

router.get('/:key(*)/-/:src(*)/-/:version/:security', async (req, res) => {
  const projectKey = getSanitizedTagName(req.params.key);
  const project = keyProjects[projectKey];
  const projectSrc = getFullSource(projectKey, getSanitizedTagName(req.params.src));
  const projectShortSrc = getShortSource(projectKey, projectSrc);
  const testVersion = getSanitizedVersion(req.params.version);

  if (!project) return res.sendStatus(404);

  const versionRefs = await getLatestRefs(projectKey, projectSrc);
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

router.get('/:tid', async (req, res) => {
  const testId = req.params.tid?.replace?.(/[^a-z0-9\-_.]+/ig, '');
  const data = (await OpenSearch.search(index.results, {
    query: {
      term: { _id: testId }
    },
  }, 1, o => o._source, false))?.[0];

  if (!data) return res.sendStatus(404);

  const projectKey = data.scope;
  const project = keyProjects[projectKey];
  const projectSrc = getFullSource(projectKey, data.package[project.slug].src);
  const projectShortSrc = getShortSource(projectKey, projectSrc);
  const testVersion = data.package.opensearch.src;

  const testPackages = [{
    name: 'Functional Tests',
    src: getShortSource('functional-test', data.package['functional-test'].src),
    version: data.package['functional-test'].version,
  }];

  const packages = [{
    name: 'OpenSearch',
    src: data.package.opensearch.src,
    version: data.package.opensearch.version,
  }];

  projects.forEach(({ short, slug, key }) => {
    if (
      (projectKey === 'dashboards-no-plugins' && key === 'dashboards')
    ) return;

    if (projectKey === 'dashboards-no-plugins') {
      if (key === 'dashboards') return;
      if (key === 'dashboards-no-plugins') short = keyProjects.dashboards.short;
    } else if (key === 'dashboards-no-plugins') return;

    const srcTest = data.package[`${slug}-test`]?.src;
    if (srcTest) {
      testPackages.push({
        name: `${short} Tests`,
        src: getShortSource(key, srcTest),
        version: data.package[`${slug}-test`].version,
      });
    }

    const src = data.package[slug]?.src;
    if (src) {
      packages.push({
        name: short,
        src: getShortSource(key, data.package[slug].src),
        version: data.package[slug].version,
      });
    }
  });

  const artifactPrefix = projectKey === 'dashboards-no-plugins'
    ? 'no-plugins'
    : data['with-security']
      ? 'with-security'
      : 'no-security';

  const video = `${data.ref}/${artifactPrefix}/${data.src}/${data.spec.replace(/^\.?cypress[\/\\]integration[\/\\]/, '')}.mp4`;

  res.locals.partial = Templates.render('failure', {
    ...data,
    timestamp: getDateTimeString(parseInt(data.timestamp)),
    id: testId,
    key: projectKey,
    origin: data.src,
    src: projectShortSrc,
    version: testVersion,
    security: data['with-security'],
    project: project.name,
    packages,
    testPackages,
    video,
  });

  res.dispatch({
    title: testId,
    root: 'Failure',
    path: testId,
  });
});

router.get('/', async (req, res) => {
  res.redirect(308, `/projects`);
});

module.exports = router;