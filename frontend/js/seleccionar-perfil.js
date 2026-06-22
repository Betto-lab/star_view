const API_BASE = window.location.origin;

let perfilPendiente = null;
let perfilRecuperacion = null;

function cerrarSesion() {
    localStorage.clear();
    window.location.href = "index.html";
}

function obtenerUsuarioId() {
    const usuario_id = localStorage.getItem("usuario_id");

    if (!usuario_id || usuario_id === "undefined" || usuario_id === "null") {
        localStorage.clear();
        window.location.href = "login.html";
        return null;
    }

    return usuario_id;
}

function mostrarMensajePerfil(texto, tipo = "error") {
    const mensaje = document.getElementById("mensajePerfil");

    if (!mensaje) return;

    mensaje.innerText = texto;
    mensaje.style.color = tipo === "ok" ? "#86efac" : "#ffb4b8";
}

function mostrarMensajeClave(texto, tipo = "error") {
    const mensaje = document.getElementById("mensajeClavePerfil");

    if (!mensaje) return;

    mensaje.innerText = texto;
    mensaje.style.color = tipo === "ok" ? "#86efac" : "#ffb4b8";
}

function mostrarMensajeRecuperar(texto, tipo = "error") {
    const mensaje = document.getElementById("mensajeRecuperarPerfil");

    if (!mensaje) return;

    mensaje.innerText = texto;
    mensaje.style.color = tipo === "ok" ? "#86efac" : "#ffb4b8";
}

function mostrarFormularioPerfil() {
    const form = document.getElementById("formPerfil");

    if (form) {
        form.classList.toggle("show");
    }
}

/* =========================
   UTILIDADES DE AVATAR
========================= */

function obtenerRutaAvatar(avatar) {
    if (!avatar) return "img/Red.jpg";

    const texto = String(avatar);

    if (
        texto.includes(".jpg") ||
        texto.includes(".png") ||
        texto.includes(".jpeg") ||
        texto.includes(".webp")
    ) {
        return `img/${texto}`;
    }

    const avatarNormalizado = texto.toLowerCase();

    if (avatarNormalizado.includes("azul")) return "img/Blue.jpg";
    if (avatarNormalizado.includes("verde")) return "img/Green.jpg";
    if (avatarNormalizado.includes("morado")) return "img/Purple.jpg";
    if (avatarNormalizado.includes("dorado")) return "img/Gold.jpg";
    if (avatarNormalizado.includes("rojo")) return "img/Red.jpg";

    return "img/Red.jpg";
}

function obtenerNombreAvatar(avatar) {
    if (!avatar) return "Red.jpg";

    const texto = String(avatar);

    if (
        texto.includes(".jpg") ||
        texto.includes(".png") ||
        texto.includes(".jpeg") ||
        texto.includes(".webp")
    ) {
        return texto;
    }

    const avatarNormalizado = texto.toLowerCase();

    if (avatarNormalizado.includes("azul")) return "Blue.jpg";
    if (avatarNormalizado.includes("verde")) return "Green.jpg";
    if (avatarNormalizado.includes("morado")) return "Purple.jpg";
    if (avatarNormalizado.includes("dorado")) return "Gold.jpg";
    if (avatarNormalizado.includes("rojo")) return "Red.jpg";

    return "Red.jpg";
}

function inicialPerfil(nombre) {
    return String(nombre || "P").trim().charAt(0).toUpperCase();
}

function seleccionarAvatarPerfil(avatar, boton) {
    document.getElementById("avatarPerfil").value = avatar;

    document.querySelectorAll(".avatar-option").forEach(opcion => {
        opcion.classList.remove("active");
    });

    boton.classList.add("active");
}

/* =========================
   CARGAR PERFILES
========================= */

async function cargarPerfiles() {
    const usuario_id = obtenerUsuarioId();

    if (!usuario_id) return;

    const contenedor = document.getElementById("perfilesContainer");

    if (!contenedor) return;

    try {
        const respuesta = await fetch(`${API_BASE}/perfiles/${usuario_id}`);
        const perfiles = await respuesta.json();

        if (!perfiles || perfiles.length === 0) {
            contenedor.innerHTML = `
                <div class="empty-state">
                    Aún no tienes perfiles. Crea uno para ingresar al catálogo.
                </div>
            `;
            return;
        }

        contenedor.innerHTML = "";

        perfiles.forEach(perfil => {
            const card = document.createElement("article");
            card.className = "perfil-card";

            card.innerHTML = `
                <div class="perfil-avatar" style="overflow: hidden; background: transparent;">
                    <img 
                        src="${obtenerRutaAvatar(perfil.avatar)}" 
                        alt="${perfil.nombre}" 
                        style="width: 100%; height: 100%; object-fit: cover; border-radius: 5px;"
                    >
                </div>

                <h3>${perfil.nombre} 🔒</h3>

                ${
                    Number(perfil.infantil) === 1
                        ? `<span class="badge-kids" style="background:#e50914;color:#fff;padding:2px 5px;border-radius:4px;font-size:12px;margin-top:5px;display:inline-block;">Infantil</span>`
                        : ""
                }
            `;

            card.addEventListener("click", () => {
                abrirModalClavePerfil({
                    id: perfil.id,
                    nombre: perfil.nombre,
                    infantil: Number(perfil.infantil) === 1 ? 1 : 0
                });
            });

            contenedor.appendChild(card);
        });

    } catch (error) {
        console.log("Error al cargar perfiles:", error);

        contenedor.innerHTML = `
            <div class="empty-state">
                No se pudieron cargar los perfiles.
            </div>
        `;
    }
}

/* =========================
   CREAR PERFIL
========================= */

async function crearPerfil() {
    const usuario_id = obtenerUsuarioId();

    if (!usuario_id) return;

    const nombre = document.getElementById("nombrePerfil").value.trim();
    const avatar = document.getElementById("avatarPerfil").value;
    const password = document.getElementById("passwordPerfil").value.trim();
    const confirmar = document.getElementById("confirmarPasswordPerfil").value.trim();
    const infantil = document.getElementById("infantilPerfil").checked;

    if (!nombre || !avatar || !password || !confirmar) {
        mostrarMensajePerfil("Completa nombre, avatar y contraseña");
        return;
    }

    if (password.length < 4) {
        mostrarMensajePerfil("La contraseña del perfil debe tener mínimo 4 caracteres");
        return;
    }

    if (password !== confirmar) {
        mostrarMensajePerfil("Las contraseñas no coinciden");
        return;
    }

    try {
        const respuesta = await fetch(`${API_BASE}/perfiles`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                usuario_id,
                nombre,
                avatar,
                infantil,
                password_perfil: password
            })
        });

        const datos = await respuesta.json();

        if (!datos.ok) {
            mostrarMensajePerfil(datos.mensaje || "No se pudo crear el perfil");
            return;
        }

        mostrarMensajePerfil("Perfil creado correctamente", "ok");

        document.getElementById("nombrePerfil").value = "";
        document.getElementById("passwordPerfil").value = "";
        document.getElementById("confirmarPasswordPerfil").value = "";
        document.getElementById("infantilPerfil").checked = false;

        mostrarFormularioPerfil();

        await cargarPerfiles();

    } catch (error) {
        console.log(error);
        mostrarMensajePerfil("No se pudo conectar con el servidor");
    }
}

/* =========================
   MODAL INGRESO PERFIL
========================= */

function abrirModalClavePerfil(perfil) {
    perfilPendiente = perfil;

    document.getElementById("modalPerfilNombre").innerText = perfil.nombre;
    document.getElementById("passwordIngresoPerfil").value = "";

    mostrarMensajeClave("");

    document.getElementById("modalClavePerfil").classList.add("show");

    setTimeout(() => {
        document.getElementById("passwordIngresoPerfil").focus();
    }, 100);
}

function cerrarModalClavePerfil() {
    perfilPendiente = null;
    document.getElementById("modalClavePerfil").classList.remove("show");
}

async function validarIngresoPerfil() {
    const usuario_id = obtenerUsuarioId();

    if (!usuario_id || !perfilPendiente) return;

    const password = document.getElementById("passwordIngresoPerfil").value.trim();

    if (!password) {
        mostrarMensajeClave("Ingresa la contraseña del perfil");
        return;
    }

    await validarIngresoBackend(
        perfilPendiente.id,
        password,
        perfilPendiente.nombre
    );
}

async function validarIngresoBackend(perfil_id, pin, perfil_nombre) {
    const usuario_id = obtenerUsuarioId();

    if (!usuario_id) return;

    try {
        const respuesta = await fetch(`${API_BASE}/perfiles/verificar`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                usuario_id,
                perfil_id,
                password_perfil: pin
            })
        });

        const datos = await respuesta.json();

        if (!datos.ok) {
            mostrarMensajeClave(datos.mensaje || "Contraseña incorrecta");
            return;
        }

        const perfilValidado = datos.perfil || {};
        const infantilServidor = perfilValidado.infantil;
        const infantilLocal = perfilPendiente ? perfilPendiente.infantil : 0;

        const esInfantil =
            Number(infantilServidor) === 1 ||
            Number(infantilLocal) === 1;

        localStorage.setItem("perfil_id", perfilValidado.id || perfil_id);
        localStorage.setItem("perfil_nombre", perfilValidado.nombre || perfil_nombre);

        localStorage.setItem("perfil_infantil", esInfantil ? "1" : "0");
        localStorage.setItem("control_parental", esInfantil ? "1" : "0");

        mostrarMensajeClave("Perfil verificado correctamente", "ok");

        setTimeout(() => {
            window.location.href = "home.html";
        }, 500);

    } catch (error) {
        console.log(error);
        mostrarMensajeClave("No se pudo conectar con el servidor");
    }
}

/* =========================
   RECUPERAR CONTRASEÑA DE PERFIL
========================= */

function abrirModalRecuperarPerfil() {
    if (!perfilPendiente) {
        mostrarMensajeClave("Selecciona un perfil primero");
        return;
    }

    perfilRecuperacion = perfilPendiente;

    document.getElementById("modalRecuperarPerfilNombre").innerText = `Recuperar: ${perfilRecuperacion.nombre}`;
    document.getElementById("codigoRecuperarPerfil").value = "";
    document.getElementById("nuevaPasswordPerfil").value = "";
    document.getElementById("confirmarNuevaPasswordPerfil").value = "";

    mostrarMensajeRecuperar("");

    document.getElementById("modalClavePerfil").classList.remove("show");
    document.getElementById("modalRecuperarPerfil").classList.add("show");
}

function cerrarModalRecuperarPerfil() {
    document.getElementById("modalRecuperarPerfil").classList.remove("show");

    if (perfilRecuperacion) {
        perfilPendiente = perfilRecuperacion;
        document.getElementById("modalClavePerfil").classList.add("show");
    }
}

async function enviarCodigoRecuperacionPerfil() {
    const usuario_id = obtenerUsuarioId();

    if (!usuario_id || !perfilRecuperacion) {
        mostrarMensajeRecuperar("No se encontró el perfil seleccionado");
        return;
    }

    const boton = document.getElementById("btnEnviarCodigoPerfil");
    const textoOriginal = boton.innerText;

    boton.innerText = "Enviando código...";
    boton.disabled = true;

    mostrarMensajeRecuperar("Enviando código al correo de la cuenta...", "ok");

    try {
        const respuesta = await fetch(`${API_BASE}/perfiles/recuperar-iniciar`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                usuario_id,
                perfil_id: perfilRecuperacion.id
            })
        });

        const datos = await respuesta.json();

        boton.innerText = textoOriginal;
        boton.disabled = false;

        if (!datos.ok) {
            mostrarMensajeRecuperar(datos.mensaje || "No se pudo enviar el código");
            return;
        }

        mostrarMensajeRecuperar("Código enviado. Revisa el correo de la cuenta.", "ok");

    } catch (error) {
        console.log(error);

        boton.innerText = textoOriginal;
        boton.disabled = false;

        mostrarMensajeRecuperar("No se pudo conectar con el servidor");
    }
}

async function restablecerPasswordPerfil() {
    const usuario_id = obtenerUsuarioId();

    if (!usuario_id || !perfilRecuperacion) {
        mostrarMensajeRecuperar("No se encontró el perfil seleccionado");
        return;
    }

    const codigo = document.getElementById("codigoRecuperarPerfil").value.trim();
    const nuevaPassword = document.getElementById("nuevaPasswordPerfil").value.trim();
    const confirmarPassword = document.getElementById("confirmarNuevaPasswordPerfil").value.trim();

    if (!codigo || !nuevaPassword || !confirmarPassword) {
        mostrarMensajeRecuperar("Completa código y nueva contraseña");
        return;
    }

    if (nuevaPassword.length < 4) {
        mostrarMensajeRecuperar("La nueva contraseña debe tener mínimo 4 caracteres");
        return;
    }

    if (nuevaPassword !== confirmarPassword) {
        mostrarMensajeRecuperar("Las contraseñas no coinciden");
        return;
    }

    try {
        const respuesta = await fetch(`${API_BASE}/perfiles/recuperar-confirmar`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                usuario_id,
                perfil_id: perfilRecuperacion.id,
                codigo,
                nueva_password: nuevaPassword
            })
        });

        const datos = await respuesta.json();

        if (!datos.ok) {
            mostrarMensajeRecuperar(datos.mensaje || "No se pudo cambiar la contraseña");
            return;
        }

        mostrarMensajeRecuperar("Contraseña actualizada correctamente", "ok");

        setTimeout(() => {
            document.getElementById("modalRecuperarPerfil").classList.remove("show");

            perfilPendiente = perfilRecuperacion;
            perfilRecuperacion = null;

            document.getElementById("passwordIngresoPerfil").value = "";

            mostrarMensajeClave("Ahora ingresa con tu nueva contraseña", "ok");
            document.getElementById("modalClavePerfil").classList.add("show");
        }, 900);

    } catch (error) {
        console.log(error);
        mostrarMensajeRecuperar("No se pudo conectar con el servidor");
    }
}

/* =========================
   EVENTOS
========================= */

document.addEventListener("DOMContentLoaded", cargarPerfiles);

document.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        const modalRecuperarAbierto = document.getElementById("modalRecuperarPerfil")?.classList.contains("show");
        const modalClaveAbierto = document.getElementById("modalClavePerfil")?.classList.contains("show");

        if (modalRecuperarAbierto) {
            restablecerPasswordPerfil();
            return;
        }

        if (modalClaveAbierto) {
            validarIngresoPerfil();
        }
    }

    if (event.key === "Escape") {
        const modalRecuperarAbierto = document.getElementById("modalRecuperarPerfil")?.classList.contains("show");

        if (modalRecuperarAbierto) {
            cerrarModalRecuperarPerfil();
        } else {
            cerrarModalClavePerfil();
        }
    }
});