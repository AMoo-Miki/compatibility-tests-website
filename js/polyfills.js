((SHADOW_ROOT, HTML_ELEMENT) => {
    HTML_ELEMENT.appendContent = SHADOW_ROOT.appendContent = function (content, modifier) {
        const frag = document.createRange().createContextualFragment(content);
        modifier?.(frag);
        this.appendChild(frag);
    }
})(ShadowRoot.prototype, HTMLElement.prototype);

((Event, EventTarget, GLOBAL) => {
    const hash = {};
    const map = {};
    const STAMP = 'data-delegate-stamp';
    const remove = (stamp, event, selector, callback) => {
        const node = map[stamp];
        if (!stamp || !hash[stamp] || !node) return;
        if (event && !hash[stamp][event]) return;

        if (event) {
            if (callback && !hash[stamp][event][callback]) return;

            if (selector !== undefined) {
                // If callback is missing, remove all callback-selector combos
                (callback ? [callback] : Object.keys(hash[stamp][event])).forEach(function (callback) {
                    const idx = hash[self][event][callback].indexOf(selector);
                    if (idx >= 0) {
                        hash[stamp][event][callback].splice(idx, 1);
                        if (hash[stamp][event][callback].length === 0) {
                            node.removeEventListener(event, callback/*, true*/);
                            delete hash[self][event][callback];
                        }
                    }
                });
            } else {
                Object.keys(hash[stamp][event]).forEach(function (callback) {
                    node.removeEventListener(event, callback/*, true*/);
                    delete hash[self][event][callback];
                });
            }
        } else {
            Object.keys(hash[stamp]).forEach(function (event) {
                remove(stamp, event);
            });
            delete hash[stamp];
            node.removeAttribute(STAMP);
            delete map[stamp];
        }
    };
    const observer = new MutationObserver(mutations => {
        if (mutations.some(mutation => mutation.removedNodes.length)) {
            setTimeout(() => {
                Object.keys(map).forEach(stamp => {
                    const node = map[stamp];
                    if (!node.parentNode && node.nodeType !== 9) remove(stamp);
                });
            }, 1000);
        }
    });

    observer.observe(document, {childList: true, subtree: true});

    const stopPropagationOriginal = Event.prototype.stopPropagation;
    Event.prototype.stopPropagation = function() {
        this.propagationStopped = true;
        stopPropagationOriginal.call(this, ...arguments);
    };
    const stopImmediatePropagationOriginal = Event.prototype.stopImmediatePropagation;
    Event.prototype.stopImmediatePropagation = function() {
        this.immediatePropagationStopped = true;
        this.propagationStopped = true;
        stopImmediatePropagationOriginal.call(this, ...arguments);
    };

    EventTarget.prototype.delegateEventListener = function(event, selector, callback) {
        if (typeof(callback) !== 'function' || typeof(selector) !== 'string') return;

        // Throws exception if the selector is invalid, and that is what i want
        document.querySelector(selector);

        const self = this;
        let stamp = self.nodeType === 9 ? 'document' : self.getAttribute(STAMP);

        if (!stamp) {
            do {
                stamp = Math.random();
            } while (hash[stamp]);
        }

        map[stamp] = self;
        hash[stamp] = hash[stamp] || {};
        hash[stamp][event] = hash[stamp][event] || {};

        if (!hash[stamp][event][callback]) {
            self.addEventListener(event, e => {
                for (let target of e.composedPath()) {
                    if (e.propagationStopped) break;

                    for (let selector of hash[stamp][event][callback]) {
                        if (e.immediatePropagationStopped) break;

                        if (target.matches?.(selector)) callback.call(target, e, selector);
                    }
                }
            });
            hash[stamp][event][callback] = [];
        }

        if (!hash[stamp][event][callback].includes(selector)) hash[stamp][event][callback].push(selector);
    };

    EventTarget.prototype.undelegateEventListener = function() {
        const stamp = this.getAttribute(STAMP);
        if (hash[stamp]) remove(stamp, ...arguments);
    };

})(window.Event, window.EventTarget || window.Element, window);