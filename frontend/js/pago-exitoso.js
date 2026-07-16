const API_BASE = window.location.origin;

async function registrarPagoExitoso() {
    const params = new URLSearchParams(window.location.search);

    const usuario_id =
        params.get("usuario_id") ||
        localStorage.getItem("usuario_id") ||
        sessionStorage.getItem("usuario_id");

    const plan_id =
        params.get("plan_id") ||
        localStorage.getItem("plan_id") ||
        localStorage.getItem("plan_id_pendiente");

    const monto =
        params.get("monto") ||
        localStorage.getItem("plan_precio") ||
        localStorage.getItem("plan_precio_pendiente");

    const mensaje = document.getElementById("mensajePago");
    const btnContinuar = document.getElementById("btnContinuar");

    if (!mensaje) return;

    if (!usuario_id || !plan_id || !monto) {
        mensaje.innerText = "No se pudieron recuperar los datos del pago. Inicia sesión nuevamente.";
        if (btnContinuar) {
            btnContinuar.style.display = "inline-block";
            btnContinuar.innerText = "Volver a perfiles";
        }
        return;
    }

    try {
        mensaje.innerText = "Pago aprobado. Activando tu suscripción...";

        const respuesta = await fetch(`${API_BASE}/pagos`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                usuario_id,
                plan_id,
                metodo_pago: "Mercado Pago",
                monto
            })
        });

        const datos = await respuesta.json();

        if (!datos.ok) {
            mensaje.innerText = datos.mensaje || "El pago fue realizado, pero no se pudo activar la suscripción.";
            if (btnContinuar) {
                btnContinuar.style.display = "inline-block";
            }
            return;
        }

        localStorage.removeItem("plan_id");
        localStorage.removeItem("plan_nombre");
        localStorage.removeItem("plan_precio");

        localStorage.removeItem("plan_id_pendiente");
        localStorage.removeItem("plan_nombre_pendiente");
        localStorage.removeItem("plan_precio_pendiente");

        mensaje.innerText = "Tu suscripción fue activada correctamente.";

        if (btnContinuar) {
            btnContinuar.style.display = "inline-block";
        }

        setTimeout(() => {
            window.location.href = "seleccionar-perfil.html";
        }, 1800);

    } catch (error) {
        console.log("Error al registrar pago exitoso:", error);

        mensaje.innerText = "No se pudo conectar con el servidor para activar la suscripción.";

        if (btnContinuar) {
            btnContinuar.style.display = "inline-block";
        }
    }
}

document.addEventListener("DOMContentLoaded", registrarPagoExitoso);

// Escuchar cambios de sesión en otras pestañas
window.addEventListener("storage", (event) => {
    if (event.key === "usuario_id" || event.key === "rol" || event.key === "perfil_id" || event.key === null) {
        window.location.reload();
    }
});