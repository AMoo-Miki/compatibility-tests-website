class SearchField extends HTMLElement {

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    async connectedCallback() {
        this.shadowRoot.appendContent(await (await fetch("/cmp/search-field/search-field.html")).text(), frag => {
            const input = frag.querySelector('input[type="search"]');
            if (!input) return;

            let timer;
            const onChange = () => {
                const event = new CustomEvent('search-change', { bubbles: true, detail: input.value });
                this.dispatchEvent(event);
            };

            input.addEventListener('input', e => {
                clearTimeout(timer);
                timer = setTimeout(onChange, 300);

                e.stopPropagation();
            }, false);

            input.form.addEventListener('reset', e => {
                clearTimeout(timer);
                timer = setTimeout(onChange, 300);
                e.stopPropagation();
            }, false);

            input.form.addEventListener('submit', e => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });
    }
}

window.customElements.define('search-field', SearchField);