const ejs = require('ejs');
const path = require('path');
const fs = require('fs-extra');
const Terser = require("terser");
const Task = require("./task");

class Templates extends Task {
    _sourceDir;
    _cache = new Map();

    _hasArtifacts = false;

    async build(minify) {
        await super.build();

        try {
            const destinationFile = path.join(this.destinationDir, 'js/templates.js');

            this._sourceDir = path.join(this.rootDir, 'tpl');
            await this._walk(this._sourceDir);

            let output = 'Template = {\n' +
                '  cache: {\n';
            for (const [key, value] of this._cache.entries()) {
                output += `    '${key}': ${value.toString()},\n`;
            }
            output += '}}';

            output = output.replace(/function anonymous/g, 'function');

            if (minify) {
                output = (
                    await Terser.minify(output, {
                        compress: { ecma: 2015 },
                        mangle: { properties: { regex: /^_/ } }
                    })
                ).code;
            }

            await fs.outputFile(destinationFile, output);
        } catch (e) {
            console.error(e);
        }

        await super.done();
    }

    async _compile(loc) {
        const _loc = path.relative(this._sourceDir, loc);
        const parts = _loc.replace(/\.ejs$/, '').split('/');

        if (parts[parts.length - 1] === 'index') parts.pop();

        this._cache.set(parts.join('/'), ejs.compile(await fs.readFile(loc, 'utf8'), { client: true, compileDebug: false, error: false }));
    }

    async _walk(loc) {
        const files = await fs.readdir(loc);

        for (let file of files) {
            const _loc = path.join(loc, file);
            const stat = await fs.lstat(_loc);

            if (stat.isDirectory()) {
                await this._walk(_loc);
            } else if (stat.isFile() && /\.ejs$/.test(file)) {
                await this._compile(_loc);
            }
        }
    }

    async watch() {
        (await super.watch({
            paths: '**/*.ejs',
            cwd: 'tpl',
        }))
            .on('all', async (e, loc) => {
                console.log(`\n${(new Date()).toLocaleTimeString('en-US')} -> Changed ./tpl/${loc}`);
                await this.build();
            });
    }

    render(name, data) {
        if (!this._cache.has(name)) return `Failed to load ${name}`;
        const tpl = this._cache.get(name);
        return tpl(data, null, (partial, locals) => this.render(partial, { ...data, ...locals }));
    }
}

module.exports = new Templates();
