const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'frontend');
const scriptToInject = `
    <script>
        const originalFetch = window.fetch;
        window.fetch = function() {
            let [resource, config] = arguments;
            if (!config) config = {};
            if (config.credentials === undefined) config.credentials = 'include';
            return originalFetch(resource, config);
        };
    </script>`;

fs.readdirSync(dir).filter(f => f.endsWith('.html')).forEach(f => {
    const p = path.join(dir, f);
    let c = fs.readFileSync(p, 'utf8');
    
    if (!c.includes('originalFetch = window.fetch')) {
        c = c.replace(/<head>/i, '<head>' + scriptToInject);
        fs.writeFileSync(p, c);
        console.log('Patched HTML', f);
    }
});
