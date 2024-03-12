document.querySelector('.root-header nav .extras').addEventListener('click', e => {
    const target = e.target.closest('.extras > a');
    if (!target) return;

    if (target.classList.contains('go-dark')) {
        Theme?.goDark();
        e.preventDefault();
    } else if (target.classList.contains('go-light')) {
        Theme?.goLight();
        e.preventDefault();
    }
}, true);

const body_ = document.body;

body_.addEventListener('search-change', async e => {
    if (
        document.documentElement.getAttribute('data-path') === 'advisories' &&
        !document.querySelector('body-router[data-path="neglected"]')
    ) {
        const elList = document.querySelector('body-router .list-body[data-search-list]');
        if (!elList) return;

        const resp = await (await fetch(`/advisories/?search=` + e.detail, {
            headers: {
                'needs-partial': true,
                'needs-list': true
            }
        })).json();

        elList.textContent = '';
        elList.appendContent(resp.content || '');
        return;
    }

    document.querySelectorAll('*[data-search-list] .hidden[data-search-key]').forEach(el => el.classList.remove('hidden'));
    if (e.detail) {
        //document.querySelectorAll(`*[data-search-list] *[data-search-key]:not([data-search-key*="${e.detail.replace(/"/g, '').toLowerCase()}"])`).forEach(el => el.classList.add('hidden'));
        document.querySelectorAll(
            e.detail
                .replace(/"/g, '')
                .toLowerCase()
                .split(/[^a-z\d ._-]+/)
                .map(txt => `*[data-search-list] *[data-search-key]:not([data-search-key*="${txt}"])`)
                .join(', ')
        ).forEach(el => el.classList.add('hidden'));
    }

    const elNoResults = document.querySelector('*[data-search-list] .data-list-empty');
    if (document.querySelector('*[data-search-list] *[data-search-key]:not(.hidden)')) {
        elNoResults.classList.add('hidden');
    } else {
        elNoResults.classList.remove('hidden');
    }

});

body_.addEventListener('vulnerabilities-time-change', async e => {
    const { timestamp, project } = e.detail;
    const url_ = `/vulnerabilities/${project}/origin/main@${timestamp}`;

    const elBodyRouter = document.querySelector('body-router');
    if (!elBodyRouter) return window.open(url_);

    const resp = await (await fetch(url_, {
        headers: {
            'needs-partial': true,
            'needs-list': true
        }
    })).json();

    const frag = document.createRange().createContextualFragment(resp.content);

    elBodyRouter._root = resp.root || '';
    elBodyRouter._path = resp.path || '';
    document.title = resp.title || '';
    elBodyRouter.setAttribute('data-root', elBodyRouter._root);
    elBodyRouter.setAttribute('data-path', elBodyRouter._path);

    elBodyRouter.querySelectorAll('.box-head, .box').forEach(el => el.remove());

    elBodyRouter.insertBefore(frag, elBodyRouter.firstChild);
    history.pushState(null, '', url_);
});

body_.addEventListener('dependencies-time-change', async e => {
    const { timestamp, project } = e.detail;
    const url_ = `/project/${project}/origin/main@${timestamp}`;

    const elBodyRouter = document.querySelector('body-router');
    if (!elBodyRouter) return window.open(url_);

    const resp = await (await fetch(url_, {
        headers: {
            'needs-partial': true,
            'needs-list': true
        }
    })).json();

    const frag = document.createRange().createContextualFragment(resp.content);

    elBodyRouter._root = resp.root || '';
    elBodyRouter._path = resp.path || '';
    document.title = resp.title || '';
    elBodyRouter.setAttribute('data-root', elBodyRouter._root);
    elBodyRouter.setAttribute('data-path', elBodyRouter._path);

    elBodyRouter.querySelectorAll('.box-head, .box').forEach(el => el.remove());

    elBodyRouter.insertBefore(frag, elBodyRouter.firstChild);
    history.pushState(null, '', url_);
});

body_.delegateEventListener('click', '.advisory-side .btn-primary', async e => {
    e.preventDefault();
    e.stopImmediatePropagation();
    const form = e.target.closest('form');
    const notesWrapper = e.target.closest('.advisory-side').querySelector('.notes');
    const res = await fetch('/advisories/note', {
        method: 'POST',
        body: new URLSearchParams(new FormData(form)),
        headers: {
            'needs-partial': true
        }
    });

    const json = await res.json();

    form.querySelector('textarea').value = '';
    notesWrapper.textContent = '';
    notesWrapper.appendContent(json.content);
});

body_.delegateEventListener('click', '.advisory-body .tree .icon.icon-toggle', e => {
    e.preventDefault();
    e.stopImmediatePropagation();
    const tree = e.target.closest('.tree');
    if (!tree) return;

    const expander = tree.querySelector('.tree-expander');
    expander?.remove();
    tree.classList.toggle('tree-open');
});

body_.delegateEventListener('click', '.advisory-body .tree-expander a', e => {
    e.preventDefault();
    e.stopImmediatePropagation();
    const expander = e.target.closest('.tree-expander');
    expander?.remove();
});

body_.delegateEventListener('click', '.advisory-body .tree > label > .icon.icon-toggle-shield-check', async e => {
    e.preventDefault();
    e.stopImmediatePropagation();
    const tree = e.target.closest('.tree[data-aliases][data-project]');
    if (!tree || tree.hasAttribute('data-is-busy')) return;

    tree.setAttribute('data-is-busy', 'true');

    const aliases = tree.getAttribute('data-aliases');
    const project = tree.getAttribute('data-project');
    const tag = tree.getAttribute('data-tag');

    const res = await fetch('/advisories/exclusion/add', {
        method: 'POST',
        body: JSON.stringify({aliases, project, tag}),
        headers: {
            'needs-partial': true,
            'Content-Type': 'application/json'
        }
    });

    const json = await res.json();
    if (json.excluded === true) {
        const label = e.target.closest('label');
        label.classList.add('excluded');
        e.target.classList.remove('icon-toggle-shield-check');
        e.target.classList.add('icon-toggle-shield-minus');
    }

    if (json.content) {
        const notesWrapper = body_.querySelector('.advisory-side .notes');
        notesWrapper.textContent = '';
        notesWrapper.appendContent(json.content);
    }


    tree.removeAttribute('data-is-busy');
});

body_.delegateEventListener('click', '.advisory-body .tree > label > .icon.icon-toggle-shield-minus', async e => {
    e.preventDefault();
    e.stopImmediatePropagation();
    const tree = e.target.closest('.tree[data-aliases][data-project]');
    if (!tree || tree.hasAttribute('data-is-busy')) return;

    tree.setAttribute('data-is-busy', 'true');

    const aliases = tree.getAttribute('data-aliases');
    const project = tree.getAttribute('data-project');
    const tag = tree.getAttribute('data-tag');

    const res = await fetch('/advisories/exclusion/delete', {
        method: 'POST',
        body: JSON.stringify({aliases, project, tag}),
        headers: {
            'needs-partial': true,
            'Content-Type': 'application/json'
        }
    });

    const json = await res.json();
    if (json.excluded === false) {
        tree.querySelectorAll('label.excluded').forEach(el => el.classList.remove('excluded'));
        tree.querySelectorAll('label > .icon-toggle-shield-minus').forEach(el => {
            el.classList.add('icon-toggle-shield-check');
            el.classList.remove('icon-toggle-shield-minus');
        });
    }

    if (json.content) {
        const notesWrapper = body_.querySelector('.advisory-side .notes');
        notesWrapper.textContent = '';
        notesWrapper.appendContent(json.content);
    }

    tree.removeAttribute('data-is-busy');
});

body_.delegateEventListener('click', '.advisory-packages div > label > .icon.icon-toggle-rule-check', async e => {
    e.preventDefault();
    e.stopImmediatePropagation();
    const rule = e.target.closest('.advisories-rule[data-aliases][data-ecosystem][data-name][data-version]');
    if (!rule || rule.hasAttribute('data-is-busy')) return;

    rule.setAttribute('data-is-busy', 'true');

    const aliases = rule.getAttribute('data-aliases');
    const ecosystem = rule.getAttribute('data-ecosystem');
    const name = rule.getAttribute('data-name');
    const version = rule.getAttribute('data-version');

    const res = await fetch('/advisories/excluded-rule/add', {
        method: 'POST',
        body: JSON.stringify({ aliases, ecosystem, package: name, rule: version }),
        headers: {
            'needs-partial': true,
            'Content-Type': 'application/json'
        }
    });

    const json = await res.json();
    if (json['rule-excluded'] === true) {
        rule.classList.add('excluded');
        e.target.classList.remove('icon-toggle-rule-check');
        e.target.classList.add('icon-toggle-rule-minus');
    }

    if (json.content) {
        const notesWrapper = body_.querySelector('.advisory-side .notes');
        notesWrapper.textContent = '';
        notesWrapper.appendContent(json.content);
    }


    rule.removeAttribute('data-is-busy');
});

body_.delegateEventListener('click', '.advisory-packages div > label > .icon.icon-toggle-rule-minus', async e => {
    e.preventDefault();
    e.stopImmediatePropagation();
    const rule = e.target.closest('.advisories-rule[data-aliases][data-ecosystem][data-name][data-version]');
    if (!rule || rule.hasAttribute('data-is-busy')) return;

    rule.setAttribute('data-is-busy', 'true');

    const aliases = rule.getAttribute('data-aliases');
    const ecosystem = rule.getAttribute('data-ecosystem');
    const name = rule.getAttribute('data-name');
    const version = rule.getAttribute('data-version');

    const res = await fetch('/advisories/excluded-rule/delete', {
        method: 'POST',
        body: JSON.stringify({ aliases, ecosystem, package: name, rule: version }),
        headers: {
            'needs-partial': true,
            'Content-Type': 'application/json'
        }
    });

    const json = await res.json();
    if (json['rule-excluded'] === false) {
        rule.classList.remove('excluded');
        e.target.classList.remove('icon-toggle-rule-minus');
        e.target.classList.add('icon-toggle-rule-check');
    }

    if (json.content) {
        const notesWrapper = body_.querySelector('.advisory-side .notes');
        notesWrapper.textContent = '';
        notesWrapper.appendContent(json.content);
    }

    rule.removeAttribute('data-is-busy');
});

body_.delegateEventListener('click', '.list-row small.package-origins > a', async e => {
    e.preventDefault();
    e.stopImmediatePropagation();
    e.target.closest('.list-row small.package-origins')?.remove();
});
