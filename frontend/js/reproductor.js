const API_BASE = window.location.origin;

const parametros = new URLSearchParams(window.location.search);
const contenido_id = parametros.get("id");
const perfil_id = localStorage.getItem("perfil_id");

let contenidoActual = null;
let guardandoProgreso = false;
let progresoRestaurado = false;
let ultimoGuardadoSegundo = 0;
let intervaloGuardado = null;

function protegerPerfil() {
    const usuario_id = localStorage.getItem("usuario_id");

    if (!usuario_id || usuario_id === "undefined" || usuario_id === "null") {
        localStorage.clear();
        window.location.href = "login.html";
        return false;
    }

    if (!perfil_id || perfil_id === "undefined" || perfil_id === "null") {
        window.location.href = "seleccionar-perfil.html";
        return false;
    }

    if (!contenido_id || contenido_id === "undefined" || contenido_id === "null") {
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

function aplicarHeroVisual(contenido) {
    const hero = document.getElementById("heroPlayer");
    if (!hero) return;

    const fondo = contenido.fondo || contenido.imagen || "backdrop.jpg";
    const rutaFondo = normalizarImagen(fondo);

    hero.style.backgroundImage = `url('${rutaFondo}')`;
}

function reproducirVideo() {
    const video = document.getElementById("videoPlayer");
    const btnPlayPause = document.getElementById("btnPlayPause");

    if (!video) return;

    video.play();
    if (btnPlayPause) {
        btnPlayPause.innerText = "⏸ Pausa";
    }

    video.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });
}

function escapeHTML(texto) {
    return String(texto || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatearTiempo(segundos) {
    const total = Math.floor(Number(segundos || 0));
    const minutos = Math.floor(total / 60);
    const seg = total % 60;

    return `${minutos}:${String(seg).padStart(2, "0")}`;
}

function mostrarMensajeProgreso(texto, tipo = "info") {
    const mensaje = document.getElementById("mensajeProgresoVideo");

    if (!mensaje) return;

    mensaje.innerText = texto;
    mensaje.className = `player-progress-note ${tipo}`;
}

async function registrarHistorialInicial() {
    if (!perfil_id || !contenido_id) return;

    try {
        await fetch(`${API_BASE}/historial`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                perfil_id,
                contenido_id
            })
        });
    } catch (error) {
        console.log("No se pudo registrar historial inicial:", error);
    }
}

async function obtenerProgresoGuardado() {
    if (!perfil_id || !contenido_id) return null;

    try {
        const respuesta = await fetch(`${API_BASE}/continuar/${perfil_id}`);
        const lista = await respuesta.json();

        if (!Array.isArray(lista)) return null;

        const progreso = lista.find(item => String(item.id) === String(contenido_id));

        if (!progreso) return null;

        return {
            minuto_actual: Number(progreso.minuto_actual || 0),
            porcentaje: Number(progreso.porcentaje || 0)
        };

    } catch (error) {
        console.log("No se pudo obtener progreso guardado:", error);
        return null;
    }
}

async function cargarContenido() {
    if (!protegerPerfil()) return;

    try {
        await registrarHistorialInicial();

        const respuesta = await fetch(`${API_BASE}/contenido/${contenido_id}`);
        const contenido = await respuesta.json();

        contenidoActual = contenido;

        if (!contenido || !contenido.id) {
            alert("Contenido no encontrado");
            window.location.href = "home.html";
            return;
        }

        document.getElementById("tituloContenido").innerText = contenido.titulo || "Sin título";
        document.getElementById("tipoContenido").innerText = contenido.tipo || "Contenido";
        document.getElementById("generoContenido").innerText = contenido.genero || "Sin género";
        document.getElementById("descripcionContenido").innerText = contenido.descripcion || "Sin descripción disponible.";

        aplicarHeroVisual(contenido);
        const video = document.getElementById("videoPlayer");

        video.poster = normalizarImagen(contenido.fondo || contenido.imagen);
        video.src = contenido.video_url || "videos/demo.mp4";
        video.load();

        mostrarMensajeProgreso("Cargando video y progreso guardado...");

        video.addEventListener("loadedmetadata", async () => {
            await restaurarProgresoVideo(video);
        }, { once: true });

        if (contenido.genero) {
            cargarRecomendacionesLocales(contenido.genero, contenido.id);
        }

    } catch (error) {
        console.log("Error al cargar el contenido:", error);
        mostrarMensajeProgreso("No se pudo cargar el contenido.", "error");
    }
}

async function restaurarProgresoVideo(video) {
    if (progresoRestaurado) return;

    progresoRestaurado = true;

    const progreso = await obtenerProgresoGuardado();

    if (!progreso || progreso.minuto_actual <= 0) {
        mostrarMensajeProgreso("Este contenido iniciará desde el comienzo.", "ok");
        return;
    }

    if (!video.duration || progreso.minuto_actual >= video.duration - 8) {
        mostrarMensajeProgreso("Este contenido iniciará desde el comienzo.", "ok");
        return;
    }

    video.currentTime = progreso.minuto_actual;
    ultimoGuardadoSegundo = progreso.minuto_actual;

    mostrarMensajeProgreso(
        `Continuando desde ${formatearTiempo(progreso.minuto_actual)} (${Math.floor(progreso.porcentaje)}%).`,
        "ok"
    );
}

async function guardarProgreso(video, forzar = false) {
    if (!video || !video.duration || !perfil_id || !contenido_id) return;

    const segundoActual = Math.floor(video.currentTime);

    if (!forzar && Math.abs(segundoActual - ultimoGuardadoSegundo) < 5) {
        return;
    }

    if (guardandoProgreso && !forzar) return;

    guardandoProgreso = true;
    ultimoGuardadoSegundo = segundoActual;

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
                minuto_actual: segundoActual,
                porcentaje
            })
        });

        mostrarMensajeProgreso(
            `Progreso guardado en ${formatearTiempo(segundoActual)}.`,
            "ok"
        );

    } catch (error) {
        console.log("No se pudo guardar progreso:", error);
    }

    setTimeout(() => {
        guardandoProgreso = false;
    }, 1200);
}

function guardarProgresoRapido() {
    const video = document.getElementById("videoPlayer");

    if (!video || !video.duration || !perfil_id || !contenido_id) return;

    const segundoActual = Math.floor(video.currentTime);
    const porcentaje = Math.min((video.currentTime / video.duration) * 100, 99);

    try {
        fetch(`${API_BASE}/historial/progreso`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                perfil_id,
                contenido_id,
                minuto_actual: segundoActual,
                porcentaje
            }),
            keepalive: true
        });
    } catch (error) {
        console.log("No se pudo guardar progreso rápido:", error);
    }
}

async function marcarVisto() {
    if (!protegerPerfil()) return;

    const video = document.getElementById("videoPlayer");

    if (video && video.duration) {
        await guardarProgreso(video, true);
    }

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

function inicializarVideo() {
    const video = document.getElementById("videoPlayer");
    const contenedor = document.getElementById("videoContenedor");

    const btnPlayPause = document.getElementById("btnPlayPause");
    const btnRetroceder = document.getElementById("btnRetroceder");
    const btnAdelantar = document.getElementById("btnAdelantar");
    const barraVolumen = document.getElementById("barraVolumen");
    const btnPantallaCompleta = document.getElementById("btnPantallaCompleta");
    const barraProgreso = document.getElementById("barraProgreso");

        let temporizadorControles = null;

        function mostrarControlesVideo() {
            contenedor.classList.remove("controles-ocultos");

            clearTimeout(temporizadorControles);

            if (!video.paused && !video.ended) {
                temporizadorControles = setTimeout(() => {
                    contenedor.classList.add("controles-ocultos");
                }, 3000);
            }
        }

        function ocultarControlesVideo() {
            if (!video.paused && !video.ended) {
                contenedor.classList.add("controles-ocultos");
            }
        }
    
    if (!video) return;

        // Mostrar controles al tocar, hacer clic o mover el mouse
        contenedor.addEventListener("mousemove", mostrarControlesVideo);
        contenedor.addEventListener("click", mostrarControlesVideo);
        contenedor.addEventListener("touchstart", mostrarControlesVideo);

        // Evita que al tocar botones se oculten rápido
        document.getElementById("controlesVideo")?.addEventListener("click", (event) => {
            event.stopPropagation();
            mostrarControlesVideo();
        });

        // Al iniciar, los controles están visibles
        mostrarControlesVideo();

        btnPlayPause.addEventListener("click", () => {
            if (video.paused) {
                video.play();
                btnPlayPause.innerText = "⏸ Pausa";
                mostrarControlesVideo();

                setTimeout(() => {
                    ocultarControlesVideo();
                }, 2500);
            } else {
                video.pause();
                btnPlayPause.innerText = "▶ Play";
                contenedor.classList.remove("controles-ocultos");
                guardarProgreso(video, true);
            }
        });

    btnRetroceder.addEventListener("click", () => {
        video.currentTime = Math.max(video.currentTime - 10, 0);
        guardarProgreso(video, true);
    });

    btnAdelantar.addEventListener("click", () => {
        video.currentTime = Math.min(video.currentTime + 30, video.duration || video.currentTime + 30);
        guardarProgreso(video, true);
    });

    barraVolumen.addEventListener("input", (event) => {
        video.volume = Number(event.target.value);
    });

        btnPantallaCompleta.addEventListener("click", async () => {
            try {
                if (!document.fullscreenElement) {
                    await contenedor.requestFullscreen();
                    btnPantallaCompleta.innerText = "Salir de pantalla completa";
                } else {
                    await document.exitFullscreen();
                    btnPantallaCompleta.innerText = "Pantalla completa";
                }
            } catch (error) {
                alert(`Error al intentar pantalla completa: ${error.message}`);
            }
        });

document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) {
        btnPantallaCompleta.innerText = "Salir de pantalla completa";
    } else {
        btnPantallaCompleta.innerText = "Pantalla completa";
    }
});

        video.addEventListener("play", () => {
            btnPlayPause.innerText = "⏸ Pausa";
            mostrarControlesVideo();

            setTimeout(() => {
                ocultarControlesVideo();
            }, 2500);
        });

        video.addEventListener("pause", () => {
            btnPlayPause.innerText = "▶ Play";
            contenedor.classList.remove("controles-ocultos");
            guardarProgreso(video, true);
        });

    video.addEventListener("timeupdate", () => {
        if (video.duration) {
            barraProgreso.value = (video.currentTime / video.duration) * 100;
        }
    });

    barraProgreso.addEventListener("input", (event) => {
        if (!video.duration) return;

        const tiempoNuevo = (Number(event.target.value) * video.duration) / 100;
        video.currentTime = tiempoNuevo;
    });

    barraProgreso.addEventListener("change", () => {
        guardarProgreso(video, true);
    });

    video.addEventListener("ended", async () => {
        btnPlayPause.innerText = "▶ Play";
        await marcarVisto();
    });

    video.addEventListener("error", () => {
        mostrarMensajeProgreso("No se pudo cargar el video. Revisa la ruta del archivo.", "error");
    });

    intervaloGuardado = setInterval(() => {
        if (!video.paused && !video.ended) {
            guardarProgreso(video);
        }
    }, 5000);

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            guardarProgresoRapido();
        }
    });

    window.addEventListener("beforeunload", () => {
        guardarProgresoRapido();
    });
}

async function cargarRecomendacionesLocales(genero, idActual) {
    try {
        const generoSeguro = encodeURIComponent(genero);
        const respuesta = await fetch(`${API_BASE}/api/recomendaciones/${generoSeguro}/${idActual}`);
        const peliculasRecomendadas = await respuesta.json();

        const contenedor = document.getElementById("contenedorRecomendaciones");

        if (!contenedor) return;

        contenedor.innerHTML = "";

        if (!peliculasRecomendadas || peliculasRecomendadas.length === 0) {
            contenedor.innerHTML = `
                <p class="empty-recomendacion">
                    Aún no hay más películas de este género en el catálogo.
                </p>
            `;
            return;
        }

        peliculasRecomendadas.forEach(pelicula => {
            const enlace = document.createElement("a");

            enlace.className = "pelicula-card";
            enlace.href = `reproductor.html?id=${pelicula.id}`;

            enlace.addEventListener("click", () => {
                guardarProgresoRapido();
            });

            enlace.innerHTML = `
                <img src="${normalizarImagen(pelicula.imagen)}" alt="${escapeHTML(pelicula.titulo)}">
                <p>${escapeHTML(pelicula.titulo)}</p>
            `;

            contenedor.appendChild(enlace);
        });

    } catch (error) {
        console.log("Error cargando recomendaciones locales:", error);
    }
}

cargarContenido();
inicializarVideo();