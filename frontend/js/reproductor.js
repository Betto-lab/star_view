const API_BASE = window.location.origin;

const parametros = new URLSearchParams(window.location.search);
const contenido_id = parametros.get("id");
const perfil_id = localStorage.getItem("perfil_id");

let contenidoActual = null;
let guardandoProgreso = false;

function protegerPerfil() {
    const usuario_id = localStorage.getItem("usuario_id");

    if (!usuario_id) {
        window.location.href = "login.html";
        return false;
    }

    if (!perfil_id) {
        window.location.href = "seleccionar-perfil.html";
        return false;
    }

    if (!contenido_id) {
        window.location.href = "home.html";
        return false;
    }

    return true;
}

function normalizarImagen(imagen) {
    if (!imagen) return "img/backdrop.jpg";
    if (imagen.startsWith("http") || imagen.startsWith("img/")) return imagen;
    return `img/${imagen}`;
}

async function cargarContenido() {
    if (!protegerPerfil()) return;

    try {
        const respuesta = await fetch(`${API_BASE}/contenido/${contenido_id}`);
        const contenido = await respuesta.json();
        contenidoActual = contenido;

        if (!contenido || !contenido.id) {
            alert("Contenido no encontrado");
            window.location.href = "home.html";
            return;
        }

        document.getElementById("imagenContenido").src = normalizarImagen(contenido.imagen);
        document.getElementById("tituloContenido").innerText = contenido.titulo || "Sin título";
        document.getElementById("tipoContenido").innerText = "Tipo: " + (contenido.tipo || "Contenido");
        document.getElementById("generoContenido").innerText = "Género: " + (contenido.genero || "Sin género");
        document.getElementById("descripcionContenido").innerText = contenido.descripcion || "Sin descripción disponible.";

    } catch (error) {
        alert("No se pudo cargar el contenido");
        window.location.href = "home.html";
    }
}

async function marcarVisto() {
    if (!protegerPerfil()) return;

    try {
        const respuesta = await fetch(`${API_BASE}/historial/visto/${contenido_id}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ perfil_id })
        });

        const datos = await respuesta.json();
        alert(datos.mensaje || "Contenido marcado como visto");

        window.location.href = "home.html";
    } catch (error) {
        alert("No se pudo marcar como visto");
    }
}

async function guardarProgreso(video) {
    if (guardandoProgreso || !video.duration || !perfil_id || !contenido_id) return;

    guardandoProgreso = true;

    const porcentaje = Math.min((video.currentTime / video.duration) * 100, 99);

    try {
        await fetch(`${API_BASE}/historial/progreso`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                perfil_id,
                contenido_id,
                minuto_actual: Math.floor(video.currentTime),
                porcentaje
            })
        });
    } catch (error) {
        console.log("No se pudo guardar progreso");
    }

    setTimeout(() => {
        guardandoProgreso = false;
    }, 2500);
}

function inicializarVideo() {
    const video = document.getElementById("videoPlayer");

    if (!video) return;

    video.addEventListener("timeupdate", () => {
        guardarProgreso(video);
    });

    video.addEventListener("ended", () => {
        marcarVisto();
    });
}

cargarContenido();
inicializarVideo();