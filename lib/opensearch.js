const config = require('./config');
const { Client } = require('@opensearch-project/opensearch');

const client = new Client({
  node: config.get('opensearch.domain.endpoint'),
  auth: config.get('opensearch.auth'),
  compression: 'gzip'
});

const existsIndex = async name => {
  const { body } = await client.indices.exists({ index: name });
  return body;
};

const createIndex = async name => {
  const { body } = await client.indices.create({ index: name });
  return body;
}

const pointAlias = async (name, index) => {
  console.log(`Checking if alias ${name} exists...`);
  const { body: aliasExists } = await client.indices.existsAlias({ name, ignore_unavailable: true });

  let aliasExistsAndIsPointingToIndex = false;
  if (aliasExists) {
    console.log(`Getting alias ${name} ...`);
    const { body: resGetAlias } = await client.indices.getAlias({ name });
    const indices = Object.keys(resGetAlias);
    for await (let aliasIndex of indices) {
      if (aliasIndex === index) {
        aliasExistsAndIsPointingToIndex = true;
      } else {
        console.log(`Deleting alias ${name} ...`);
        await client.indices.deleteAlias({ name, index: aliasIndex });
      }
    }
  } else {
    console.log(`No alias found named ${name}`);
  }

  if (aliasExistsAndIsPointingToIndex) {
    console.log(`All good with alias ${name}`);
  } else {
    console.log(`Creating alias ${name} ...`);
    await client.indices.putAlias({ name, index });
    console.log(`Created alias ${name}`);
  }
};

// ToDo: increase composite size
const getUniques = async (index, fields, query, after) => {
  const _fields = Array.isArray(fields) ? fields : [fields];
  const key = 'uniques';
  const prefixRegex = /^([-+])?(.+?)$/;
  const req = {
    index,
    body: {
      aggs: {
        [key]: {
          composite: {
            sources: _fields.map(field => {
              const match = field.match(prefixRegex);
              const terms = { field: match[2] };
              if (match[1] === '-') terms.order = 'desc';
              else if (match[1] === '+') terms.order = 'asc';
              return {
                [match[2]]: { terms }
              }
            }),
            after
          }
        }
      }
    },
    size: 0
  };

  if (query) req.body.query = query;

  let { body } = await client.search(req);

  const data = [];
  const _addAggs = buckets => {
    data.push(...buckets.map(bucket => bucket.key));
  }

  if (Array.isArray(body.aggregations?.[key]?.buckets)) {
    _addAggs(body.aggregations[key].buckets);

    if (body.aggregations[key].after_key)
      data.push(...(await getUniques(index, fields, query, body.aggregations[key].after_key)));
  }
  return data;
};

const getAggregates = async (index, body, after) => {
  const req = {
    index,
    body,
    size: 0
  };

  let { body: res } = await client.search(req);

  return res.aggregations;
};

const search = async (index, body, size = 100, transform = null, loop = false) => {
  let res = await client.search({
    index,
    body,
    scroll: loop ? '10s' : undefined,
    size
  });
  const data = [];
  const _addHits = hits => {
    if (transform) {
      data.push(...hits.map(transform));
    } else {
      data.push(...hits);
    }
  }
  _addHits(res.body.hits.hits);
  if (!loop || !res.body._scroll_id || res.body.hits.hits.length === 0) return data;

  let scrollId = res.body._scroll_id;
  const scrollIds = [scrollId];
  do {
    res = await scroll(scrollId);
    if (res.body.hits.hits.length === 0) break;
    scrollId = res.body._scroll_id;
    scrollIds.push(scrollId);
    _addHits(res.body.hits.hits);
  } while (scrollId);

  await client.clearScroll({ body: { scroll_id: scrollIds } });

  return data;
};

const scroll = async scrollId => {
  return client.scroll({
    body: {
      scroll_id: scrollId,
      scroll: '30s',
    }
  });
};

const indexDoc = async (index, doc) => {
  if (!index?.trim()) throw 'Invalid index name';

  const exists = await indexExists(index);
  if (!exists) await client.indices.create({ index });

  const result = await client.index({
    index,
    body: doc,
    refresh: 'true',
  });

  const success = result?.statusCode === 201;
  if (!success) {
    console.log(result.meta?.body?.error);
    console.log(result);
    throw 'Index failed';
  }

  return result.body?._id;
};

const indexExists = async index => {
  const { body } = await client.indices.exists({ index });
  return body;
};

const slugProjects = config.get('projects').reduce((slugs, project) => {
  slugs[project.slug] = project;
  return slugs;
}, {});

const summariesIndex = config.get('opensearch.index.summaries');

const getLatestRefs = async (slug, src) => {
  const result = await getAggregates(summariesIndex, {
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
    query: {
      bool: {
        filter: [
          { term: { [`package.${slug}.src`]: src || slugProjects[slug].src } },
          { term: { 'scope': slugProjects[slug].key } },
        ]
      }
    }
  });

  return result?.versions?.buckets.reduce((refs, { key: version, run: { hits: { hits: [{ _source: { ref } }] } } }) => {
    refs[version] = ref;
    return refs;
  }, {}) || {};
};

const getRefsCounts = async (slug, refs, security, detailed) => {
  const securityTerm = typeof security === 'boolean' ? [{ term: { 'with-security': security } }] : [];
  const detailsQuery = detailed ? {
      detail: {
        top_hits: {
          sort: [{ 'timestamp': { order: 'desc' } }],
          _source: {
            includes: ['timestamp', `package.${slug}.version`]
          },
          size: 1
        }
      }
  } : {};
  const result = await getAggregates(summariesIndex, {
    aggs: {
      countPassed: { sum: { field: 'count.passed' } },
      countFailed: { sum: { field: 'count.failed' } },
      countSkipped: { sum: { field: 'count.skipped' } },
      countPending: { sum: { field: 'count.pending' } },
      ...detailsQuery,
    },
    query: {
      bool: {
        filter: [
          { term: { 'scope': slugProjects[slug].key } },
          { terms: { 'ref': refs } },
          ...securityTerm,
        ]
      }
    }
  });

  let detail = {};
  if (result.detail?.hits.hits[0]) {
    const resultDetail = result.detail.hits.hits[0]._source;
    detail.timestamp = resultDetail.timestamp;
    detail.packageVersion = resultDetail.package[slug].version;
  }

  return {
    passed: result.countPassed.value,
    failed: result.countFailed.value,
    pending: result.countPending.value,
    skipped: result.countSkipped.value,
    // Pending are tests that are skipped by devs
    // Skipped are tests that had runtime failures
    sum: result.countPassed.value + result.countFailed.value + result.countSkipped.value,
    ...detail,
  };
};

module.exports = {
  createIndex,
  existsIndex,
  pointAlias,
  getUniques,
  getAggregates,
  search,
  getLatestRefs,
  getRefsCounts,
};
