const API_BASE = window.location.origin;
const usuario_id = (localStorage.getItem("usuario_id") || sessionStorage.getItem("usuario_id"));

function cerrarSesion() {
    localStorage.clear(); sessionStorage.clear();
}

function protegerSesion() {
    if (!usuario_id) {
        window.location.href = "login.html";
        return false;
    }

    return true;
}

function fechaLocal(fecha) {
    if (!fecha) return "No definido";
    return new Date(fecha).toLocaleDateString();
}

async function cargarFacturacion() {
    if (!protegerSesion()) return;

    const contenedor = document.getElementById("tablaPagos");

    try {
        const respuesta = await fetch(`${API_BASE}/facturacion/${usuario_id}`);
        const pagos = await respuesta.json();

        contenedor.innerHTML = "";

        if (!pagos || pagos.length === 0) {
            contenedor.innerHTML = `
                <tr>
                    <td colspan="6">Aún no tienes pagos registrados.</td>
                </tr>
            `;
            return;
        }

        pagos.forEach(pago => {
            contenedor.innerHTML += `
                <tr>
                    <td>${fechaLocal(pago.fecha_pago)}</td>
                    <td>${pago.plan_nombre}</td>
                    <td>S/ ${Number(pago.monto).toFixed(2)}</td>
                    <td>${pago.metodo_pago}</td>
                    <td>${pago.estado}</td>
                    <td>
                        <button class="table-btn" onclick="descargarRecibo(${pago.id})">
                            Descargar
                        </button>
                    </td>
                </tr>
            `;
        });
    } catch (error) {
        contenedor.innerHTML = `
            <tr>
                <td colspan="6">No se pudo cargar la facturación.</td>
            </tr>
        `;
    }
}

// Agrega esta función en tu js/facturacion.js
function descargarRecibo(pago_id) {
    // Abre una nueva pestaña que cargará el HTML del servidor y lanzará la ventana de impresión
    window.open(`${window.location.origin}/api/pagos/recibo/${pago_id}`, '_blank');
}

cargarFacturacion();
