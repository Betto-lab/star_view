const fs = require('fs');
const path = require('path');

function patchDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            patchDir(fullPath);
        } else if (file.endsWith('.js') || file.endsWith('.html')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            const original = content;

            // Para fetch(url, { ... })
            // Aseguramos que añadimos credentials: 'include' si no existe
            content = content.replace(/fetch\(([^,]+?)\s*,\s*\{/g, (match, url) => {
                return `fetch(${url}, { credentials: 'include', `;
            });

            // Para fetch(url)
            // Tenemos que emparejar el primer argumento que puede ser un template literal, string simple, o variable
            content = content.replace(/fetch\(\s*([^,]+?)\s*\)/g, (match, url) => {
                // si el url tiene {}, es un objeto (ej, en fetch(url, { ... }) que falló la anterior regex)
                if (url.includes('{')) return match; 
                return `fetch(${url}, { credentials: 'include' })`;
            });

            if (content !== original) {
                fs.writeFileSync(fullPath, content);
                console.log('Patched', fullPath);
            }
        }
    }
}

patchDir(path.join(__dirname, 'frontend'));
