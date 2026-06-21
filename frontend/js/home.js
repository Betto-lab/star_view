const API_BASE = window.location.origin;

let catalogo = [];

function mostrarToast(texto, tipo = "info") {
    let contenedor = document.querySelector(".toast-container");

    if (!contenedor) {
        contenedor = document.createElement("div");
        contenedor.className = "toast-container";
        document.body.appendChild(contenedor);
    }

    const toast = document.createElement("div");
    toast.className = `toast ${tipo}`;
    toast.textContent = texto;
    contenedor.appendChild(toast);

    setTimeout(() => toast.classList.add("show"), 50);

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 280);
    }, 2700);
}

function cerrarSesion() {
    localStorage.clear();
    window.location.href = "index.html";
}

function obtenerPerfilId() {
    return localStorage.getItem("perfil_id");
}

async function verificarAccesoCatalogo() {
    const usuarioId = localStorage.getItem("usuario_id");

    if (!usuarioId || usuarioId === "undefined" || usuarioId === "null") {
        localStorage.removeItem("usuario_id");
        localStorage.setItem("volver_despues_login", "planes.html");
        window.location.href = "login.html";
        return false;
    }

    try {
        const respuesta = await fetch(`${API_BASE}/suscripcion/${usuarioId}`);
        const suscripcion = await respuesta.json();

        if (!suscripcion || !suscripcion.estado || suscripcion.estado !== "activa") {
            window.location.href = "planes.html";
            return false;
        }

        return true;
    } catch (error) {
        console.log("Error al verificar suscripción:", error);
        window.location.href = "planes.html";
        return false;
    }
}

function protegerPerfil() {
    const usuario_id = localStorage.getItem("usuario_id");
    const perfil_id = obtenerPerfilId();

    if (!usuario_id || usuario_id === "undefined" || usuario_id === "null") {
        localStorage.removeItem("usuario_id");
        window.location.href = "login.html";
        return false;
    }

    if (!perfil_id || perfil_id === "undefined" || perfil_id === "null") {
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

function cardContenido(item, opciones = {}) {
    const porcentaje = Number(item.porcentaje || 0);
    const progreso = opciones.progreso
        ? `<div class="progress-wrap"><div class="progress-bar" style="width:${Math.min(porcentaje, 100)}%"></div></div>`
        : "";

    return `
        <article class="card">
            <img src="${normalizarImagen(item.imagen)}" class="poster" alt="${escapeHTML(item.titulo)}" style="cursor: pointer;" onclick="verAhora(${item.id})">

            <div class="card-info">
                <h3>${escapeHTML(item.titulo)}</h3>
                <p>${escapeHTML(item.tipo || "Contenido")} · ${escapeHTML(item.genero || "Sin género")}</p>
                ${progreso}

                <div class="card-actions">
                    <button onclick="verAhora(${item.id})">${opciones.progreso ? "Continuar" : "Ver ahora"}</button>
                    <button onclick="agregarMiLista(${item.id})">+ Mi Lista</button>
                </div>
            </div>
        </article>
    `;
}

function cardTMDB(item) {
    return `
        <article class="card">
            <img src="${normalizarImagen(item.imagen)}" class="poster" alt="${escapeHTML(item.titulo)}" style="cursor: pointer;" onclick="verAhoraTMDB(${item.tmdb_id})">

            <div class="card-info">
                <h3>${escapeHTML(item.titulo)}</h3>
                <p>TMDb · ⭐ ${Number(item.calificacion || 0).toFixed(1)}</p>

                <div class="card-actions">
                    <button onclick="verAhoraTMDB(${item.tmdb_id})">Ver ahora</button>
                    <button onclick="agregarMiListaTMDB(${item.tmdb_id})">+ Mi Lista</button>
                </div>
            </div>
        </article>
    `;
}

async function cargarCatalogo() {
    try {
        const respuesta = await fetch(`${API_BASE}/contenido`);
        catalogo = await respuesta.json();
        mostrarCatalogo(catalogo);
    } catch (error) {
        const contenedor = document.getElementById("catalogo");

        if (contenedor) {
            contenedor.innerHTML = `
                <div class="empty-state">No se pudo cargar el catálogo local.</div>
            `;
        }
    }
}

function mostrarCatalogo(lista) {
    const contenedor = document.getElementById("catalogo");

    if (!contenedor) return;

    contenedor.innerHTML = "";

    if (!lista || lista.length === 0) {
        contenedor.innerHTML = `<div class="empty-state">No se encontraron resultados.</div>`;
        return;
    }

    contenedor.innerHTML = lista.map(item => cardContenido(item)).join("");
}

function buscarContenido() {
    const buscar = document.getElementById("buscar");

    if (!buscar) return;

    const texto = buscar.value.toLowerCase().trim();

    const resultados = catalogo.filter(item =>
        String(item.titulo || "").toLowerCase().includes(texto) ||
        String(item.genero || "").toLowerCase().includes(texto) ||
        String(item.tipo || "").toLowerCase().includes(texto)
    );

    mostrarCatalogo(resultados);
}

async function agregarMiLista(contenido_id) {
    const perfil_id = obtenerPerfilId();

    if (!perfil_id) {
        window.location.href = "seleccionar-perfil.html";
        return;
    }

    try {
        const respuesta = await fetch(`${API_BASE}/mi-lista`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                perfil_id,
                contenido_id
            })
        });

        const datos = await respuesta.json();

        mostrarToast(
            datos.mensaje || "Agregado a Mi Lista",
            datos.ok ? "ok" : "error"
        );
    } catch (error) {
        mostrarToast("No se pudo agregar a Mi Lista", "error");
    }
}

async function verAhora(id) {
    const perfil_id = obtenerPerfilId();

    if (!perfil_id) {
        window.location.href = "seleccionar-perfil.html";
        return;
    }

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
        console.log("No se pudo registrar historial:", error);
    }

    window.location.href = `reproductor.html?id=${id}`;
}

async function cargarContinuarViendo() {
    const perfil_id = obtenerPerfilId();
    const contenedor = document.getElementById("continuarViendo");

    if (!contenedor) return;

    try {
        const respuesta = await fetch(`${API_BASE}/continuar/${perfil_id}`);
        const lista = await respuesta.json();

        contenedor.innerHTML = "";

        if (!lista || lista.length === 0) {
            contenedor.innerHTML = `
                <div class="empty-state">
                    Aún no tienes contenido pendiente en este perfil.
                </div>
            `;
            return;
        }

        contenedor.innerHTML = lista.map(item => cardContenido(item, { progreso: true })).join("");
    } catch (error) {
        contenedor.innerHTML = `
            <div class="empty-state">No se pudo cargar Continuar viendo.</div>
        `;
    }
}

async function cargarTMDB() {
    const contenedor = document.getElementById("tmdbCatalogo");

    if (!contenedor) return;

    try {
        const respuesta = await fetch(`${API_BASE}/tmdb/populares`);
        const peliculas = await respuesta.json();

        if (!peliculas || peliculas.length === 0) {
            contenedor.innerHTML = `
                <div class="empty-state">No se pudo cargar TMDb en este momento.</div>
            `;
            return;
        }

        contenedor.innerHTML = peliculas.slice(0, 12).map(item => cardTMDB(item)).join("");
    } catch (error) {
        contenedor.innerHTML = `
            <div class="empty-state">No se pudo conectar con TMDb.</div>
        `;
    }
}

async function importarTMDB(tmdb_id) {
    try {
        const respuesta = await fetch(`${API_BASE}/tmdb/importar`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ tmdb_id })
        });

        const contenido = await respuesta.json();

        if (contenido.error) {
            mostrarToast(contenido.mensaje || "No se pudo importar desde TMDb", "error");
            return null;
        }

        return contenido;
    } catch (error) {
        console.log("Error al importar desde TMDb:", error);
        mostrarToast("No se pudo conectar con TMDb", "error");
        return null;
    }
}

async function verAhoraTMDB(tmdb_id) {
    const contenido = await importarTMDB(tmdb_id);

    if (!contenido) return;

    await verAhora(contenido.id);
}

async function agregarMiListaTMDB(tmdb_id) {
    const contenido = await importarTMDB(tmdb_id);

    if (!contenido) return;

    await agregarMiLista(contenido.id);
}

async function inicializarHome() {
    const accesoPermitido = await verificarAccesoCatalogo();

    if (!accesoPermitido) {
        return;
    }

    if (!protegerPerfil()) {
        return;
    }

    const nombrePerfil = localStorage.getItem("perfil_nombre") || "StarView";
    const perfilActual = document.getElementById("perfilActual");

    if (perfilActual) {
        perfilActual.innerText = `Perfil actual: ${nombrePerfil}`;
    }

    cargarContinuarViendo();
    cargarCatalogo();
    cargarTMDB();

    const buscar = document.getElementById("buscar");

    if (buscar) {
        buscar.addEventListener("input", buscarContenido);
    }
}

inicializarHome();