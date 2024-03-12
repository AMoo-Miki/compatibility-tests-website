const path = require('path');
const fs = require('fs-extra');
const Terser = require("terser");
const HTMLMinifier = require('html-minifier');
const CSSO = require('csso');
const Task = require("./task");
const { compareSets } = require("../../lib/util");

const jsExcludeMatcher = /^\/cmp\//;
const othersExcludeMatcher = /\.(css|js)$/i;

class Assets extends Task {
    _cleanHTML = null;
    _cssFiles = new Set();
    _jsFiles = new Set();

    async build(minify) {
        await super.build();

        await this._buildHTML(minify);
        await this._buildCSS(minify);
        await this._buildJS(minify);
        await this._buildOthers();

        await super.done();
    }

    async _buildHTML(minify) {
        await super.build('HTML');

        try {
            if (!this._cleanHTML) this._init();

            let content = this._cleanHTML
                .replace(/(<\/head>)/, '\t<link rel="stylesheet" href="/css/index.css">\r$1')
                .replace(/(<\/body>)/, '<script src="/js/index.js"></script>\r$1');

            content = content
                .replace(/(<\/body>)/,
                    '<script src="/js/cmp.js"></script>\r' +
                    '$1'
                );

            if (minify) content = HTMLMinifier.minify(content, { collapseWhitespace: true });

            const destFile = path.join(this.destinationDir, `index.html`);
            await fs.outputFile(destFile, content);
        } catch (e) {
            console.error(e);
        }

        await super.done('HTML');
    }

    async _buildCSS(minify) {
        await super.build('CSS');

        try {
            const data = [];

            const destinationFile = path.join(this.destinationDir, 'css/index.css');

            for (let _file of this._cssFiles) {
                const file = path.join(this.rootDir, _file);
                data.push(
                    (await fs.readFile(file)).toString()
                        .replace(/@import\s*(?:url\(\s*)?['"](.+?\.css)['"]\s*\)?(?:;|$)/g, (m, m1) => {
                            const loc = /^\//.test(m1) ? path.join(this.rootDir, m1) : path.join(file, '..', m1);
                            return fs.readFileSync(loc).toString() + '\r\n';
                        })
                        .replace(/url\(\s*['"]?(.+?)['"]?\s*\)/g, (m, m1) => {
                            if (m1.substr(0, 5) === 'data:') return m;
                            const loc = /^\//.test(m1) ? path.join(this.rootDir, m1) : path.join(file, '..', m1);
                            return `url("/${path.relative(this.rootDir, loc)}")`;
                        })
                );
            }

            let content = data.join('\r\n\r\n');
            if (minify) content = CSSO.minify(content).css;

            await fs.outputFile(destinationFile, content);
        } catch (e) {
            console.error(e);
        }

        await super.done('CSS');
    }

    async _buildJS(minify) {
        await super.build('JS');

        try {
            const data = [];

            const destinationFile = path.join(this.destinationDir, 'js/index.js');

            const minFiles = [];
            for (let _file of this._jsFiles) {
                const file = path.join(this.rootDir, _file);
                if (/\.min\.js$/.test(file)) {
                    minFiles.push(file);
                } else {
                    data.push((await fs.readFile(file)).toString());
                }
            }

            let content = data.join('\r\n\r\n');
            if (minify)
                content = (
                    await Terser.minify(content, {
                        compress: { ecma: 2015 },
                        mangle: { properties: { regex: /^_/ } }
                    })
                ).code;

            for (const file of minFiles) {
                content += '\n' + (await fs.readFile(file)).toString();
            }

            await fs.outputFile(destinationFile, content);
        } catch (e) {
            console.error(e);
        }

        await super.done('JS');
    }

    async _buildOthers() {
        await super.build('Others');

        const others = ['img', 'font'];

        try {
            for await (const other of others) {
                await this._copyOtherDir(path.join(this.rootDir, other), path.join(this.destinationDir, other));
            }
        } catch (e) {
            console.error(e);
        }

        await super.done('Others');
    }

    async _copyOtherDir(loc, dest) {
        const files = await fs.readdir(loc);
        for (let file of files) {
            const _loc = path.join(loc, file);
            const stat = await fs.lstat(_loc);
            if (stat.isDirectory()) await this._copyOtherDir(_loc, path.join(dest, file));
            else if (stat.isFile() && !othersExcludeMatcher.test(_loc)) await fs.copy(_loc, path.join(dest, file));
        }
    }

    _init() {
        const cssFiles = new Set();
        const jsFiles = new Set();

        const indexFile = path.join(this.rootDir, 'index.html');
        this._cleanHTML = fs.readFileSync(indexFile).toString()
            .replace(/\s*<link\s+(?:.*?\s+)?href=['"](.+?\.css)['"].*?>/g, (m, m1) => {
                const loc = /^\//.test(m1) ? path.join(this.rootDir, m1) : path.relative(indexFile, m1);
                cssFiles.add('/' + path.relative(this.rootDir, loc));

                return '';
            })
            .replace(/\s*<script\s+(?:.*?\s+)?src=['"](.+?\.js)['"].*?>[\s\r\n]*<\/script>/g, (m, m1) => {
                if (!jsExcludeMatcher.test(m1)) {
                    const loc = /^\//.test(m1) ? path.join(this.rootDir, m1) : path.relative(indexFile, m1);
                    jsFiles.add('/' + path.relative(this.rootDir, loc));
                }
                return '';
            });

        const changed = {
            css: !compareSets(cssFiles, this._cssFiles),
            js: !compareSets(jsFiles, this._jsFiles)
        };

        if (changed.css) {
            this._cssFiles.clear();
            for (let val of cssFiles) this._cssFiles.add(val);
        }

        if (changed.js) {
            this._jsFiles.clear();
            for (let val of jsFiles) this._jsFiles.add(val);
        }

        return changed;
    }

    async watch() {
        if (!this.rootDir) return console.error('Failed to watch CSS; no rootDir set.');

        await this._watchHTML();
        await this._watchCSS();
        await this._watchJS();
        await this._watchOthers();
    }

    async _watchHTML() {
        (await super.watch({
            paths: 'index.html'
        }, 'HTML'))
            .on('all', async (e, loc) => {
                console.log(`\n${(new Date()).toLocaleTimeString('en-US')} -> Changed ./${loc}`);

                const changed = this._init();
                await this._buildHTML();

                if (changed.css) {
                    await this._buildCSS();
                    await this._watchCSS();
                }

                if (changed.js) {
                    await this._buildJS();
                    await this._watchJS();
                }
            });
    }

    async _watchCSS() {
        (await super.watch({
            paths: [...this._cssFiles].map(file => '.' + file)
        }, 'CSS'))
            .on('all', async (e, loc) => {
                console.log(`\n${(new Date()).toLocaleTimeString('en-US')} -> Changed ./${loc}`);
                await this._buildCSS();
            });
    }

    async _watchJS() {
        (await super.watch({
            paths: [...this._jsFiles].map(file => '.' + file)
        }, 'JS'))
            .on('all', async (e, loc) => {
                console.log(`\n${(new Date()).toLocaleTimeString('en-US')} -> Changed ./${loc}`);
                await this._buildJS();
            });
    }

    async _watchOthers() {
        (await super.watch({
            paths: ['font/**/*', 'img/**/*'],
            excludes: [...this._cssFiles, ...this._jsFiles].map(file => '.' + file)
        }, 'Others'))
            .on('add', async loc => {
                console.log(`\n${(new Date()).toLocaleTimeString('en-US')} -> Added ./${loc}`);

                try {
                    await fs.copy(path.join(this.rootDir, loc), path.join(this.destinationDir, loc));
                } catch (e) {
                    console.error(e);
                }
            })
            .on('change', async loc => {
                console.log(`\n${(new Date()).toLocaleTimeString('en-US')} -> Changed ./${loc}`);

                try {
                    await fs.copy(path.join(this.rootDir, loc), path.join(this.destinationDir, loc));
                } catch (e) {
                    console.error(e);
                }
            })
            .on('unlink', async loc => {
                console.log(`\n${(new Date()).toLocaleTimeString('en-US')} -> Deleted ./${loc}`);

                try {
                    await fs.remove(path.join(this.destinationDir, loc));
                } catch (e) {
                    console.error(e);
                }
            });
    }
}

module.exports = new Assets();