const fs = require('fs-extra');
const path = require('path');
const Assets = require('./assets');
const Components = require('./components');
const Templates = require('./templates');

const __build = path.join(__dirname, '../../build');

const build = async (minify) => {
    // Clean
    await fs.emptyDir(__build);

    //Build
    await Assets.build(minify);
    await Components.build(minify);
    await Templates.build(minify);
};

const watch = async () => {
    process.isWatching = true;

    await Assets.watch();
    await Components.watch();
    await Templates.watch();
};

module.exports = {
    build,
    watch
}