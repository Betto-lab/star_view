const API_BASE = window.location.origin;

let metodoPagoSeleccionado = "Tarjeta simulada";

function cerrarSesion() {
    localStorage.clear();
    window.location.href = "index.html";
}

function mostrarMensajePago(texto, tipo = "error") {
    const mensaje = document.getElementById("mensajePago");

    if (!mensaje) return;

    mensaje.innerText = texto;
    mensaje.style.color = tipo === "ok" ? "#86efac" : "#ffb4b8";
}

function validarAccesoPago() {
    const usuario_id = localStorage.getItem("usuario_id");
    const plan_id = localStorage.getItem("plan_id");
    const plan_precio = localStorage.getItem("plan_precio");

    if (!usuario_id || usuario_id === "undefined" || usuario_id === "null") {
        localStorage.removeItem("usuario_id");
        localStorage.setItem("volver_despues_login", "pago.html");
        window.location.href = "login.html";
        return false;
    }

    if (!plan_id || plan_id === "undefined" || plan_id === "null") {
        window.location.href = "planes.html#seleccionar-plan";
        return false;
    }

    if (!plan_precio || plan_precio === "undefined" || plan_precio === "null") {
        window.location.href = "planes.html#seleccionar-plan";
        return false;
    }

    return true;
}

function cargarResumenPago() {
    const plan_nombre = localStorage.getItem("plan_nombre");
    const plan_precio = localStorage.getItem("plan_precio");

    const nombrePlan = document.getElementById("nombrePlan");
    const precioPlan = document.getElementById("precioPlan");
    const totalPago = document.getElementById("totalPago");

    if (nombrePlan) {
        nombrePlan.innerText = plan_nombre || "Plan seleccionado";
    }

    if (precioPlan) {
        precioPlan.innerText = `S/ ${Number(plan_precio || 0).toFixed(2)}`;
    }

    if (totalPago) {
        totalPago.innerText = `S/ ${Number(plan_precio || 0).toFixed(2)}`;
    }
}

function ocultarPanelesPago() {
    const paneles = document.querySelectorAll(".payment-panel");

    paneles.forEach(panel => {
        panel.classList.remove("active-panel");
    });
}

function seleccionarMetodoPago(metodo, elemento) {
    metodoPagoSeleccionado = metodo;

    document.querySelectorAll(".payment-option").forEach(opcion => {
        opcion.classList.remove("active");
    });

    elemento.classList.add("active");

    const input = elemento.querySelector("input");

    if (input) {
        input.checked = true;
    }

    ocultarPanelesPago();

    if (metodo === "Tarjeta simulada") {
        document.getElementById("datosTarjeta").classList.add("active-panel");
    }

    if (metodo === "Yape / Plin simulado") {
        document.getElementById("datosYape").classList.add("active-panel");
    }

    if (metodo === "PayPal simulado") {
        document.getElementById("datosPaypal").classList.add("active-panel");
    }

    mostrarMensajePago("");
}

function validarCorreo(correo) {
    const expresion = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return expresion.test(correo);
}

function validarDatosTarjeta() {
    const numero = document.getElementById("numeroTarjeta").value.trim();
    const vencimiento = document.getElementById("vencimientoTarjeta").value.trim();
    const cvv = document.getElementById("cvvTarjeta").value.trim();

    if (!numero || !vencimiento || !cvv) {
        mostrarMensajePago("Completa los datos de la tarjeta simulada");
        return false;
    }

    if (numero.replaceAll(" ", "").length < 12) {
        mostrarMensajePago("El número de tarjeta simulado no es válido");
        return false;
    }

    if (!/^\d{2}\/\d{2}$/.test(vencimiento)) {
        mostrarMensajePago("El vencimiento debe tener formato MM/AA");
        return false;
    }

    if (!/^\d{3}$/.test(cvv)) {
        mostrarMensajePago("El CVV debe tener 3 dígitos");
        return false;
    }

    return true;
}

function validarDatosYape() {
    const numero = document.getElementById("numeroYape").value.trim();
    const titular = document.getElementById("titularYape").value.trim();
    const codigo = document.getElementById("codigoYape").value.trim();

    if (!numero || !titular || !codigo) {
        mostrarMensajePago("Completa número, titular y código de operación de Yape / Plin");
        return false;
    }

    if (!/^9\d{8}$/.test(numero)) {
        mostrarMensajePago("El número de celular debe tener 9 dígitos y empezar con 9");
        return false;
    }

    if (titular.length < 3) {
        mostrarMensajePago("Ingresa un nombre de titular válido");
        return false;
    }

    if (codigo.length < 6) {
        mostrarMensajePago("Ingresa un código de operación válido");
        return false;
    }

    return true;
}

function validarDatosPaypal() {
    const correo = document.getElementById("correoPaypal").value.trim();
    const codigo = document.getElementById("codigoPaypal").value.trim();

    if (!correo || !codigo) {
        mostrarMensajePago("Completa correo PayPal y código de operación");
        return false;
    }

    if (!validarCorreo(correo)) {
        mostrarMensajePago("Ingresa un correo PayPal válido");
        return false;
    }

    if (codigo.length < 6) {
        mostrarMensajePago("Ingresa un código de operación válido");
        return false;
    }

    return true;
}

function validarDatosPago() {
    if (metodoPagoSeleccionado === "Tarjeta simulada") {
        return validarDatosTarjeta();
    }

    if (metodoPagoSeleccionado === "Yape / Plin simulado") {
        return validarDatosYape();
    }

    if (metodoPagoSeleccionado === "PayPal simulado") {
        return validarDatosPaypal();
    }

    mostrarMensajePago("Selecciona un método de pago");
    return false;
}

async function confirmarPago(event) {
    if (event) {
        event.preventDefault();
    }

    if (!validarAccesoPago()) return;
    if (!validarDatosPago()) return;

    const usuario_id = localStorage.getItem("usuario_id");
    const plan_id = localStorage.getItem("plan_id");
    const plan_precio = localStorage.getItem("plan_precio");

    try {
        const respuesta = await fetch(`${API_BASE}/pagos`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                usuario_id: usuario_id,
                plan_id: plan_id,
                metodo_pago: metodoPagoSeleccionado,
                monto: plan_precio
            })
        });

        const datos = await respuesta.json();

        if (!datos.ok) {
            mostrarMensajePago(datos.mensaje || "No se pudo procesar el pago");
            return;
        }

        mostrarMensajePago("Pago realizado correctamente. Suscripción activada.", "ok");

        localStorage.removeItem("plan_id");
        localStorage.removeItem("plan_nombre");
        localStorage.removeItem("plan_precio");

        setTimeout(() => {
            window.location.href = "seleccionar-perfil.html";
        }, 900);

    } catch (error) {
        console.log("Error al confirmar pago:", error);
        mostrarMensajePago("No se pudo conectar con el servidor");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    if (validarAccesoPago()) {
        cargarResumenPago();
    }
});