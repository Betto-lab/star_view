const API_BASE = window.location.origin;

function mostrarMensaje(texto, tipo = "error") {
    const mensaje = document.getElementById("mensaje");

    if (!mensaje) return;

    mensaje.innerText = texto;
    mensaje.style.color = tipo === "ok" ? "#86efac" : "#ffb4b8";
}

function mostrarMensajeRecuperacion(texto, tipo = "error") {
    const mensaje = document.getElementById("mensajeRecuperacion");

    if (!mensaje) return;

    mensaje.innerText = texto;
    mensaje.style.color = tipo === "ok" ? "#86efac" : "#ffb4b8";
}

function abrirRecuperacion() {
    const inputCorreoLogin = document.getElementById("correo");
    const correoLogin = inputCorreoLogin ? inputCorreoLogin.value.trim() : "";
    const modal = document.getElementById("modalRecuperacion");

    const inputCorreoRecuperar = document.getElementById("correoRecuperar");
    if (inputCorreoRecuperar) inputCorreoRecuperar.value = correoLogin;
    
    const inputNuevaPassword = document.getElementById("nuevaPassword");
    if (inputNuevaPassword) inputNuevaPassword.value = "";
    
    const inputCodigo = document.getElementById("codigoCuenta");
    if (inputCodigo) inputCodigo.value = "";

    // SE ELIMINÓ LA LLAMADA A "confirmarPassword" PORQUE ESE CAMPO NO EXISTE EN EL HTML

    mostrarMensajeRecuperacion("");

    if (modal) {
        modal.classList.add("show");
    }
}

function cerrarRecuperacion() {
    const modal = document.getElementById("modalRecuperacion");

    if (modal) {
        modal.classList.remove("show");
    }
}

async function iniciarSesion() {
    const correo = document.getElementById("correo").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!correo || !password) {
        mostrarMensaje("Completa correo y contraseña");
        return;
    }

    const btnLogin = document.querySelector(".btn-full");
    const textoOriginal = btnLogin ? btnLogin.innerText : "Ingresar";
    
    if (btnLogin) {
        btnLogin.innerText = "Cargando...";
        btnLogin.disabled = true;
    }

    try {
        const respuesta = await fetch(`${API_BASE}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ correo, password })
        });

        const datos = await respuesta.json();

        if (btnLogin) {
            btnLogin.innerText = textoOriginal;
            btnLogin.disabled = false;
        }

        if (!datos.ok && datos.mensaje !== "Inicio de sesión correcto") {
            mostrarMensaje(datos.mensaje || "Correo o contraseña incorrectos");
            return;
        }

        const usuario = datos.usuario || {};
        const usuarioId = usuario.id || usuario.id_usuario || usuario.usuario_id || datos.usuario_id || datos.id_usuario || datos.id;

        if (!usuarioId) {
            mostrarMensaje("Error: no se recibió el ID del usuario");
            return;
        }

        // --- LÓGICA CORREGIDA DE CHECKBOX ---
        const mantenerSesion = document.getElementById("mantenerSesion")?.checked;

        if (mantenerSesion) {
            localStorage.setItem("usuario_id", usuarioId);
            localStorage.setItem("nombre_usuario", usuario.nombre || usuario.nombre_usuario || "");
        } else {
            sessionStorage.setItem("usuario_id", usuarioId);
            sessionStorage.setItem("nombre_usuario", usuario.nombre || usuario.nombre_usuario || "");
        }

        // Limpiar perfiles previos de cualquier sesión anterior
        localStorage.removeItem("perfil_id");
        localStorage.removeItem("perfil_nombre");
        sessionStorage.removeItem("perfil_id");
        sessionStorage.removeItem("perfil_nombre");

        mostrarMensaje("Inicio de sesión correcto", "ok");

        // --- DESVÍO DE ROLES (RBAC) ---
        setTimeout(() => {
            const CORREO_ADMIN = "soporte.starview@gmail.com"; // 🚨 Correo actualizado

            if (correo === CORREO_ADMIN) {
                if (mantenerSesion) localStorage.setItem("rol", "admin");
                else sessionStorage.setItem("rol", "admin");

                window.location.href = `${API_BASE}/panel-admin/${usuarioId}`;
            } else {
                // Guardamos el rol como cliente normal
                if (mantenerSesion) localStorage.setItem("rol", "cliente");
                else sessionStorage.setItem("rol", "cliente");

                const volver = localStorage.getItem("volver_despues_login");
                if (volver) {
                    localStorage.removeItem("volver_despues_login");
                    window.location.href = volver;
                } else {
                    window.location.href = "seleccionar-perfil.html";
                }
            }
        }, 500);

    } catch (error) {
        console.log(error);
        if (btnLogin) {
            btnLogin.innerText = textoOriginal;
            btnLogin.disabled = false;
        }
        mostrarMensaje("No se pudo conectar con el servidor");
    }
}

async function pedirCodigoCuenta() {
    const correo = document.getElementById("correoRecuperar").value.trim();
    if (!correo) return mostrarMensajeRecuperacion("Ingresa tu correo primero");

    const boton = document.getElementById("btnPedirCodigo");
    const textoOriginal = boton ? boton.innerText : "Enviar código al correo";
    
    if (boton) { 
        boton.innerText = "Enviando..."; 
        boton.disabled = true; 
    }

    try {
        const res = await fetch(`${API_BASE}/recuperar-cuenta/iniciar`, {
            method: "POST", 
            headers: { "Content-Type": "application/json" }, 
            body: JSON.stringify({ correo })
        });
        const datos = await res.json();
        mostrarMensajeRecuperacion(datos.mensaje, datos.ok ? "ok" : "error");
    } catch(e) { 
        mostrarMensajeRecuperacion("Error de conexión"); 
    }
    
    if (boton) { 
        boton.innerText = textoOriginal; 
        boton.disabled = false; 
    }
}

async function restablecerPasswordCuenta() {
    const correo = document.getElementById("correoRecuperar").value.trim();
    const codigo = document.getElementById("codigoCuenta") ? document.getElementById("codigoCuenta").value.trim() : "";
    const nueva_password = document.getElementById("nuevaPassword").value.trim();

    if (!correo || !codigo || !nueva_password) {
        return mostrarMensajeRecuperacion("Completa todos los campos, incluyendo el código numérico.");
    }

    const btnConfirma = document.querySelector("#modalRecuperacion .btn-primary");
    const textoOriginal = btnConfirma ? btnConfirma.innerText : "Actualizar contraseña";
    
    if (btnConfirma) {
        btnConfirma.innerText = "Cargando...";
        btnConfirma.disabled = true;
    }

    try {
        const res = await fetch(`${API_BASE}/recuperar-cuenta/confirmar`, {
            method: "POST", 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ correo, codigo, nueva_password })
        });
        const datos = await res.json();
        
        if (btnConfirma) {
            btnConfirma.innerText = textoOriginal;
            btnConfirma.disabled = false;
        }

        if (datos.ok) {
            cerrarRecuperacion();
            mostrarMensaje("Contraseña actualizada. Ya puedes iniciar sesión.", "ok");
        } else {
            mostrarMensajeRecuperacion(datos.mensaje);
        }
    } catch(e) { 
        if (btnConfirma) {
            btnConfirma.innerText = textoOriginal;
            btnConfirma.disabled = false;
        }
        mostrarMensajeRecuperacion("Error del servidor"); 
    }
}

document.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        const modal = document.getElementById("modalRecuperacion");
        const modalAbierto = modal && modal.classList.contains("show");

        if (modalAbierto) {
            restablecerPasswordCuenta(); // CORREGIDO: Antes decía restablecerPassword()
        } else {
            iniciarSesion();
        }
    }

    if (event.key === "Escape") {
        cerrarRecuperacion();
    }
})

document.addEventListener("DOMContentLoaded", () => {
    const usuario_id = localStorage.getItem("usuario_id") || sessionStorage.getItem("usuario_id");
    if (usuario_id) {
        window.location.href = "seleccionar-perfil.html";
    }
});
;