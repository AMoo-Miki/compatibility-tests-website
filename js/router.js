const pathMatcher = new RegExp(`^(?:\/(.*))?$`);

const loadPage = function (loc, addToHistory = true) {
    let [, path] = loc.match(pathMatcher);
    if (!path) path = '';

    const [pathRoot, ...pathRest] = path.split('/');

    document.documentElement.setAttribute('data-path', path);

    const elMainHeader = document.querySelector('main-header');
    if (elMainHeader) {
        elMainHeader.setAttribute('data-root', pathRoot);
    }

    const elBodyRouter = document.querySelector('body-router');
    if (elBodyRouter) {
        elBodyRouter.setAttribute('data-root', pathRoot);
        elBodyRouter.setAttribute('data-path', pathRest.join('/'));
    }

    if (addToHistory !== false) history.pushState(null, '', loc);
    if (!window.location.hash) window.scrollTo(0, 0);
};

window.onpopstate = e => {
    const page = window.location.pathname;
    loadPage(page, false);
};

document.delegateEventListener('click', 'a[href^="/"]:not([routable="false"])', function (e) {
    if (e.which === 3 || e.button === 2 || e.shiftKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const loc = this.getAttribute('href');
    loadPage(loc);
});

document.delegateEventListener('click', 'a[href^="http://"], a[href^="https://"]', function (e) {
    if (e.which === 3 || e.button === 2 || e.shiftKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const loc = this.getAttribute('href');
    window.open(loc);
});

document.delegateEventListener('click', 'a[href^="mailto:"][data-uz][data-at]', function (e) {
    e.preventDefault();
    document.location.href = 'mailto:' + this.getAttribute('data-uz') + '@' + this.getAttribute('data-at');
});