const API_BASE = window.location.origin;
const parametros = new URLSearchParams(window.location.search);
const contenido_id = parametros.get("id");
const perfil_id = localStorage.getItem("perfil_id") || sessionStorage.getItem("perfil_id");
const usuario_id = localStorage.getItem("usuario_id") || sessionStorage.getItem("usuario_id");
const dispositivoToken = obtenerDispositivoToken();

let contenidoActual = null;
let guardandoProgreso = false;
let ultimoGuardadoSegundo = 0;
let intervaloGuardado = null;
let intervaloHeartbeat = null;
let restaurando = true;
let minutoGuardadoGlobal = 0;

/* =========================================
   PROTECCIÓN Y TOKENS
========================================= */

function obtenerDispositivoToken() {
    let token = localStorage.getItem("starview_device_token");

    if (!token) {
        token = "dev_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        localStorage.setItem("starview_device_token", token);
    }

    return token;
}

function esPerfilInfantilActivo() {
    return localStorage.getItem("perfil_infantil") === "1" ||
           localStorage.getItem("control_parental") === "1" ||
           localStorage.getItem("control_parental") === "true";
}

function protegerPerfil() {
    if (!usuario_id || usuario_id === "undefined" || usuario_id === "null") {
        localStorage.clear();
        sessionStorage.clear();
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

/* =========================================
   FORMATEADORES Y UTILIDADES VISUALES
========================================= */

function normalizarImagen(imagen) {
    if (!imagen) return "img/backdrop.jpg";

    if (imagen.startsWith("http") || imagen.startsWith("img/")) {
        return imagen;
    }

    return `img/${imagen}`;
}

function aplicarHeroVisual(contenido) {
    const hero = document.getElementById("heroPlayer");

    if (!hero) return;

    const fondo = contenido.fondo || contenido.imagen || "backdrop.jpg";
    hero.style.backgroundImage = `url('${normalizarImagen(fondo)}')`;
}

function escapeHTML(texto) {
    return String(texto || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatearTiempo(segundosTotales) {
    if (isNaN(segundosTotales)) return "0:00";

    const total = Math.floor(Number(segundosTotales || 0));
    const horas = Math.floor(total / 3600);
    const minutos = Math.floor((total % 3600) / 60);
    const seg = total % 60;
    const segFormateado = String(seg).padStart(2, "0");

    if (horas > 0) {
        return `${horas}:${String(minutos).padStart(2, "0")}:${segFormateado}`;
    }

    return `${minutos}:${segFormateado}`;
}

function actualizarDisplayTiempo(video) {
    const actual = document.getElementById("tiempoActual");
    const total = document.getElementById("tiempoTotal");

    if (actual && video) {
        actual.innerText = formatearTiempo(video.currentTime);
    }

    if (total && video && video.duration) {
        total.innerText = formatearTiempo(video.duration);
    }
}

/* =========================================
   GESTIÓN DE HISTORIAL Y PROGRESO
========================================= */

function registrarHistorialInicial() {
    if (!perfil_id || !contenido_id) return;

    fetch(`${API_BASE}/historial`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            perfil_id,
            contenido_id
        })
    }).catch(error => console.log(error));
}

async function obtenerProgresoGuardadoSeguro() {
    try {
        const respuesta = await fetch(`${API_BASE}/continuar/${perfil_id}?t=${Date.now()}`);
        const lista = await respuesta.json();

        if (!Array.isArray(lista)) return 0;

        const progreso = lista.find(item => String(item.id) === String(contenido_id));

        if (!progreso) return 0;

        return Number(progreso.minuto_actual || 0);

    } catch (error) {
        return 0;
    }
}

async function guardarProgreso(video, forzar = false) {
    if (restaurando || !video || video.readyState < 2 || !perfil_id || !contenido_id) return;

    const segundoActual = Math.floor(video.currentTime);

    if (!forzar && Math.abs(segundoActual - ultimoGuardadoSegundo) < 1) return;
    if (guardandoProgreso && !forzar) return;

    guardandoProgreso = true;
    ultimoGuardadoSegundo = segundoActual;

    const porcentaje = video.duration > 0
        ? Math.min((video.currentTime / video.duration) * 100, 99)
        : 0;

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
    } catch (error) {
        console.log("No se pudo guardar progreso:", error);
    }

    setTimeout(() => {
        guardandoProgreso = false;
    }, 500);
}

function guardarProgresoRapido() {
    const video = document.getElementById("videoPlayer");

    if (restaurando || !video || video.readyState < 2 || !perfil_id || !contenido_id) return;

    const segundoActual = Math.floor(video.currentTime);

    const porcentaje = video.duration > 0
        ? Math.min((video.currentTime / video.duration) * 100, 99)
        : 0;

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

async function marcarVistoAutomatico() {
    try {
        await fetch(`${API_BASE}/historial/visto/${contenido_id}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                perfil_id
            })
        });
    } catch (error) {
        console.log("No se pudo marcar como visto:", error);
    }
}

/* =========================================
   CARGA PRINCIPAL CON VALIDACIÓN DE PANTALLAS
========================================= */

async function cargarContenido() {
    if (!protegerPerfil()) return;

    try {
        const respuestaStream = await fetch(`${API_BASE}/api/stream/iniciar`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                usuario_id: usuario_id,
                dispositivo_token: dispositivoToken
            })
        });

        const datosStream = await respuestaStream.json();

        if (!datosStream.ok) {
            alert(datosStream.mensaje);
            window.location.replace("home.html");
            return;
        }

        registrarHistorialInicial();

        const [respuestaContenido, minutoGuardado] = await Promise.all([
            fetch(`${API_BASE}/contenido/${contenido_id}`),
            obtenerProgresoGuardadoSeguro()
        ]);

        minutoGuardadoGlobal = minutoGuardado;
        contenidoActual = await respuestaContenido.json();

        if (!contenidoActual || !contenidoActual.id) {
            window.location.href = "home.html";
            return;
        }

        document.getElementById("tituloContenido").innerText = contenidoActual.titulo || "Sin título";
        document.getElementById("tipoContenido").innerText = contenidoActual.tipo || "Contenido";
        document.getElementById("generoContenido").innerText = contenidoActual.genero || "Sin género";
        document.getElementById("descripcionContenido").innerText = contenidoActual.descripcion || "Sin descripción disponible.";

        aplicarHeroVisual(contenidoActual);

        const video = document.getElementById("videoPlayer");
        const listaAudio = document.getElementById("listaAudio");
        const listaSubtitulos = document.getElementById("listaSubtitulos");

        if (!video) return;

        const idiomaBD = contenidoActual.idioma_audio || "Español (Latino)";

        if (listaAudio) {
            listaAudio.innerHTML = `<li class="activo">${escapeHTML(idiomaBD)}</li>`;
        }

        video.innerHTML = `
            <source src="${contenidoActual.video_url || "videos/demo.mp4"}" type="video/mp4">
            Tu navegador no soporta video.
        `;

        if (contenidoActual.subtitulo_url && listaSubtitulos) {
            const track = document.createElement("track");
            track.id = "pistaSubtitulos";
            track.kind = "subtitles";
            track.src = contenidoActual.subtitulo_url;
            track.srclang = "es";
            track.label = "Español";

            video.appendChild(track);

            listaSubtitulos.innerHTML = `
                <li data-estado="apagado" class="activo">Apagado</li>
                <li data-estado="encendido">Español</li>
            `;

            setTimeout(() => {
                if (video.textTracks && video.textTracks.length > 0) {
                    video.textTracks[0].mode = "hidden";
                }
            }, 100);

        } else if (listaSubtitulos) {
            listaSubtitulos.innerHTML = `
                <li data-estado="apagado" class="activo">Apagado</li>
                <li class="inactivo">No disponibles</li>
            `;
        }

        video.poster = normalizarImagen(contenidoActual.fondo || contenidoActual.imagen);
        video.load();

        video.addEventListener("loadedmetadata", () => {
            if (minutoGuardadoGlobal > 2 && minutoGuardadoGlobal < video.duration - 5) {
                video.currentTime = minutoGuardadoGlobal;
                ultimoGuardadoSegundo = minutoGuardadoGlobal;
            }

            actualizarDisplayTiempo(video);
            restaurando = false;
        }, { once: true });

        configurarSelectorCalidad(datosStream.calidad_maxima);

        intervaloHeartbeat = setInterval(async () => {
            await fetch(`${API_BASE}/api/stream/ping`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    usuario_id: usuario_id,
                    dispositivo_token: dispositivoToken
                })
            });
        }, 15000);

        if (contenidoActual.genero) {
            cargarRecomendacionesLocales(contenidoActual.genero, contenidoActual.id);
        }

        inicializarControlesPlayer();

    } catch (error) {
        console.log("Error al cargar contenido:", error);
    }
}

/* =========================================
   CONTROLES NATIVOS INTERACTIVOS DEL REPRODUCTOR
========================================= */

function inicializarControlesPlayer() {
    const video = document.getElementById("videoPlayer");
    const contenedor = document.getElementById("videoContenedor");
    const btnPlayPause = document.getElementById("btnPlayPause");
    const btnRetroceder = document.getElementById("btnRetroceder");
    const btnAdelantar = document.getElementById("btnAdelantar");
    const barraVolumen = document.getElementById("barraVolumen");
    const btnPantallaCompleta = document.getElementById("btnPantallaCompleta");
    const barraProgreso = document.getElementById("barraProgreso");
    const tooltip = document.getElementById("tiempoTooltip");

    if (!video || !contenedor) return;

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

    if (barraVolumen) {
        barraVolumen.style.background = `linear-gradient(to right, #fff 100%, rgba(255, 255, 255, 0.25) 100%)`;
    }

    if (barraProgreso) {
        barraProgreso.style.background = `linear-gradient(to right, #e50914 0%, rgba(255, 255, 255, 0.25) 0%)`;
    }

    contenedor.addEventListener("mousemove", mostrarControlesVideo);
    contenedor.addEventListener("touchstart", mostrarControlesVideo);

    document.getElementById("controlesVideo")?.addEventListener("click", event => {
        event.stopPropagation();
        mostrarControlesVideo();
    });

    mostrarControlesVideo();

    function togglePlay() {
        if (video.paused) {
            video.play();
            if (btnPlayPause) btnPlayPause.innerText = "⏸ Pausa";
            mostrarControlesVideo();

            setTimeout(ocultarControlesVideo, 2500);
        } else {
            video.pause();
            if (btnPlayPause) btnPlayPause.innerText = "▶ Play";
            contenedor.classList.remove("controles-ocultos");
            guardarProgreso(video, true);
        }
    }

    video.addEventListener("click", togglePlay);

    if (btnPlayPause) {
        btnPlayPause.addEventListener("click", togglePlay);
    }

    if (btnRetroceder) {
        btnRetroceder.addEventListener("click", () => {
            if (video.duration) {
                video.currentTime = Math.max(video.currentTime - 5, 0);
                actualizarDisplayTiempo(video);
                guardarProgreso(video, true);
            }
        });
    }

    if (btnAdelantar) {
        btnAdelantar.addEventListener("click", () => {
            if (video.duration) {
                video.currentTime = Math.min(video.currentTime + 5, video.duration);
                actualizarDisplayTiempo(video);
                guardarProgreso(video, true);
            }
        });
    }

    if (barraVolumen) {
        barraVolumen.addEventListener("input", event => {
            video.volume = Number(event.target.value);

            const porcentaje = event.target.value * 100;

            barraVolumen.style.background = `linear-gradient(to right, #fff ${porcentaje}%, rgba(255, 255, 255, 0.25) ${porcentaje}%)`;
        });
    }

    if (barraProgreso && tooltip) {
        barraProgreso.addEventListener("mousemove", event => {
            if (!video.duration) return;

            const rect = barraProgreso.getBoundingClientRect();
            const pos = (event.clientX - rect.left) / rect.width;
            const tiempoHover = pos * video.duration;

            tooltip.innerText = formatearTiempo(tiempoHover);
            tooltip.style.left = `${event.clientX - rect.left}px`;
            tooltip.style.opacity = "1";
        });

        barraProgreso.addEventListener("mouseleave", () => {
            tooltip.style.opacity = "0";
        });
    }

    const btnConfiguracion = document.getElementById("btnConfiguracion");
    const menuConfiguracion = document.getElementById("menuConfiguracion");
    const listaSubtitulos = document.getElementById("listaSubtitulos");

    if (btnConfiguracion && menuConfiguracion) {
        btnConfiguracion.addEventListener("click", event => {
            event.stopPropagation();
            menuConfiguracion.classList.toggle("oculto");
        });

        contenedor.addEventListener("click", () => {
            if (!menuConfiguracion.classList.contains("oculto")) {
                menuConfiguracion.classList.add("oculto");
            }
        });
    }

    if (listaSubtitulos) {
        listaSubtitulos.addEventListener("click", event => {
            if (event.target.tagName === "LI" && !event.target.classList.contains("inactivo")) {
                Array.from(listaSubtitulos.children).forEach(li => li.classList.remove("activo"));
                event.target.classList.add("activo");

                const estado = event.target.getAttribute("data-estado");

                if (video.textTracks && video.textTracks.length > 0) {
                    if (estado === "encendido") {
                        video.textTracks[0].mode = "showing";
                    } else {
                        video.textTracks[0].mode = "hidden";
                    }
                }

                if (menuConfiguracion) {
                    setTimeout(() => menuConfiguracion.classList.add("oculto"), 200);
                }
            }
        });
    }

    if (btnPantallaCompleta) {
        btnPantallaCompleta.addEventListener("click", async () => {
            try {
                if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                    if (contenedor.requestFullscreen) {
                        await contenedor.requestFullscreen();
                    } else if (contenedor.webkitRequestFullscreen) {
                        await contenedor.webkitRequestFullscreen();
                    }

                    if (screen.orientation && screen.orientation.lock) {
                        await screen.orientation.lock("landscape").catch(error => console.log("Giro no soportado:", error));
                    }

                } else {
                    if (document.exitFullscreen) {
                        await document.exitFullscreen();
                    } else if (document.webkitExitFullscreen) {
                        await document.webkitExitFullscreen();
                    }

                    if (screen.orientation && screen.orientation.unlock) {
                        screen.orientation.unlock();
                    }
                }

            } catch (error) {
                console.log("Error de pantalla completa:", error);
            }
        });
    }

    video.addEventListener("play", () => {
        if (btnPlayPause) {
            btnPlayPause.innerText = "⏸ Pausa";
        }

        mostrarControlesVideo();

        setTimeout(ocultarControlesVideo, 2500);
    });

    video.addEventListener("pause", () => {
        if (btnPlayPause) {
            btnPlayPause.innerText = "▶ Play";
        }

        contenedor.classList.remove("controles-ocultos");
        guardarProgreso(video, true);
    });

    video.addEventListener("timeupdate", () => {
        if (video.duration && barraProgreso) {
            const porcentaje = (video.currentTime / video.duration) * 100;

            barraProgreso.value = porcentaje;
            barraProgreso.style.background = `linear-gradient(to right, #e50914 ${porcentaje}%, rgba(255, 255, 255, 0.25) ${porcentaje}%)`;

            actualizarDisplayTiempo(video);
        }
    });

    video.addEventListener("seeked", () => {
        guardarProgreso(video, true);
    });

    if (barraProgreso) {
        barraProgreso.addEventListener("input", event => {
            if (!video.duration) return;

            const porcentaje = event.target.value;
            video.currentTime = (Number(porcentaje) * video.duration) / 100;

            barraProgreso.style.background = `linear-gradient(to right, #e50914 ${porcentaje}%, rgba(255, 255, 255, 0.25) ${porcentaje}%)`;

            actualizarDisplayTiempo(video);
        });

        barraProgreso.addEventListener("change", () => guardarProgreso(video, true));
    }

    video.addEventListener("ended", async () => {
        if (btnPlayPause) {
            btnPlayPause.innerText = "▶ Play";
        }

        await marcarVistoAutomatico();
    });

    intervaloGuardado = setInterval(() => {
        if (!video.paused && !video.ended) {
            guardarProgreso(video);
        }
    }, 1000);
}

/* =========================================
   SELECTOR Y GESTIÓN DE CALIDADES
========================================= */

function configurarSelectorCalidad(calidadMaxima) {
    const selector = document.getElementById("selectCalidad");

    if (!selector) return;

    selector.innerHTML = "";

    const opciones = [
        { texto: "HD (720p)", valor: "HD", orden: 1 },
        { texto: "Full HD (1080p)", valor: "Full HD", orden: 2 },
        { texto: "Ultra HD (4K)", valor: "Ultra HD", orden: 3 }
    ];

    let ordenMaximo = 1;

    if (calidadMaxima === "Full HD") {
        ordenMaximo = 2;
    }

    if (calidadMaxima === "Ultra HD") {
        ordenMaximo = 3;
    }

    opciones.forEach(opcion => {
        if (opcion.orden <= ordenMaximo) {
            const option = document.createElement("option");
            option.value = opcion.valor;
            option.innerText = opcion.texto;

            selector.appendChild(option);
        }
    });

    selector.addEventListener("change", function () {
        cambiarFuenteVideoPorCalidad(this.value);
    });
}

function cambiarFuenteVideoPorCalidad(calidad) {
    const videoPlayer = document.getElementById("videoPlayer");

    if (!videoPlayer) return;

    const tiempoActual = videoPlayer.currentTime;

    if (calidad === "Ultra HD") {
        videoPlayer.src = contenidoActual?.video_url_4k || contenidoActual?.video_url || "videos/demo.mp4";
    } else if (calidad === "Full HD") {
        videoPlayer.src = contenidoActual?.video_url_1080p || contenidoActual?.video_url || "videos/demo.mp4";
    } else {
        videoPlayer.src = contenidoActual?.video_url || "videos/demo.mp4";
    }

    videoPlayer.currentTime = tiempoActual;
    videoPlayer.play();
}

/* =========================================
   RECOMENDACIONES Y EVENTOS DE CIERRE
========================================= */

async function cargarRecomendacionesLocales(genero, idActual) {
    try {
        const generoSeguro = encodeURIComponent(genero);
        const perfilRecomendacion = localStorage.getItem("perfil_id") || sessionStorage.getItem("perfil_id");

        const respuesta = await fetch(
            `${API_BASE}/api/recomendaciones/${generoSeguro}/${idActual}?perfil_id=${encodeURIComponent(perfilRecomendacion || "")}`
        );

        let peliculasRecomendadas = await respuesta.json();

        if (esPerfilInfantilActivo()) {
            peliculasRecomendadas = peliculasRecomendadas.filter(pelicula => {
                return Number(pelicula.infantil) === 1;
            });
        }

        const contenedor = document.getElementById("contenedorRecomendaciones");

        if (!contenedor) return;

        contenedor.innerHTML = "";

        if (!peliculasRecomendadas || peliculasRecomendadas.length === 0) {
            contenedor.innerHTML = `
                <p class="empty-recomendacion">
                    Aún no hay más películas disponibles para este perfil.
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
        console.log("Error al cargar recomendaciones:", error);
    }
}

/* =========================================
   EVENTOS DE CIERRE Y LIBERACIÓN DE PANTALLA
========================================= */

function liberarPantallaInmediatamente() {
    if (intervaloHeartbeat) {
        clearInterval(intervaloHeartbeat);
    }

    guardarProgresoRapido();

    const datosCierre = new Blob(
        [
            JSON.stringify({
                usuario_id: usuario_id,
                dispositivo_token: dispositivoToken
            })
        ],
        {
            type: "application/json"
        }
    );

    navigator.sendBeacon(`${API_BASE}/api/stream/cerrar`, datosCierre);
}

window.addEventListener("beforeunload", liberarPantallaInmediatamente);

document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        guardarProgresoRapido();
    }
});

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("a[href='home.html']").forEach(enlace => {
        enlace.addEventListener("click", () => {
            liberarPantallaInmediatamente();
        });
    });

    cargarContenido();
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        guardarProgresoRapido();
    }
});