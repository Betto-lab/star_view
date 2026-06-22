const API_BASE = window.location.origin;

let correoPendiente = "";

/* ==========================================
   UTILIDADES Y MENSAJES
========================================== */
function mostrarMensaje(texto, tipo = "error") {
    const mensaje = document.getElementById("mensaje");

    if (!mensaje) return;

    mensaje.innerText = texto;
    mensaje.style.color = tipo === "ok" ? "#86efac" : "#ffb4b8";
}

function mostrarMensajeVerificacion(texto, tipo = "error") {
    const mensaje = document.getElementById("mensajeVerificacion");

    if (!mensaje) return;

    mensaje.innerText = texto;
    mensaje.style.color = tipo === "ok" ? "#86efac" : "#ffb4b8";
}

/* ==========================================
   VALIDACIONES FRONTEND
========================================== */
function validarCorreo(correo) {
    // Validación de formato estricto (Rechaza errores de tipeo y formatos inválidos)
    const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
    return regex.test(correo);
}

function validarNombre(nombre) {
    const expresion = /^[A-Za-záéíóúÁÉÍÓÚñÑ\s]+$/;
    return expresion.test(nombre);
}

function validarPassword(password) {
    const tieneLongitud = password.length >= 8;
    const tieneNumero = /\d/.test(password);
    const tieneSimbolo = /[!@#$%^&*(),.?":{}|<>_\-+=/\\[\];'`~]/.test(password);

    return {
        tieneLongitud,
        tieneNumero,
        tieneSimbolo,
        valida: tieneLongitud && tieneNumero && tieneSimbolo
    };
}

/* ==========================================
   UI CONTRASEÑA Y FORTALEZA
========================================== */
function visualizarPasswordRegistro() {
    const passwordInput = document.getElementById("password");
    const boton = document.querySelector(".password-toggle");

    if (!passwordInput || !boton) return;

    if (passwordInput.type === "password") {
        passwordInput.type = "text";
        boton.innerText = "Ocultar";
    } else {
        passwordInput.type = "password";
        boton.innerText = "Ver";
    }
}

function calcularFortalezaPassword(password) {
    let puntos = 0;

    if (password.length >= 8) puntos++;
    if (password.length >= 12) puntos++;
    if (/[a-z]/.test(password)) puntos++;
    if (/[A-Z]/.test(password)) puntos++;
    if (/\d/.test(password)) puntos++;
    if (/[!@#$%^&*(),.?":{}|<>_\-+=/\\[\];'`~]/.test(password)) puntos++;

    if (password.length === 0) {
        return {
            nivel: "empty",
            texto: "Escribe una contraseña",
            porcentaje: "0%"
        };
    }

    if (puntos <= 2) {
        return {
            nivel: "weak",
            texto: "Contraseña débil",
            porcentaje: "33%"
        };
    }

    if (puntos <= 4) {
        return {
            nivel: "moderate",
            texto: "Contraseña normal",
            porcentaje: "66%"
        };
    }

    return {
        nivel: "strong",
        texto: "Contraseña fuerte",
        porcentaje: "100%"
    };
}

function actualizarReglasPassword() {
    const passwordInput = document.getElementById("password");

    if (!passwordInput) return;

    const password = passwordInput.value;
    const reglas = validarPassword(password);

    const ruleLength = document.getElementById("ruleLength");
    const ruleNumber = document.getElementById("ruleNumber");
    const ruleSymbol = document.getElementById("ruleSymbol");

    if (ruleLength) {
        ruleLength.className = reglas.tieneLongitud ? "rule-ok" : "rule-error";
    }

    if (ruleNumber) {
        ruleNumber.className = reglas.tieneNumero ? "rule-ok" : "rule-error";
    }

    if (ruleSymbol) {
        ruleSymbol.className = reglas.tieneSimbolo ? "rule-ok" : "rule-error";
    }

    const strengthBox = document.getElementById("passwordStrengthBox");
    const strengthBar = document.getElementById("strengthBar");
    const strengthText = document.getElementById("strengthText");

    const fortaleza = calcularFortalezaPassword(password);

    if (strengthBox) {
        strengthBox.className = `password-strength-box ${fortaleza.nivel}`;
    }

    if (strengthBar) {
        strengthBar.style.width = fortaleza.porcentaje;
    }

    if (strengthText) {
        strengthText.innerText = fortaleza.texto;
    }
}

/* ==========================================
   MODAL DE VERIFICACIÓN
========================================== */
function abrirModalVerificacion() {
    const codigoVerificacion = document.getElementById("codigoVerificacion");
    const modalVerificacion = document.getElementById("modalVerificacion");

    if (codigoVerificacion) {
        codigoVerificacion.value = "";
    }

    mostrarMensajeVerificacion("");

    if (modalVerificacion) {
        modalVerificacion.classList.add("show");
    }
}

function cerrarModalVerificacion() {
    const modalVerificacion = document.getElementById("modalVerificacion");

    if (modalVerificacion) {
        modalVerificacion.classList.remove("show");
    }
}

/* ==========================================
   PROCESO DE REGISTRO
========================================== */
async function registrarUsuario() {
    const nombre = document.getElementById("nombre").value.trim();
    const correo = document.getElementById("correo").value.trim();
    const password = document.getElementById("password").value.trim();

    // 1. Validaciones básicas en el navegador
    if (!nombre || !correo || !password) {
        mostrarMensaje("Completa todos los campos");
        return;
    }

    if (!validarNombre(nombre)) {
        mostrarMensaje("El nombre solo puede contener letras y espacios");
        return;
    }

    if (!validarCorreo(correo)) {
        mostrarMensaje("Ingresa un correo electrónico con formato válido");
        return;
    }

    const validacionPassword = validarPassword(password);

    if (!validacionPassword.valida) {
        mostrarMensaje("La contraseña debe tener mínimo 8 caracteres, 1 número y 1 símbolo");
        return;
    }

    // 2. Preparación UI
    const btnRegistro = document.getElementById("btnRegistro") || document.querySelector(".btn-full");
    const textoOriginal = btnRegistro ? btnRegistro.innerText : "Crear cuenta";

    if (btnRegistro) {
        btnRegistro.innerText = "Enviando código...";
        btnRegistro.disabled = true;
    }

    mostrarMensaje("Validando correo y enviando código...", "ok");

    // 3. Envío al servidor (Backend se encarga de la validación DNS profunda)
    try {
        const respuesta = await fetch(`${API_BASE}/registro`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                nombre,
                correo,
                password
            })
        });

        const datos = await respuesta.json();

        if (btnRegistro) {
            btnRegistro.innerText = textoOriginal;
            btnRegistro.disabled = false;
        }

        if (!datos.ok) {
            mostrarMensaje(datos.mensaje || "No se pudo registrar el usuario");
            return;
        }

        correoPendiente = correo;

        mostrarMensaje("Código enviado. Revisa tu bandeja de entrada.", "ok");
        abrirModalVerificacion();

    } catch (error) {
        console.log(error);

        if (btnRegistro) {
            btnRegistro.innerText = textoOriginal;
            btnRegistro.disabled = false;
        }

        mostrarMensaje("No se pudo conectar con el servidor");
    }
}

/* ==========================================
   VERIFICACIÓN DE CÓDIGO
========================================== */
async function verificarCodigoRegistro() {
    const codigoIngresado = document.getElementById("codigoVerificacion").value.trim();

    if (!codigoIngresado) {
        mostrarMensajeVerificacion("Ingresa el código de verificación");
        return;
    }

    try {
        const respuesta = await fetch(`${API_BASE}/registro/verificar`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                correo: correoPendiente,
                codigo: codigoIngresado
            })
        });

        const datos = await respuesta.json();

        if (!datos.ok) {
            mostrarMensajeVerificacion(datos.mensaje || "Código incorrecto");
            return;
        }

        // Limpieza de datos antiguos e inicio de sesión
        localStorage.setItem("usuario_id", datos.usuario.id);
        localStorage.setItem("nombre_usuario", datos.usuario.nombre);
        localStorage.removeItem("perfil_id");
        localStorage.removeItem("perfil_nombre");

        mostrarMensajeVerificacion("Registro exitoso. Ahora elige un plan para continuar.", "ok");

        setTimeout(() => {
            cerrarModalVerificacion();
            window.location.replace("planes.html");
        }, 1200);

    } catch (error) {
        console.log(error);
        mostrarMensajeVerificacion("No se pudo conectar con el servidor");
    }
}

/* ==========================================
   EVENTOS
========================================== */
document.addEventListener("DOMContentLoaded", () => {
    const inputNombre = document.getElementById("nombre");

    if (inputNombre) {
        inputNombre.addEventListener("input", function () {
            this.value = this.value.replace(/[^A-Za-záéíóúÁÉÍÓÚñÑ\s]/g, "");
        });
    }

    const passwordInput = document.getElementById("password");

    if (passwordInput) {
        passwordInput.addEventListener("input", actualizarReglasPassword);
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        const modalAbierto = document.getElementById("modalVerificacion")?.classList.contains("show");

        if (modalAbierto) {
            verificarCodigoRegistro();
        } else {
            registrarUsuario();
        }
    }

    if (event.key === "Escape") {
        cerrarModalVerificacion();
    }
});