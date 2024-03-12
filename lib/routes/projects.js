const OpenSearch = require('../opensearch');
const Templates = require('../templates');
const config = require('../config');
const { getSanitizedTagName, getDateString, getShortSource, getFullSource } = require('../util');
const { getLatestRefs, getRefsCounts } = require('../opensearch');
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

router.get('/', async (req, res) => {
  const projectStatsCalls = config.get('projects').map(({ slug, key }) => OpenSearch.getAggregates(index.summaries, {
    aggs: {
      projects: {
        terms: { field: 'scope', order: { _key: 'asc' }, size: 10000 },
        aggs: {
          srcs: { terms: { field: `package.${slug}.src`, order: { _key: 'desc' }, size: 10000 } }
        }
      }
    },
    query: {
      bool: {
        filter: [
          { term: { 'scope': { value: key } } },
        ]
      }
    }
  }));

  const projectRefCalls = config.get('projects').map(({ slug }) => ([slug, getLatestRefs(slug)]));

  const projectStats = await Promise.all(projectStatsCalls);

  const srcList = projectStats.reduce((srcs, { projects: { buckets } }) => {
    buckets.forEach(({ key, srcs: { buckets } }) => {
      srcs[key] = (srcs[key] || 0) + buckets.length;
    });

    return srcs;
  }, {});

  const projectRefsCountsCalls = [];
  for (const [slug, projectRefCall] of projectRefCalls) {
    const refs = Object.values(await projectRefCall);
    projectRefsCountsCalls.push([slug, getRefsCounts(slug, refs)]);
  }

  const counts = {};
  for (const [slug, projectRefsCountsCall] of projectRefsCountsCalls) {
    counts[slug] = await projectRefsCountsCall;
  }

  res.locals.partial = Templates.render('projects', {
    projects: config.get('projects').map(({ name, key, slug }) => ({
      name,
      key,
      src: getShortSource(slug, keyProjects[key].src),
      srcCount: srcList[key],
      stats: counts[slug]
    }))
  });

  res.dispatch({
    title: 'Projects',
    root: 'projects',
  });
});

router.get('/:key(*)/-/:src(*)', async (req, res) => {
  const projectKey = getSanitizedTagName(req.params.key);
  const project = keyProjects[projectKey];
  const projectSrc = getFullSource(project.slug, getSanitizedTagName(req.params.src));
  const projectShortSrc = getShortSource(project.slug, projectSrc);

  if (!project) return res.sendStatus(404);

  const versionRefs = await getLatestRefs(project.slug, projectSrc);

  const projectVersionCountsCalls = Object.keys(versionRefs).reduce((calls, version) => {
    calls.push(
      [version, true, getRefsCounts(project.slug, [versionRefs[version]], true, true)],
      [version, false, getRefsCounts(project.slug, [versionRefs[version]], false, true)]
    );

    return calls;
  }, []);

  const versions = [];
  for (const [version, security, projectVersionCountsCall] of projectVersionCountsCalls) {
    const versionStat = {
      version,
      security,
      stats: await projectVersionCountsCall,
    };

    if (versionStat.stats.timestamp)
      versionStat.stats.timestamp = getDateString(parseInt(versionStat.stats.timestamp));

    versions.push(versionStat);
  }

  versions.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));

  res.locals.partial = Templates.render('project/versions', {
    key: projectKey,
    src: projectShortSrc,
    versions,
    project: project.name
  });

  res.dispatch({
    title: `${project.name} @ ${projectShortSrc}`,
    root: 'project',
    path: `${projectKey}/-/${projectShortSrc}`
  });
});

router.get('/:key(*)', async (req, res) => {
  const projectKey = getSanitizedTagName(req.params.key);
  let slug;
  let projectName;
  for (const project of config.get('projects')) {
    if (project.key === projectKey) {
      slug = project.slug;
      projectName = project.name;
      break;
    }
  }

  if (!slug) return res.sendStatus(404);

  const srcRefs = await OpenSearch.getAggregates(index.summaries, {
    aggs: {
      srcs: {
        terms: { field: `package.${slug}.src`, order: { _key: 'desc' }, size: 10000 },
        aggs: {
          versions: {
            terms: { field: 'package.opensearch.src', size: 10000 },
            aggs: {
              run: {
                top_hits: {
                  sort: [{ 'timestamp': { order: 'desc' } }],
                  _source: {
                    includes: ['ref']
                  },
                  size: 1
                }
              }
            }
          }
        },
      }
    },
    query: {
      bool: {
        filter: [
          { term: { 'scope': { value: projectKey } } },
        ]
      }
    }
  });

  const refList = srcRefs.srcs.buckets.reduce((refs, { key: src, versions: { buckets } }) => {
    buckets.forEach(({ run: { hits: { hits: [{ _source: { ref } }] } } }) => {
      if (Array.isArray(refs[src])) {
        refs[src].push(ref);
      } else {
        refs[src] = [ref];
      }
    });

    return refs;
  }, {});

  const srcStats = await Promise.all(Object.keys(refList).map(src => OpenSearch.getAggregates(index.summaries, {
    aggs: {
      srcs: {
        terms: { field: `package.${slug}.src`, order: { _key: 'desc' }, size: 10000 },
        aggs: {
          countPassed: { sum: { field: 'count.passed' } },
          countFailed: { sum: { field: 'count.failed' } },
          countSkipped: { sum: { field: 'count.skipped' } },
          countPending: { sum: { field: 'count.pending' } },
        },
      }
    },
    query: {
      bool: {
        filter: [
          { term: { 'scope': { value: projectKey } } },
          { terms: { 'ref': refList[src] } },
        ]
      }
    }
  })));

  const srcs = srcStats.map(
    ({ srcs: { buckets: [{ key, countFailed, countSkipped, countPassed, countPending }] } }) => ({
      stats: {
        passed: countPassed.value,
        sum: countFailed.value + countPassed.value + countSkipped.value
      },
      src: getShortSource(slug, key)
    })
  );

  res.locals.partial = Templates.render('project', {
    key: projectKey,
    srcs,
    project: projectName
  });

  res.dispatch({
    title: projectName,
    root: 'project',
    path: projectName
  });
});

module.exports = router;