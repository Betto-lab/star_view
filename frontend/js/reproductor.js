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
        
        // Las líneas del video real que pusimos hace un rato
        const videoElemento = document.getElementById("videoPlayer");
        videoElemento.src = contenido.video_url || "videos/demo.mp4";
        videoElemento.load();

        // 👉 AQUÍ ENCENDEMOS LAS RECOMENDACIONES LOCALES 👈
        if (contenido.genero) {
            // Ahora sí le enviamos todos los géneros completos
            cargarRecomendacionesLocales(contenido.genero, contenido.id);
        }

    } catch (error) {
        console.log("Error al cargar el contenido:", error);
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
    const contenedor = document.getElementById("videoContenedor");
    
    // Controles de la HU11
    const btnPlayPause = document.getElementById("btnPlayPause");
    const btnRetroceder = document.getElementById("btnRetroceder");
    const btnAdelantar = document.getElementById("btnAdelantar");
    const barraVolumen = document.getElementById("barraVolumen");
    const btnPantallaCompleta = document.getElementById("btnPantallaCompleta");
    const barraProgreso = document.getElementById("barraProgreso");

    if (!video) return;

    // Play / Pausa
    btnPlayPause.addEventListener("click", () => {
        if (video.paused) {
            video.play();
            btnPlayPause.innerText = "⏸ Pausa";
        } else {
            video.pause();
            btnPlayPause.innerText = "▶ Play";
        }
    });

    // Retroceder 10s
    btnRetroceder.addEventListener("click", () => {
        video.currentTime -= 10;
    });

    // Adelantar 30s
    btnAdelantar.addEventListener("click", () => {
        video.currentTime += 30;
    });

    // Control de Volumen
    barraVolumen.addEventListener("input", (e) => {
        video.volume = e.target.value;
    });

    // Pantalla Completa
    btnPantallaCompleta.addEventListener("click", () => {
        if (!document.fullscreenElement) {
            contenedor.requestFullscreen().catch(err => {
                alert(`Error al intentar pantalla completa: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    });

    // Actualizar barra de progreso mientras avanza
    video.addEventListener("timeupdate", () => {
        if (video.duration) {
            barraProgreso.value = (video.currentTime / video.duration) * 100;
        }
        guardarProgreso(video); // Función que ya tenías para guardar en BD
    });

    // Permitir adelantar arrastrando la barra
    barraProgreso.addEventListener("input", (e) => {
        if (!video.duration) return; // <-- ESCUDO: Si el video no ha cargado, no intentes calcular
        
        const tiempoNuevo = (e.target.value * video.duration) / 100;
        video.currentTime = tiempoNuevo;
    });

    video.addEventListener("ended", () => {
        marcarVisto();
        btnPlayPause.innerText = "▶ Play";
    });
}
async function cargarRecomendacionesLocales(genero, idActual) {
    try {
        const url = window.location.origin + `/api/recomendaciones/${genero}/${idActual}`;
        const respuesta = await fetch(url);
        const peliculasRecomendadas = await respuesta.json();
        
        const contenedor = document.getElementById("contenedorRecomendaciones");
        contenedor.innerHTML = "";

        if (peliculasRecomendadas.length === 0) {
            contenedor.innerHTML = "<p style='color: gray; margin-left: 20px;'>Aún no hay más películas de este género en el catálogo.</p>";
            return;
        }

        peliculasRecomendadas.forEach(pelicula => {
            const a = document.createElement("a"); // Cambiamos div por a
            a.className = "pelicula-card";
            a.href = `reproductor.html?id=${pelicula.id}`; // Enlace directo
            
            a.innerHTML = `
                <img src="${pelicula.imagen}" alt="${pelicula.titulo}">
                <p style="color: white; text-align: center; font-size: 14px; margin-top: 5px;">${pelicula.titulo}</p>
            `;
            
            contenedor.appendChild(a);
        });

    } catch (error) {
        console.log("Error cargando recomendaciones locales:", error);
    }
}
cargarContenido();
inicializarVideo();