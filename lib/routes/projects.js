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

  const projectRefCalls = config.get('projects').map(({ key }) => ([key, getLatestRefs(key)]));

  const projectRefsCountsCalls = [];
  for (const [key, projectRefCall] of projectRefCalls) {
    const refs = Object.values(await projectRefCall);
    projectRefsCountsCalls.push([key, getRefsCounts(key, refs)]);
  }

  const counts = {};
  for (const [key, projectRefsCountsCall] of projectRefsCountsCalls) {
    counts[key] = await projectRefsCountsCall;
  }

  const projectStats = await Promise.all(projectStatsCalls);

  const srcList = projectStats.reduce((srcs, { projects: { buckets } }) => {
    buckets.forEach(({ key, srcs: { buckets } }) => {
      srcs[key] = (srcs[key] || 0) + buckets.length;
    });

    return srcs;
  }, {});

  res.locals.partial = Templates.render('projects', {
    projects: config.get('projects').map(({ name, key }) => ({
      name,
      key,
      src: getShortSource(key, keyProjects[key].src),
      srcCount: srcList[key],
      stats: counts[key]
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
  const projectSrc = getFullSource(projectKey, getSanitizedTagName(req.params.src));
  const projectShortSrc = getShortSource(projectKey, projectSrc);

  if (!project) return res.sendStatus(404);

  const versionRefs = await getLatestRefs(projectKey, projectSrc);

  const projectVersionCountsCalls = Object.keys(versionRefs).reduce((calls, version) => {
    calls.push(
      [version, true, getRefsCounts(projectKey, [versionRefs[version]], true, true)],
      [version, false, getRefsCounts(projectKey, [versionRefs[version]], false, true)]
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
        sum: countFailed.value + countPassed.value + countSkipped.value,// + countPending.value
      },
      src: getShortSource(projectKey, key)
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