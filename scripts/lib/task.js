const chokidar = require('chokidar');
const path = require("path");
const {wait} = require("../../lib/util");
const EventEmitter = require('events');

const __root = path.join(__dirname, '../..');
const __build = path.join(__root, 'build');

class Task extends EventEmitter {
    rootDir = __root;
    destinationDir = __build;
    minify = false;

    _hasArtifacts = true;

    _busy = {};
    _watcher = {};

    async build(name = '@') {
        while (this._busy[name]) {
            console.log(`Waiting${name === '@' ? '' : ` for ${name}`}...`);
            await wait(250);
        }

        if (!this.rootDir) throw `Failed to build ${name === '@' ? '' : `${name} from `}${this.constructor.name}; no rootDir set.`;
        if (this._hasArtifacts && !this.destinationDir) throw `Failed to build ${name === '@' ? '' : `${name} from `}${this.constructor.name}; no destinationDir set.`;

        this._busy[name] = true;

        console.log(`*** ${this.constructor.name}: building${name === '@' ? '' : ` ${name}`}...`);
    }

    done(name = '@') {
        console.log(`*** ${this.constructor.name}: done${name === '@' ? '' : ` with ${name}`}.`);

        if (name !== '@') {
            this.emit(`done:${name}`);
        }
        this.emit('done');

        this._busy[name] = false;
    }

    async watch({paths, cwd, excludes}, name = '@') {
        if (!this.rootDir) throw `Failed to setup the change monitor for ${name === '@' ? '' : `${name} from `}${this.constructor.name}; no rootDir set.`;
        if (!paths) throw `Failed to setup the change monitor for ${name === '@' ? '' : `${name} from `}${this.constructor.name}; no paths set.`;

        await this._watcher[name]?.close();
        if (paths.length === 0) return;

        this._watcher[name] = chokidar.watch(paths, {
            cwd: (!cwd || cwd === '.') ? this.rootDir : path.join(this.rootDir, cwd),
            ignoreInitial: true,
            ignored: excludes,
            awaitWriteFinish: {
                stabilityThreshold: 1000,
                pollInterval: 100
            }
        });

        return this._watcher[name];
    }
}

module.exports = Task;