const Theme = {
    goDark: () => {
        console.log('Going dark');
        document.documentElement.classList.remove('light-theme');
        localStorage.setItem('user-theme', 'dark');
    },
    goLight: () => {
        console.log('Going light');
        document.documentElement.classList.add('light-theme');
        localStorage.setItem('user-theme', 'light');
    }
};

Theme[localStorage.getItem('user-theme') === 'light' ? 'goLight' : 'goDark']();