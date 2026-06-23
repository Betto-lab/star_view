const API_BASE = window.location.origin;

let metodoPagoSeleccionado = "Mercado Pago";

function cerrarSesion() {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = "index.html";
}

function mostrarMensajePago(texto, tipo = "error") {
    const mensaje = document.getElementById("mensajePago");

    if (!mensaje) return;

    mensaje.innerText = texto;
    mensaje.style.color = tipo === "ok" ? "#86efac" : "#ffb4b8";
}

function validarAccesoPago() {
    const usuario_id = localStorage.getItem("usuario_id") || sessionStorage.getItem("usuario_id");
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

// Variable global para guardar el precio real calculado por el servidor
let montoFinalProrrateo = 0;

async function cargarResumenPago() {
    const usuario_id = localStorage.getItem("usuario_id") || sessionStorage.getItem("usuario_id");
    const plan_id = localStorage.getItem("plan_id");

    const nombrePlan = document.getElementById("nombrePlan");
    const precioPlan = document.getElementById("precioPlan");
    const totalPago = document.getElementById("totalPago");
    const resumenContenedor = document.querySelector(".pago-resumen");

    try {
        // Llamamos al servidor para que haga la matemática
        const respuesta = await fetch(`${API_BASE}/api/pagos/calcular/${usuario_id}/${plan_id}`);
        const calculo = await respuesta.json();

        if (calculo.ok) {
            nombrePlan.innerText = calculo.plan_nombre;
            precioPlan.innerText = `S/ ${calculo.precio_original}`;
            
            montoFinalProrrateo = calculo.total_pagar; // Guardamos el precio final

            // Si hay un descuento por cambio de plan, agregamos una fila en verde mostrando el cálculo
            if (calculo.es_upgrade && calculo.descuento > 0) {
                // Removemos la fila de descuento si ya existía para no duplicarla
                const filaDescuentoAntigua = document.getElementById("filaDescuentoProrrateo");
                if (filaDescuentoAntigua) filaDescuentoAntigua.remove();

                const filaDescuento = document.createElement("div");
                filaDescuento.id = "filaDescuentoProrrateo";
                filaDescuento.className = "detail-row";
                filaDescuento.style.color = "#86efac"; // Color verde
                filaDescuento.innerHTML = `
                    <span>Saldo a favor (${calculo.dias_restantes} días no usados)</span>
                    <strong>- S/ ${calculo.descuento}</strong>
                `;
                
                // Lo insertamos justo antes del "Total a pagar"
                resumenContenedor.insertBefore(filaDescuento, document.querySelector(".total-row"));
            }

            totalPago.innerText = `S/ ${calculo.total_pagar}`;
        }
    } catch (error) {
        console.error("Error al calcular el precio:", error);
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

    if (elemento) {
        elemento.classList.add("active");

        const input = elemento.querySelector("input");

        if (input) {
            input.checked = true;
        }
    }

    ocultarPanelesPago();

    const datosTarjeta = document.getElementById("datosTarjeta");
    const datosYape = document.getElementById("datosYape");
    const datosPaypal = document.getElementById("datosPaypal");

    if (metodo === "Tarjeta simulada" && datosTarjeta) {
        datosTarjeta.classList.add("active-panel");
    }

    if (metodo === "Yape / Plin simulado" && datosYape) {
        datosYape.classList.add("active-panel");
    }

    if (metodo === "PayPal simulado" && datosPaypal) {
        datosPaypal.classList.add("active-panel");
    }

    mostrarMensajePago("");
}

async function confirmarPago(event) {
    if (event) {
        event.preventDefault();
    }

    if (!validarAccesoPago()) return;

    const botonPago = document.querySelector("button[type='submit'], .btn-pagar, #btnPagar");

    const usuario_id = localStorage.getItem("usuario_id") || sessionStorage.getItem("usuario_id");
    const plan_id = localStorage.getItem("plan_id");
    const plan_nombre = localStorage.getItem("plan_nombre");
    const plan_precio = localStorage.getItem("plan_precio");

    if (!usuario_id || !plan_id || !plan_precio) {
        mostrarMensajePago("No se encontró el usuario o el plan seleccionado.");
        return;
    }

    try {
        if (botonPago) {
            botonPago.disabled = true;
            botonPago.innerText = "Redirigiendo a Mercado Pago...";
        }

        mostrarMensajePago("Creando pago seguro con Mercado Pago...", "ok");

        localStorage.setItem("plan_id_pendiente", plan_id);
        localStorage.setItem("plan_nombre_pendiente", plan_nombre || "");
        localStorage.setItem("plan_precio_pendiente", plan_precio);

        // AQUÍ ESTÁ EL CAMBIO: Enviamos el montoFinalProrrateo
        const respuesta = await fetch(`${API_BASE}/mercadopago/crear-preferencia`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                usuario_id,
                plan_id,
                monto_calculado: typeof montoFinalProrrateo !== 'undefined' ? montoFinalProrrateo : plan_precio
            })
        });

        const datos = await respuesta.json();

        if (!datos.ok) {
            mostrarMensajePago(datos.mensaje || "No se pudo iniciar el pago con Mercado Pago");
            if (botonPago) {
                botonPago.disabled = false;
                botonPago.innerText = "Confirmar pago";
            }
            return;
        }

        // SOLO aceptamos enlaces de cobro real (producción)
        const urlPago = datos.init_point;

        if (!urlPago) {
            mostrarMensajePago("Error de seguridad: La pasarela no está configurada para cobros reales.");
            if (botonPago) {
                botonPago.disabled = false;
                botonPago.innerText = "Confirmar pago";
            }
            return;
        }

        // Si todo está correcto, lo enviamos a pagar
        window.location.href = urlPago;

    } catch (error) {
        console.log("Error al crear preferencia de Mercado Pago:", error);
        mostrarMensajePago("No se pudo conectar con Mercado Pago.");
        if (botonPago) {
            botonPago.disabled = false;
            botonPago.innerText = "Confirmar pago";
        }
    }
}

document.addEventListener("DOMContentLoaded", () => {
    if (validarAccesoPago()) {
        cargarResumenPago();
    }

    const formularioPago = document.getElementById("formPago");

    if (formularioPago) {
        formularioPago.addEventListener("submit", confirmarPago);
    }
});