const express = require('express');
const app = express();
const compression = require('compression');
const { auth } = require('express-openid-connect');
const config = require("./lib/config");

const midwayConfig = config.get('midway');
const port = 8080;
const baseURL = process.isDevelopment ? `http://0.0.0.0:${port}` : midwayConfig.baseURL;


app.get('/', (req, res) => {
    res.redirect('/projects');
});

app.set('trust proxy', true);


app.use(auth({
    issuerBaseURL: 'https://idp-integ.federate.amazon.com',
    authorizationParams: {
        response_mode: 'query',
        response_type: 'code',
        scope: "openid",
    },
    ...midwayConfig,
    baseURL,
}));


app.use(compression());

app.use(express.static('build', { index: 'index.html' }));
app.use(require('./lib/routes'));

app.listen(port, () => {
    console.log(`Listening on ${baseURL}`);
});