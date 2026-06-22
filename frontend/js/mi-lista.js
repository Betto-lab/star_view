const API_BASE = window.location.origin;
function cerrarSesion() {
    localStorage.clear(); sessionStorage.clear();
}

function obtenerPerfilId() {
    return (localStorage.getItem("perfil_id") || sessionStorage.getItem("perfil_id"));
}

function protegerPerfil() {
    const usuario_id = (localStorage.getItem("usuario_id") || sessionStorage.getItem("usuario_id"));
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
            <img src="${normalizarImagen(item.imagen)}" class="poster" alt="${escapeHTML(item.titulo)}">

            <div class="card-info">
                <h3>${escapeHTML(item.titulo)}</h3>
                <p>${escapeHTML(item.tipo || "Contenido")} · ${escapeHTML(item.genero || "Sin género")}</p>

                <div class="card-actions">
                    <button onclick="verAhora(${item.id})">Ver ahora</button>
                    <button onclick="eliminarMiLista(${item.id})">Eliminar</button>
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

cargarMiLista();