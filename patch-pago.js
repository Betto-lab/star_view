const fs = require('fs');
const path = require('path');
const files = ['pago.html', 'pago-exitoso.html', 'pago-pendiente.html', 'pago-fallido.html'];

const scriptToAdd = `
<script>
    const NAV_API_BASE = window.location.origin;
    function cerrarSesionNav() {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = 'index.html';
    }
    async function cargarDatosTopbar() {
        const usuario_id = localStorage.getItem('usuario_id') || sessionStorage.getItem('usuario_id');
        const perfil_id = localStorage.getItem('perfil_id') || sessionStorage.getItem('perfil_id');
        
        if (!usuario_id) return;
        if (!perfil_id) {
            const avatarImg = document.getElementById('navAvatar');
            if(avatarImg) avatarImg.src = 'img/Red.jpg';
            
            const nombrePerfil = document.getElementById('navNombrePerfil');
            if(nombrePerfil) nombrePerfil.innerText = localStorage.getItem('nombre_usuario') || 'Mi Cuenta';
            
            const dropdown = document.querySelector('.dropdown-menu');
            if (dropdown) {
                const elementsToHide = dropdown.querySelectorAll('button[onclick*="abrirEdicionPerfilActual"], button[onclick*="eliminarPerfilActual"], a[href="seleccionar-perfil.html"]');
                elementsToHide.forEach(el => el.style.display = 'none');
            }
            
            const nav = document.querySelector('.nav');
            if (nav) {
                const links = nav.querySelectorAll('a[href="home.html"], a[href="mi-lista.html"], .search-container');
                links.forEach(el => el.style.display = 'none');
            }
            return;
        }

        try {
            const res = await fetch(\`\${NAV_API_BASE}/perfiles/\${usuario_id}\`);
            const perfiles = await res.json();
            const actual = perfiles.find(p => String(p.id) === String(perfil_id));
            
            if (actual) {
                const img = actual.avatar.includes('.') ? actual.avatar : actual.avatar + '.jpg';
                const elImg = document.getElementById('navAvatar');
                if(elImg) elImg.src = \`img/\${img}\`;
                const elNom = document.getElementById('navNombrePerfil');
                if(elNom) elNom.innerText = actual.nombre;
            }
        } catch (e) { console.error('Error', e); }
    }
    function cerrarSesion() {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = 'login.html';
    }
    document.addEventListener('DOMContentLoaded', () => { cargarDatosTopbar(); });
</script>
`;

files.forEach(f => {
    let p = path.join('frontend', f);
    if(fs.existsSync(p)){
        let c = fs.readFileSync(p, 'utf8');
        if(!c.includes('cargarDatosTopbar')) {
            c = c.replace('</body>', scriptToAdd + '</body>');
            fs.writeFileSync(p, c);
            console.log('Patched', f);
        }
    }
});
