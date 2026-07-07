const API_BASE_CUENTA = window.location.origin;
const usuario_id = localStorage.getItem("usuario_id") || sessionStorage.getItem("usuario_id");

document.addEventListener("DOMContentLoaded", async () => {
    if (!usuario_id) {
        window.location.replace("login.html");
        return;
    }

    // Cargar correo actual
    try {
        const res = await fetch(`${API_BASE_CUENTA}/api/cuenta/${usuario_id}`);
        const datos = await res.json();
        if (datos.ok) {
            document.getElementById("correoActual").innerText = datos.correo;
        } else {
            document.getElementById("correoActual").innerText = "No disponible";
        }
    } catch (e) {
        document.getElementById("correoActual").innerText = "Error al cargar";
    }

    let modoCodigo = false;

    // Actualizar Correo
    document.getElementById("btnActualizarCorreo").addEventListener("click", async () => {
        const nuevoCorreo = document.getElementById("nuevoCorreo").value.trim();
        const codigo = document.getElementById("codigoCorreo").value.trim();
        const msg = document.getElementById("msgCorreo");
        msg.innerText = "";
        msg.style.color = "white";

        if (!nuevoCorreo || !nuevoCorreo.includes("@")) {
            msg.innerText = "Por favor, ingresa un correo válido.";
            msg.style.color = "#ffb4b8";
            return;
        }

        if (nuevoCorreo === document.getElementById("correoActual").innerText.trim()) {
            msg.innerText = "El nuevo correo debe ser distinto al actual.";
            msg.style.color = "#ffb4b8";
            return;
        }

        if (!modoCodigo) {
            // Paso 1: Solicitar código
            try {
                const res = await fetch(`${API_BASE_CUENTA}/api/cuenta/correo/solicitar`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        usuario_id, 
                        nuevo_correo: nuevoCorreo, 
                        nombre: localStorage.getItem("nombre_usuario") || sessionStorage.getItem("nombre_usuario") || "Usuario" 
                    })
                });
                const datos = await res.json();

                if (datos.ok) {
                    modoCodigo = true;
                    document.getElementById("seccionCodigoCorreo").style.display = "block";
                    document.getElementById("nuevoCorreo").disabled = true;
                    document.getElementById("btnActualizarCorreo").innerText = "Confirmar Cambio";
                    msg.innerText = "Código enviado. Revisa tu bandeja de entrada.";
                    msg.style.color = "#4caf50";
                } else {
                    msg.innerText = datos.mensaje || "Error al solicitar código.";
                    msg.style.color = "#ffb4b8";
                }
            } catch (e) {
                msg.innerText = "Error de conexión.";
                msg.style.color = "#ffb4b8";
            }
        } else {
            // Paso 2: Confirmar código
            if (!codigo) {
                msg.innerText = "Por favor, ingresa el código de 6 dígitos.";
                msg.style.color = "#ffb4b8";
                return;
            }

            try {
                const res = await fetch(`${API_BASE_CUENTA}/api/cuenta/correo/confirmar`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ usuario_id, nuevo_correo: nuevoCorreo, codigo })
                });
                const datos = await res.json();

                if (datos.ok) {
                    msg.innerText = "Correo actualizado correctamente.";
                    msg.style.color = "#4caf50";
                    document.getElementById("correoActual").innerText = nuevoCorreo;
                    document.getElementById("nuevoCorreo").value = "";
                    document.getElementById("nuevoCorreo").disabled = false;
                    document.getElementById("codigoCorreo").value = "";
                    document.getElementById("seccionCodigoCorreo").style.display = "none";
                    document.getElementById("btnActualizarCorreo").innerText = "Siguiente (Enviar Código)";
                    modoCodigo = false;
                } else {
                    msg.innerText = datos.mensaje || "Código inválido.";
                    msg.style.color = "#ffb4b8";
                }
            } catch (e) {
                msg.innerText = "Error de conexión.";
                msg.style.color = "#ffb4b8";
            }
        }
    });

    // Actualizar Contraseña
    document.getElementById("btnActualizarPassword").addEventListener("click", async () => {
        const passwordActual = document.getElementById("passwordActual").value.trim();
        const nuevoPassword = document.getElementById("nuevoPassword").value.trim();
        const msg = document.getElementById("msgPassword");
        msg.innerText = "";
        msg.style.color = "white";

        if (!passwordActual || !nuevoPassword) {
            msg.innerText = "Ambos campos de contraseña son requeridos.";
            msg.style.color = "#ffb4b8";
            return;
        }

        if (nuevoPassword.length < 6) {
            msg.innerText = "La nueva contraseña debe tener al menos 6 caracteres.";
            msg.style.color = "#ffb4b8";
            return;
        }

        try {
            const res = await fetch(`${API_BASE_CUENTA}/api/cuenta/password`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ usuario_id, password_actual: passwordActual, password_nueva: nuevoPassword })
            });
            const datos = await res.json();

            if (datos.ok) {
                msg.innerText = "Contraseña actualizada correctamente.";
                msg.style.color = "#4caf50";
                document.getElementById("passwordActual").value = "";
                document.getElementById("nuevoPassword").value = "";
            } else {
                msg.innerText = datos.mensaje || "Error al actualizar contraseña.";
                msg.style.color = "#ffb4b8";
            }
        } catch (e) {
            msg.innerText = "Error de conexión.";
            msg.style.color = "#ffb4b8";
        }
    });

    // Cerrar sesión global
    document.getElementById("btnCerrarSesiones").addEventListener("click", async () => {
        if (!confirm("¿Estás seguro de cerrar tu sesión en TODOS los dispositivos? Deberás iniciar sesión nuevamente en todos lados.")) return;

        try {
            const res = await fetch(`${API_BASE_CUENTA}/api/cuenta/cerrar-sesiones`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ usuario_id })
            });
            const datos = await res.json();

            if (datos.ok) {
                alert("Sesiones cerradas en todos los dispositivos. Por favor, inicia sesión nuevamente.");
                localStorage.clear();
                sessionStorage.clear();
                window.location.replace("login.html");
            } else {
                alert(datos.mensaje || "Error al cerrar sesiones.");
            }
        } catch (e) {
            alert("Error de conexión al servidor.");
        }
    });
});

// ==========================================
// HEARTBEAT DE SEGURIDAD (CIERRE GLOBAL)
// ==========================================
(function iniciarHeartbeatGlobal() {
    setInterval(async () => {
        const usuario_id = localStorage.getItem("usuario_id") || sessionStorage.getItem("usuario_id");
        if (!usuario_id) return;
        try {
            const respuesta = await fetch(window.location.origin + "/api/usuario/ping", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    usuario_id: usuario_id,
                    sesion_version: localStorage.getItem("sesion_version") || sessionStorage.getItem("sesion_version") || 1
                })
            });
            const datos = await respuesta.json();
            if (datos.sesionCerrada) {
                localStorage.clear();
                sessionStorage.clear();
                window.location.replace("login.html");
            }
        } catch (error) {}
    }, 15000);
})();
