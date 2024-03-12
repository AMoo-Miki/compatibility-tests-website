const path = require('path');
const fs = require('fs-extra');
const Terser = require("terser");
const HTMLMinifier = require('html-minifier');
const CSSO = require('csso');
const Task = require("./task");
const { compareSets } = require("../../lib/util");

class Components extends Task {
    _externals = new Set();

    async build(minify) {
        await super.build();

        try {
            const sourceDir = path.join(this.rootDir, 'cmp');
            const destinationFile = path.join(this.destinationDir, 'js/cmp.js');

            const _externals = new Set(this._externals);
            this._externals.clear();

            const data = [];
            const dirs = await fs.readdir(sourceDir);
            for (let dir of dirs) {
                const _loc = path.join(sourceDir, dir);
                const stat = await fs.lstat(_loc);
                if (!stat.isDirectory()) continue;

                data.push(await this._compile(_loc, minify));
            }

            let content = data.join('\n\n');
            if (minify)
                content = (
                    await Terser.minify(content, {
                        compress: { ecma: 2015 },
                        mangle: { properties: { regex: /^_/ } }
                    })
                ).code;

            await fs.outputFile(destinationFile, content);

            if (!compareSets(_externals, this._externals) && process.isWatching) await this._watchExternals();

        } catch (e) {
            console.error(e);
        }

        await super.done();
    }

    async _compile(loc, minify) {
        const js = path.join(loc, path.basename(loc) + '.js');
        // ToDo: Make this a util and handle nested imports
        return (await fs.readFile(js)).toString()
            .replace(/await\s*\(await\s+fetch\(\s*['"](.+?\.html)['"]\s*\)\s*\)\s*.\s*text\(\)/g, (m, m1) => {
                const loc = /^\//.test(m1) ? path.join(this.rootDir, m1) : path.join(js, '..', m1);
                this._externals.add(loc);

                let content = fs.readFileSync(loc).toString();
                if (minify) content = HTMLMinifier.minify(content, { collapseWhitespace: true });

                return '`' + content + '`';
            })
            .replace(/await\s*\(await\s+fetch\(\s*['"]([^+]+?\.json)['"]\s*\)\s*\)\s*.\s*json\(\)/g, (m, m1) => {
                let loc = /^\//.test(m1) ? path.join(this.rootDir, m1) : path.join(js, '..', m1);
                /*
                if (!fs.existsSync(loc) && /^\//.test(m1)) {
                    loc = path.join(this.destinationDir, m1);
                }
                 */

                if (!fs.existsSync(loc)) return m;

                this._externals.add(loc);

                return fs.readFileSync(loc).toString().trim();
            })
            .replace(/@import\s*(?:url\(\s*)?['"](.+?\.css)['"]\s*\)?(?:;|$)/g, (m, m1) => {
                const loc = /^\//.test(m1) ? path.join(this.rootDir, m1) : path.join(js, '..', m1);
                this._externals.add(loc);

                let content = fs.readFileSync(loc).toString();
                if (minify) content = CSSO.minify(content).css;

                return content;
            });
    }

    async watch() {
        (await super.watch({
            paths: ['**/*.js', '**/*.html', '**/*.css'],
            cwd: 'cmp'
        })).on('all', async (e, loc) => {
            console.log(`\n${(new Date()).toLocaleTimeString('en-US')} -> Changed ./cmp/${loc}`);
            await this.build();
        });
        await this._watchExternals();
    }

    async _watchExternals() {
        (await super.watch({
            paths: [...this._externals]
        }, 'externals')).on('all', async (e, loc) => {
            console.log(`\n${(new Date()).toLocaleTimeString('en-US')} -> Changed ./${path.relative(this.rootDir, loc)}`);
            await this.build();
        });
    }
}

module.exports = new Components();