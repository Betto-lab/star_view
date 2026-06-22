const API_BASE = window.location.origin;

function cerrarSesion() {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = "index.html";
}

function obtenerPerfilId() {
    return localStorage.getItem("perfil_id") || sessionStorage.getItem("perfil_id");
}

function protegerPerfil() {
    const usuario_id = localStorage.getItem("usuario_id") || sessionStorage.getItem("usuario_id");
    const perfil_id = obtenerPerfilId();

    if (!usuario_id) {
        window.location.href = "login.html";
        return false;
    }

    if (!perfil_id) {
        window.location.href = "seleccionar-perfil.html";
        return false;
    }

    return true;
}

function normalizarImagen(imagen) {
    if (!imagen) return "img/backdrop.jpg";
    if (imagen.startsWith("http") || imagen.startsWith("img/")) return imagen;
    return `img/${imagen}`;
}

function escapeHTML(texto) {
    return String(texto || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function renderCard(item) {
    return `
        <article class="card">
            <img src="${normalizarImagen(item.imagen)}" class="poster" alt="${escapeHTML(item.titulo)}" style="cursor: pointer;" onclick="verAhora(${item.id})">

            <div class="card-info">
                <h3>${escapeHTML(item.titulo)}</h3>
                <p>${escapeHTML(item.tipo || "Contenido")} · ${escapeHTML(item.genero || "Sin género")}</p>

                <div class="card-actions">
                    <button onclick="verAhora(${item.id})">Ver ahora</button>
                    <button onclick="eliminarMiLista(${item.id})" style="background: rgba(255, 255, 255, 0.11);">Eliminar</button>
                </div>
            </div>
        </article>
    `;
}

async function cargarMiLista() {
    if (!protegerPerfil()) return;

    const perfil_id = obtenerPerfilId();
    const contenedor = document.getElementById("miLista");

    try {
        const respuesta = await fetch(`${API_BASE}/mi-lista/${perfil_id}`);
        const lista = await respuesta.json();

        contenedor.innerHTML = "";

        if (!lista || lista.length === 0) {
            contenedor.innerHTML = `
                <div class="empty-state">
                    No tienes contenido agregado en este perfil.
                </div>
            `;
            return;
        }

        contenedor.innerHTML = lista.map(renderCard).join("");
    } catch (error) {
        contenedor.innerHTML = `
            <div class="empty-state">
                No se pudo cargar Mi Lista.
            </div>
        `;
    }
}

async function eliminarMiLista(contenido_id) {
    const perfil_id = obtenerPerfilId();

    try {
        const respuesta = await fetch(`${API_BASE}/mi-lista/${perfil_id}/${contenido_id}`, {
            method: "DELETE"
        });

        const datos = await respuesta.json();
        alert(datos.mensaje);

        cargarMiLista();
    } catch (error) {
        alert("No se pudo eliminar el contenido");
    }
}

async function verAhora(id) {
    const perfil_id = obtenerPerfilId();

    try {
        await fetch(`${API_BASE}/historial`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                perfil_id,
                contenido_id: id
            })
        });
    } catch (error) {
        console.log("No se pudo registrar historial");
    }

    window.location.href = `reproductor.html?id=${id}`;
}

// ==========================================
// MENÚ DESPLEGABLE Y ADMINISTRACIÓN DE PERFIL
// ==========================================

async function cargarDatosTopbar() {
    const usuario_id = localStorage.getItem("usuario_id") || sessionStorage.getItem("usuario_id");
    const perfil_id = obtenerPerfilId();
    
    try {
        const res = await fetch(`${API_BASE}/perfiles/${usuario_id}`);
        const perfiles = await res.json();
        const actual = perfiles.find(p => String(p.id) === String(perfil_id));
        
        if (actual) {
            document.getElementById("navAvatar").src = normalizarImagen(actual.avatar || "Red.jpg");
            document.getElementById("navNombrePerfil").innerText = actual.nombre;
            window.perfilActualData = actual; // Lo guardamos en memoria para editarlo
        }
    } catch (e) {}
}

function abrirEdicionPerfilActual() {
    if (!window.perfilActualData) return;
    document.getElementById("editNombrePerfil").value = window.perfilActualData.nombre;
    
    const av = window.perfilActualData.avatar;
    document.getElementById("editAvatarPerfil").value = av.includes('.') ? av : av + '.jpg';
    document.getElementById("editInfantilPerfil").checked = (Number(window.perfilActualData.infantil) === 1);
    
    document.getElementById("modalEditarPerfil").classList.add("show");
}

async function guardarEdicionPerfilActual() {
    const perfil_id = obtenerPerfilId();
    const nombre = document.getElementById("editNombrePerfil").value.trim();
    const avatar = document.getElementById("editAvatarPerfil").value;
    const infantil = document.getElementById("editInfantilPerfil").checked;

    if (!nombre) return alert("El nombre no puede estar vacío");

    try {
        const res = await fetch(`${API_BASE}/perfiles/${perfil_id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nombre, avatar, infantil })
        });
        const datos = await res.json();
        
        if (datos.ok) {
            if (localStorage.getItem("perfil_nombre")) {
                localStorage.setItem("perfil_nombre", nombre);
                localStorage.setItem("perfil_infantil", infantil ? "1" : "0");
            } else {
                sessionStorage.setItem("perfil_nombre", nombre);
                sessionStorage.setItem("perfil_infantil", infantil ? "1" : "0");
            }
            window.location.reload(); 
        } else {
            alert(datos.mensaje);
        }
    } catch(e) { alert("Error de conexión"); }
}

async function eliminarPerfilActual() {
    if(!confirm("¿Estás 100% seguro de eliminar ESTE perfil?\nPerderás tu Historial y Mi Lista para siempre.")) return;
    
    const perfil_id = obtenerPerfilId();
    try {
        const res = await fetch(`${API_BASE}/perfiles/${perfil_id}`, { method: "DELETE" });
        const datos = await res.json();
        
        if (datos.ok) {
            localStorage.removeItem("perfil_id");
            localStorage.removeItem("perfil_nombre");
            sessionStorage.removeItem("perfil_id");
            sessionStorage.removeItem("perfil_nombre");
            window.location.href = "seleccionar-perfil.html";
        } else {
            alert(datos.mensaje);
        }
    } catch(e) { alert("Error al eliminar"); }
}

// Inicializar la página
document.addEventListener("DOMContentLoaded", () => {
    cargarMiLista();
    cargarDatosTopbar();
});
//a