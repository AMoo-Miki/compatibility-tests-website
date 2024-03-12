const Builder = require("./lib/builder");

(async () => {
    await Builder.build(true);
    console.log('Build completed.');
})().catch(console.error);