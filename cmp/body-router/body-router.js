class BodyRouter extends HTMLElement {
    static get observedAttributes() {
        return ['data-root', 'data-path'];
    }

    _root;
    _path;
    _changeTimeout = null;
    _changeContent = {};

    get root() {
        return this._root;
    }

    get path() {
        return this._path;
    }

    connectedCallback() {
        this._root = this.getAttribute('data-root');
        this._path = this.getAttribute('data-path');
    }

    attributeChangedCallback(dataName, oldValue, newValue) {
        if (newValue === oldValue) return;

        const name = dataName.replace(/^data-/, '');
        this._handleChange({[name]: newValue});
    }

    _handleChange(data) {
        clearTimeout(this._changeTimeout);
        this._changeContent = {...this._changeContent, ...data};
        this._changeTimeout = setTimeout(async () => {
            const newData = this._changeContent;
            this._changeContent = {};
            await this.load(newData);
        }, 300);
    }

    async load(data) {
        const self = this;
        const {root, path} = {root: this._root, path: this._path, ...data};

        if (root === this._root && path === this._path) return;
        this._root = root;
        this._path = path;

        const existingRootElement = self.querySelector(`${root}-page:only-child`);

        if (existingRootElement) {
            return existingRootElement.setAttribute('path', path);
        }

        if (customElements.get(`${root}-page`)) {
            self.textContent = '';
            self.appendContent(`<${root}-page data-path="${path}"></${root}-page>`);
        } else {
            const resp = await (await fetch(('/' + root + '/' + path).replace(/\/+$/, ''), {
                headers: {
                    'needs-partial': true
                }
            })).json();

            self.classList.add('changing');

            window.requestAnimationFrame(() => {
                self.textContent = '';
                self.appendContent(resp.content || '');
                document.title = resp.title || '';

                this._root = resp.root || '';
                this._path = resp.path || '';
                this.setAttribute('data-root', this._root);
                this.setAttribute('data-path', this._path);

                window.requestAnimationFrame(() => {
                    self.classList.remove('changing');
                });
            });
        }
    }
}

window.customElements.define('body-router', BodyRouter);