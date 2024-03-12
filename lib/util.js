const https = require('https');
const http = require('http');
const fs = require('fs-extra');
const config = require('./config');

const intl = Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'America/Los_Angeles'
});

const intlTime = Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: 'numeric',
  timeZone: 'America/Los_Angeles'
});

const intlWithTime = Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  timeZone: 'America/Los_Angeles'
});

const slugProjects = config.get('projects').reduce((slugs, project) => {
  slugs[project.slug] = project;
  return slugs;
}, {});

slugProjects['functional-test'] = {
  name: 'Functional Tests',
  src: 'git://opensearch-project/opensearch-dashboards-functional-test/2.x',
}

module.exports = {
  isNonEmptyObject(o) {
    if (!o || o.constructor.name !== 'Object') return false;
    for (let i in o) return true;
    return false;
  },
  isNonEmptyArray(o) {
    return Array.isArray(o) && o.length;
  },
  compareSets(as, bs) {
    if (as.size !== bs.size) return false;
    for (let a of as) if (!bs.has(a)) return false;
    return true;
  },
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  request(url, opts, data) {
    if (!/^https?:\/\//.test(url)) throw `${url} is invalid`;

    const proto = /^https/.test(url) ? https : http;
    return new Promise((resolve, reject) => {
      const req = proto.request(url, opts,
        res => {
          let body = '';
          res.on('data', chunk => (body += chunk.toString()));
          res.on('error', reject);
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode <= 299) {
              resolve({ statusCode: res.statusCode, headers: res.headers, body: body });
            } else {
              reject({ statusCode: res.statusCode, headers: res.headers, body: body });
            }
          });
        });

      req.on('error', err => {
        reject(err.message);
      });

      if (data) req.write(data, 'binary');

      req.end();
    });
  },
  download(url, dest) {
    if (!/^https?:\/\//.test(url)) throw `${url} is invalid`;
    if (!dest) throw 'No destination provided';

    fs.ensureFileSync(dest);

    const proto = /^https/.test(url) ? https : http;

    return new Promise((resolve, reject) => {
      const req = proto.get(url, res => {
        if (res.statusCode === 200) {
          const file = fs.createWriteStream(dest, { flags: 'w' });
          file.on('finish', () => resolve());
          file.on('error', err => {
            reject(err.message);
          });
          res.pipe(file);
        } else {
          reject({ statusCode: res.statusCode, headers: res.headers });
        }
      });

      req.on('error', err => {
        reject(err.message);
      });
    });
  },
  awaitAll: async awaitCalls => {
    const results = [];
    for (const awaitCall of awaitCalls) {
      results.push(await awaitCall);
    }

    return results;
  },
  getDateString: dt => intl.format(new Date(dt)),
  getTimeString: dt => intlTime.format(new Date(dt)),
  getDateTimeString: dt => intlWithTime.format(new Date(dt)),

  getSanitizedTagName: name => name?.replace?.(/[^a-z0-9@. \/\-:]+/ig, ''),
  getSanitizedVersion: name => name?.replace?.(/[^0-9.]+/ig, ''),
  getShortSource: (slug, src) => {
    if (!src.startsWith('git://')) return src;

    const partsDefault = slugProjects[slug]?.src?.split?.(/(?<![:\/])\//);
    if (!partsDefault) return src;

    const partsSrc = src?.split?.(/(?<![:\/])\//);
    if (!Array.isArray(partsSrc) || partsSrc.length !== 3) return src;

    if (
      partsDefault[0]?.toLowerCase() === partsSrc[0]?.toLowerCase() &&
      partsDefault[1]?.toLowerCase() === partsSrc[1]?.toLowerCase()
    )
      return `git://.../${partsSrc[2]}`;

    return src;
  },
  getFullSource: (slug, src) => {
    if (!src.startsWith('git://.../')) return src;

    const partsDefault = slugProjects[slug]?.src?.split?.(/(?<![:\/])\//);
    if (!partsDefault) return src;

    const partsSrc = src?.split?.(/(?<![:\/])\//);
    if (!Array.isArray(partsSrc) || partsSrc.length !== 2) return src;

    return [partsDefault[0], partsDefault[1], partsSrc[1]].join('/');
  }
}