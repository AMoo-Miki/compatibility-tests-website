process.isDevelopment = true;
const Builder = require("./lib/builder");

(async () => {
    await Builder.build(false);
    await Builder.watch();

    require('../serve');
})().catch(console.error);
