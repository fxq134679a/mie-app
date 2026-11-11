(function () {
    'use strict';
    window.FoodApp = {
        open() {
            const frame = document.getElementById('have-you-eaten-iframe');
            if (!frame.dataset.loaded) {
                frame.src = 'js/lib/have-you-eaten/index.html?v=20261111food1';
                frame.dataset.loaded = 'true';
            }
        }
    };
    window.addEventListener('message', function (event) {
        const frame = document.getElementById('have-you-eaten-iframe');
        if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin) return;
        if (event.data?.type === 'mie-food-home') switchScreen('home-screen');
    });
})();
