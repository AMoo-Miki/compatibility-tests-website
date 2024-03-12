const path = require("path");
const fs = require("fs-extra");
const util = require("./util");
const router = require('express').Router();

const __root = path.join(__dirname, '..');
const __build = path.join(__root, 'build');

const titleSuffix = ' :: Dashboards Compatibility Tests';

router.use(function (req, res, next) {
    /**
     * @param {{title: String, content: String, root: String, path: String}} param
     */
    res.dispatch = (param) => {
        if (util.isNonEmptyObject(param)) {
            Object.keys(param).forEach(key => {
                res.locals[key] = param[key];
            });
        }

        sendResponse(req, res);
    };

    next();
});

router.use('/projects?', require('./routes/projects'));
router.use('/failures?', require('./routes/failures'));


const indexFile = path.join(__build, 'index.html');
let _defaultHTMLContent = fs.readFileSync(indexFile, 'utf8');

if (process.isWatching) {
    const Assets = require("../scripts/lib/assets");
    Assets.on('done:HTML', async () => {
        _defaultHTMLContent = await fs.readFile(indexFile, 'utf8');
    });
}

const sendResponse = (req, res) => {
    if (req.header('needs-partial')) {
        return res.json({
            content: res.locals.partial,
            title: res.locals.title,
            root: res.locals.root,
            path: res.locals.path
        });
    }

    const output = _defaultHTMLContent
        .replace(/<html/, `<html data-path="${res.locals.root}"`)
        .replace(/<body-router.*?>/, `<body-router data-root="${res.locals.root}" data-path="${res.locals.path || ''}">`)
        .replace(/(<body-router.+?>).*(<\/body-router>)/, `\$1${res.locals.partial}\$2`)
        .replace(/(<title>).*(<\/title>)/, `\$1${res.locals.title}${titleSuffix}\$2`);

    res.send(output);
};

router.get('*', (req, res) => {
    res.status(200).sendFile(indexFile);
});

module.exports = router;