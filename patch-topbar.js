const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'frontend');
const filesToPatch = [
    'planes.html', 'cuenta.html', 'facturacion.html', 'suscripcion.html', 
    'pago.html', 'pago-exitoso.html', 'pago-pendiente.html', 'pago-fallido.html'
];

const replacement = `if (!usuario_id) return;
        if (!perfil_id) {
            const avatarImg = document.getElementById("navAvatar");
            if(avatarImg) avatarImg.src = "img/Red.jpg";
            
            const nombrePerfil = document.getElementById("navNombrePerfil");
            if(nombrePerfil) nombrePerfil.innerText = localStorage.getItem("nombre_usuario") || "Mi Cuenta";
            
            const dropdown = document.querySelector(".dropdown-menu");
            if (dropdown) {
                const elementsToHide = dropdown.querySelectorAll("button[onclick*='abrirEdicionPerfilActual'], button[onclick*='eliminarPerfilActual'], a[href='seleccionar-perfil.html']");
                elementsToHide.forEach(el => el.style.display = 'none');
            }
            
            const nav = document.querySelector(".nav");
            if (nav) {
                const links = nav.querySelectorAll("a[href='home.html'], a[href='mi-lista.html'], .search-container");
                links.forEach(el => el.style.display = 'none');
            }
            return;
        }`;

filesToPatch.forEach(f => {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) return;
    
    let c = fs.readFileSync(p, 'utf8');
    
    if (c.includes('if (!usuario_id || !perfil_id) return;')) {
        c = c.replace('if (!usuario_id || !perfil_id) return;', replacement);
        fs.writeFileSync(p, c);
        console.log('Patched', f);
    } else {
        console.log('Skipped', f, '- Target string not found');
    }
});
