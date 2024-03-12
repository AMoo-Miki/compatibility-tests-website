const ejs = require('ejs');
const path = require('path');
const fs = require('fs-extra');

if (process.isWatching) {
    module.exports = require('../scripts/lib/templates');
    return;
}

const __root = path.join(__dirname, '..');
const _cache = new Map();

const render = (name, data) => {
    let tpl;
    const _name = name.replace(/(^|\/)\.{2,}/g, '');

    if (!_cache.has(_name)) {
        let _loc = path.join(__root, 'tpl', _name + '.ejs');
        if (!fs.existsSync(_loc)) {
            _loc = path.join(__root, 'tpl', _name, 'index.ejs');
        }

        if (!fs.existsSync(_loc)) {
            return `Template "${_name}" not found`;
        }

        tpl = ejs.compile(fs.readFileSync(_loc, 'utf8'), { client: true, compileDebug: false, error: false });
        _cache.set(name, tpl);

    } else {
        tpl = _cache.get(_name);
    }

    return tpl(data, null, partial => render(partial, data));
}

module.exports = {
    render
};